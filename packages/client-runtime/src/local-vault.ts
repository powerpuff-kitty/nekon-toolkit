export const V1_LOCAL_VAULT_POLICY = Object.freeze({
  formatVersion: 1,
  kdfId: "argon2id-v1",
  kdfMemoryKiB: 64 * 1_024,
  kdfIterations: 3,
  kdfParallelism: 1,
  saltBytes: 16,
  keyBytes: 32,
  nonceBytes: 12,
  tagBits: 128,
  minUnlockSecretBytes: 12,
  maxUnlockSecretBytes: 1_024,
  maxRecordBytes: 16 * 1_024 * 1_024,
  inactivityLockMs: 5 * 60 * 1_000,
});

const HEADER_KEY = "header";
const HEADER_AAD_DOMAIN = "NEKON-LOCAL-VAULT-HEADER-V1\0";
const RECORD_AAD_DOMAIN = "NEKON-LOCAL-VAULT-RECORD-V1\0";

export type LocalVaultState = "locked" | "unlocked" | "corrupt" | "destroyed";

export type VaultRecordKind =
  | "account_root"
  | "account_manifest"
  | "mls_state"
  | "recovery_material"
  | "history_key"
  | "attachment_key"
  | "attachment_upload"
  | "identity_trust"
  | "identity_genome"
  | "anonymous_persona"
  | "anonymous_room_draft"
  | "anonymous_admission"
  | "anonymous_abuse_token_pool"
  | "anonymous_abuse_prefetch"
  | "anonymous_traffic_schedule"
  | "anonymous_outbound_batch"
  | "anonymous_message_fanout"
  | "anonymous_recipient_directory"
  | "anonymous_recipient_offer_collection"
  | "anonymous_membership_consent"
  | "anonymous_membership_admission"
  | "anonymous_message_order"
  | "anonymous_active_room"
  | "anonymous_active_mailbox_registration"
  | "p2p_endpoint_directory"
  | "device_operation"
  | "request_operation"
  | "enterprise_provisioning"
  | "webauthn_operation"
  | "guest_room_invitation"
  | "guest_room_provisioning";

export interface VaultHeaderV1 {
  readonly formatVersion: 1;
  readonly vaultId: string;
  readonly headerRevision: number;
  readonly kdf: {
    readonly id: "argon2id-v1";
    readonly memoryKiB: number;
    readonly iterations: number;
    readonly parallelism: number;
    readonly salt: Uint8Array;
  };
  readonly wrappingCipher: "AES-256-GCM";
  readonly wrapNonce: Uint8Array;
  readonly wrappedDataKey: Uint8Array;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface EncryptedVaultRecordV1 {
  readonly formatVersion: 1;
  readonly vaultId: string;
  readonly recordId: string;
  readonly kind: VaultRecordKind;
  readonly revision: number;
  readonly deleted: boolean;
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly updatedAt: number;
}

export interface VaultReadResult {
  readonly plaintext: Uint8Array;
  readonly revision: number;
}

export interface VaultRecordState {
  readonly revision: number;
  readonly deleted: boolean;
}

export interface VaultRecordCas {
  readonly record: EncryptedVaultRecordV1;
  readonly expectedRevision: number;
}

export interface VaultRecordMutation {
  readonly recordId: string;
  readonly kind: VaultRecordKind;
  readonly expectedRevision: number;
  /** Omit plaintext to write an authenticated tombstone. */
  readonly plaintext?: Uint8Array;
}

export interface LocalVaultStorage {
  readHeader(): Promise<unknown | null>;
  createHeader(header: VaultHeaderV1): Promise<void>;
  replaceHeader(header: VaultHeaderV1, expectedRevision: number): Promise<void>;
  readRecord(recordId: string): Promise<unknown | null>;
  compareAndSwapRecord(
    record: EncryptedVaultRecordV1,
    expectedRevision: number,
  ): Promise<void>;
  compareAndSwapRecords(entries: readonly VaultRecordCas[]): Promise<void>;
  clear(): Promise<void>;
}

export type VaultKeyDeriver = (
  normalizedUnlockSecret: Uint8Array,
  salt: Uint8Array,
) => Uint8Array | Promise<Uint8Array>;

export interface LocalSecretVaultOptions {
  readonly storage: LocalVaultStorage;
  readonly deriveKey: VaultKeyDeriver;
  readonly crypto?: Crypto;
  readonly now?: () => number;
  /** Null keeps the vault unlocked only for the current in-memory page session. */
  readonly inactivityLockMs?: number | null;
}

interface VaultOperationLease {
  readonly generation: number;
  readonly header: VaultHeaderV1;
  readonly dataKey: CryptoKey;
}

/**
 * Encrypts secret records before persistence. The data key exists as an
 * extractable byte array only during creation/unlock and is immediately
 * re-imported as a non-extractable Web Crypto key.
 */
export class LocalSecretVault {
  readonly #storage: LocalVaultStorage;
  readonly #deriveKey: VaultKeyDeriver;
  readonly #crypto: Crypto;
  readonly #now: () => number;
  #inactivityLockMs: number | null;
  #state: LocalVaultState = "locked";
  #header: VaultHeaderV1 | undefined;
  #dataKey: CryptoKey | undefined;
  #lockDeadline: number | null = null;
  #sessionGeneration = 0;
  #activeOperations = 0;
  readonly #drainWaiters = new Set<() => void>();

  constructor(options: LocalSecretVaultOptions) {
    if (
      options.inactivityLockMs !== null &&
      !Number.isSafeInteger(options.inactivityLockMs ?? 0) &&
      options.inactivityLockMs !== undefined
    ) {
      throw new Error("invalid_vault_inactivity_timeout");
    }
    const inactivityLockMs =
      options.inactivityLockMs === undefined
        ? V1_LOCAL_VAULT_POLICY.inactivityLockMs
        : options.inactivityLockMs;
    if (
      inactivityLockMs !== null &&
      (inactivityLockMs < 60_000 || inactivityLockMs > 30 * 60_000)
    ) {
      throw new Error("invalid_vault_inactivity_timeout");
    }
    this.#storage = options.storage;
    this.#deriveKey = options.deriveKey;
    this.#crypto = options.crypto ?? globalThis.crypto;
    this.#now = options.now ?? Date.now;
    this.#inactivityLockMs = inactivityLockMs;
    if (!this.#crypto?.subtle) {
      throw new Error("web_crypto_required");
    }
  }

  get state(): LocalVaultState {
    this.#enforceDeadline();
    return this.#state;
  }

  get lockDeadline(): number | null {
    this.#enforceDeadline();
    return this.#state === "unlocked" ? this.#lockDeadline : null;
  }

  get inactivityLockMs(): number | null {
    return this.#inactivityLockMs;
  }

  async create(unlockSecret: string): Promise<void> {
    this.#requireState("locked");
    const now = this.#checkedNow();
    const vaultId = `vault_${encodeBase64Url(this.#randomBytes(16))}`;
    const salt = this.#randomBytes(V1_LOCAL_VAULT_POLICY.saltBytes);
    const wrapNonce = this.#randomBytes(V1_LOCAL_VAULT_POLICY.nonceBytes);
    const rawDataKey = this.#randomBytes(V1_LOCAL_VAULT_POLICY.keyBytes);
    const transition = this.#beginTransition("locked");
    let wrappingKey: CryptoKey | undefined;
    try {
      wrappingKey = await this.#deriveWrappingKey(unlockSecret, salt);
      const headerBase = headerFields({
        vaultId,
        headerRevision: 1,
        salt,
        createdAt: now,
        updatedAt: now,
      });
      const wrappedDataKey = await this.#encrypt(
        wrappingKey,
        wrapNonce,
        encodeHeaderAad(headerBase),
        rawDataKey,
      );
      const header: VaultHeaderV1 = {
        ...headerBase,
        wrapNonce,
        wrappedDataKey,
      };
      const dataKey = await this.#importAesKey(rawDataKey);
      this.#assertTransitionActive(transition, "locked");
      await this.#storage.createHeader(header);
      if (this.#isTransitionActive(transition, "locked")) {
        this.#header = cloneHeader(header);
        this.#dataKey = dataKey;
        this.#state = "unlocked";
        this.#sessionGeneration += 1;
        this.#lockDeadline = this.#nextLockDeadline(now);
      }
    } finally {
      rawDataKey.fill(0);
      salt.fill(0);
      wrappingKey = undefined;
      this.#endOperation();
    }
  }

  async unlock(unlockSecret: string): Promise<void> {
    if (this.#state === "destroyed") {
      throw new Error("vault_destroyed");
    }
    if (this.#state === "corrupt") {
      throw new Error("vault_corrupt");
    }
    if (this.#state === "unlocked") {
      this.touch();
      return;
    }
    const transition = this.#beginTransition("locked");
    let header: VaultHeaderV1 | undefined;
    let wrappingKey: CryptoKey | undefined;
    let rawDataKey: Uint8Array | undefined;
    try {
      const stored = await this.#storage.readHeader();
      this.#assertTransitionActive(transition, "locked");
      if (stored === null) throw new Error("vault_not_initialized");
      if (!isVaultHeader(stored)) {
        this.#markCorrupt();
        throw new Error("vault_header_corrupt");
      }
      header = cloneHeader(stored);
      wrappingKey = await this.#deriveWrappingKey(
        unlockSecret,
        header.kdf.salt,
      );
      rawDataKey = await this.#decrypt(
        wrappingKey,
        header.wrapNonce,
        encodeHeaderAad(header),
        header.wrappedDataKey,
      );
      if (rawDataKey.byteLength !== V1_LOCAL_VAULT_POLICY.keyBytes) {
        throw new Error("invalid_unwrapped_key");
      }
      const current = await this.#storage.readHeader();
      if (!isVaultHeader(current) || !sameHeaderVersion(current, header)) {
        throw new Error("vault_header_revision_conflict");
      }
      this.#assertTransitionActive(transition, "locked");
      const dataKey = await this.#importAesKey(rawDataKey);
      // Revocation may occur during key import. Publish only after the last await.
      this.#assertTransitionActive(transition, "locked");
      const lockDeadline = this.#nextLockDeadline(this.#checkedNow());
      this.#dataKey = dataKey;
      this.#header = header;
      this.#state = "unlocked";
      this.#sessionGeneration += 1;
      this.#lockDeadline = lockDeadline;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "vault_not_initialized" ||
          error.message === "vault_header_corrupt")
      ) {
        throw error;
      }
      // An obsolete attempt must not revoke a newer, independently unlocked session.
      if (this.#isTransitionActive(transition, "locked")) this.lock();
      throw new Error("vault_unlock_failed");
    } finally {
      rawDataKey?.fill(0);
      wrappingKey = undefined;
      this.#endOperation();
    }
  }

  lock(): void {
    this.#sessionGeneration += 1;
    this.#dataKey = undefined;
    this.#header = undefined;
    this.#lockDeadline = null;
    if (this.#state !== "destroyed" && this.#state !== "corrupt") {
      this.#state = "locked";
    }
  }

  /** Revokes this session immediately and resolves after its in-flight work drains. */
  async lockAndDrain(): Promise<void> {
    this.lock();
    if (this.#activeOperations === 0) return;
    await new Promise<void>((resolve) => this.#drainWaiters.add(resolve));
  }

  /** Only explicit trusted UI activity should call this; network traffic must not. */
  touch(now = this.#checkedNow()): void {
    this.#requireUnlocked();
    if (!isSafeUnsigned(now)) {
      throw new Error("invalid_vault_time");
    }
    this.#lockDeadline = this.#nextLockDeadline(now);
  }

  /** Updates the idle-lock policy for the current page session. */
  setInactivityLockMs(
    inactivityLockMs: number | null,
    now = this.#checkedNow(),
  ): void {
    this.#requireUnlocked();
    if (
      (inactivityLockMs !== null && !Number.isSafeInteger(inactivityLockMs)) ||
      (inactivityLockMs !== null &&
        (inactivityLockMs < 60_000 || inactivityLockMs > 30 * 60_000))
    ) {
      throw new Error("invalid_vault_inactivity_timeout");
    }
    if (!isSafeUnsigned(now)) throw new Error("invalid_vault_time");
    this.#inactivityLockMs = inactivityLockMs;
    this.#lockDeadline = this.#nextLockDeadline(now);
  }

  /** Page freeze, pagehide, OS lock integration, and explicit logout call this. */
  suspend(): void {
    this.lock();
  }

  async changeUnlockSecret(
    currentUnlockSecret: string,
    nextUnlockSecret: string,
  ): Promise<void> {
    this.#requireUnlocked();
    const now = this.#checkedNow();
    const nextSalt = this.#randomBytes(V1_LOCAL_VAULT_POLICY.saltBytes);
    const nextWrapNonce = this.#randomBytes(V1_LOCAL_VAULT_POLICY.nonceBytes);
    const lease = this.#beginOperation();
    const currentHeader = lease.header;
    let currentWrappingKey: CryptoKey | undefined;
    let nextWrappingKey: CryptoKey | undefined;
    let rawDataKey: Uint8Array | undefined;
    try {
      currentWrappingKey = await this.#deriveWrappingKey(
        currentUnlockSecret,
        currentHeader.kdf.salt,
      );
      rawDataKey = await this.#decrypt(
        currentWrappingKey,
        currentHeader.wrapNonce,
        encodeHeaderAad(currentHeader),
        currentHeader.wrappedDataKey,
      );
      if (rawDataKey.byteLength !== V1_LOCAL_VAULT_POLICY.keyBytes) {
        throw new Error("invalid_unwrapped_key");
      }
      nextWrappingKey = await this.#deriveWrappingKey(
        nextUnlockSecret,
        nextSalt,
      );
      const nextHeaderBase = headerFields({
        vaultId: currentHeader.vaultId,
        headerRevision: currentHeader.headerRevision + 1,
        salt: nextSalt,
        createdAt: currentHeader.createdAt,
        updatedAt: now,
      });
      const nextHeader: VaultHeaderV1 = {
        ...nextHeaderBase,
        wrapNonce: nextWrapNonce,
        wrappedDataKey: await this.#encrypt(
          nextWrappingKey,
          nextWrapNonce,
          encodeHeaderAad(nextHeaderBase),
          rawDataKey,
        ),
      };
      this.#assertOperationActive(lease);
      await this.#storage.replaceHeader(
        nextHeader,
        currentHeader.headerRevision,
      );
      if (this.#operationIsActive(lease)) {
        this.#header = cloneHeader(nextHeader);
        this.#touchAfterSuccess({ ...lease, header: this.#header });
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "vault_header_revision_conflict"
      ) {
        this.lock();
        throw error;
      }
      if (
        error instanceof Error &&
        (error.message === "vault_locked" ||
          error.message === "vault_destroyed")
      ) {
        throw error;
      }
      throw new Error("vault_rewrap_failed");
    } finally {
      rawDataKey?.fill(0);
      nextSalt.fill(0);
      currentWrappingKey = undefined;
      nextWrappingKey = undefined;
      this.#endOperation();
    }
  }

  async read(
    recordId: string,
    expectedKind: VaultRecordKind,
  ): Promise<VaultReadResult | null> {
    validateRecordIdentity(recordId, expectedKind);
    const lease = this.#beginOperation();
    try {
      const stored = await this.#storage.readRecord(recordId);
      this.#assertOperationActive(lease);
      if (stored === null) return null;
      if (
        !isEncryptedVaultRecord(stored) ||
        stored.vaultId !== lease.header.vaultId ||
        stored.recordId !== recordId ||
        stored.kind !== expectedKind
      ) {
        this.#markCorruptIfActive(lease);
        throw new Error("vault_record_corrupt");
      }
      let plaintext: Uint8Array;
      try {
        plaintext = await this.#decrypt(
          lease.dataKey,
          stored.nonce,
          encodeRecordAad(stored),
          stored.ciphertext,
        );
      } catch {
        this.#markCorruptIfActive(lease);
        throw new Error("vault_record_corrupt");
      }
      try {
        this.#assertOperationActive(lease);
        if (stored.deleted) {
          if (plaintext.byteLength !== 0) {
            this.#markCorruptIfActive(lease);
            throw new Error("vault_record_corrupt");
          }
          return null;
        }
        this.#touchAfterSuccess(lease);
        return { plaintext, revision: stored.revision };
      } catch (error) {
        plaintext.fill(0);
        throw error;
      }
    } finally {
      this.#endOperation();
    }
  }

  /**
   * Authenticates a record, including an encrypted tombstone, without
   * returning its plaintext. This is used by crash-safe replacement flows
   * that must compare-and-swap only against an exact prior deletion.
   */
  async inspectRecord(
    recordId: string,
    expectedKind: VaultRecordKind,
  ): Promise<VaultRecordState | null> {
    validateRecordIdentity(recordId, expectedKind);
    const lease = this.#beginOperation();
    try {
      const stored = await this.#storage.readRecord(recordId);
      this.#assertOperationActive(lease);
      if (stored === null) return null;
      if (
        !isEncryptedVaultRecord(stored) ||
        stored.vaultId !== lease.header.vaultId ||
        stored.recordId !== recordId ||
        stored.kind !== expectedKind
      ) {
        this.#markCorruptIfActive(lease);
        throw new Error("vault_record_corrupt");
      }
      let plaintext: Uint8Array;
      try {
        plaintext = await this.#decrypt(
          lease.dataKey,
          stored.nonce,
          encodeRecordAad(stored),
          stored.ciphertext,
        );
      } catch {
        this.#markCorruptIfActive(lease);
        throw new Error("vault_record_corrupt");
      }
      try {
        this.#assertOperationActive(lease);
        if (stored.deleted && plaintext.byteLength !== 0) {
          this.#markCorruptIfActive(lease);
          throw new Error("vault_record_corrupt");
        }
        if (!stored.deleted && plaintext.byteLength === 0) {
          this.#markCorruptIfActive(lease);
          throw new Error("vault_record_corrupt");
        }
        this.#touchAfterSuccess(lease);
        return { revision: stored.revision, deleted: stored.deleted };
      } finally {
        plaintext.fill(0);
      }
    } finally {
      this.#endOperation();
    }
  }

  async write(input: {
    recordId: string;
    kind: VaultRecordKind;
    plaintext: Uint8Array;
    expectedRevision: number;
  }): Promise<number> {
    validateRecordIdentity(input.recordId, input.kind);
    if (
      !isSafeUnsigned(input.expectedRevision) ||
      input.plaintext.byteLength === 0 ||
      input.plaintext.byteLength > V1_LOCAL_VAULT_POLICY.maxRecordBytes
    ) {
      throw new Error("invalid_vault_record_write");
    }
    const revision = input.expectedRevision + 1;
    if (!Number.isSafeInteger(revision)) {
      throw new Error("invalid_vault_record_write");
    }
    const lease = this.#beginOperation();
    try {
      const record = await this.#sealRecord(lease, {
        recordId: input.recordId,
        kind: input.kind,
        revision,
        deleted: false,
        plaintext: input.plaintext,
      });
      this.#assertOperationActive(lease);
      await this.#storage.compareAndSwapRecord(record, input.expectedRevision);
      this.#touchAfterSuccess(lease);
      return revision;
    } finally {
      this.#endOperation();
    }
  }

  async delete(
    recordId: string,
    kind: VaultRecordKind,
    expectedRevision: number,
  ): Promise<number> {
    validateRecordIdentity(recordId, kind);
    if (!isSafeUnsigned(expectedRevision)) {
      throw new Error("invalid_vault_record_delete");
    }
    const revision = expectedRevision + 1;
    const lease = this.#beginOperation();
    try {
      const tombstone = await this.#sealRecord(lease, {
        recordId,
        kind,
        revision,
        deleted: true,
        plaintext: new Uint8Array(),
      });
      this.#assertOperationActive(lease);
      await this.#storage.compareAndSwapRecord(tombstone, expectedRevision);
      this.#touchAfterSuccess(lease);
      return revision;
    } finally {
      this.#endOperation();
    }
  }

  /**
   * Seals and commits a bounded set of independent record mutations in one
   * storage transaction. Either every revision advances or none does.
   */
  async mutateRecordsAtomically(
    mutations: readonly VaultRecordMutation[],
  ): Promise<readonly number[]> {
    if (
      mutations.length < 2 ||
      mutations.length > 8 ||
      new Set(mutations.map((mutation) => mutation.recordId)).size !==
        mutations.length
    ) {
      throw new Error("invalid_vault_record_batch");
    }
    const lease = this.#beginOperation();
    const entries: VaultRecordCas[] = [];
    try {
      for (const mutation of mutations) {
        validateRecordIdentity(mutation.recordId, mutation.kind);
        if (!isSafeUnsigned(mutation.expectedRevision)) {
          throw new Error("invalid_vault_record_batch");
        }
        if (
          mutation.plaintext !== undefined &&
          (mutation.plaintext.byteLength === 0 ||
            mutation.plaintext.byteLength >
              V1_LOCAL_VAULT_POLICY.maxRecordBytes)
        ) {
          throw new Error("invalid_vault_record_batch");
        }
        const revision = mutation.expectedRevision + 1;
        if (!Number.isSafeInteger(revision)) {
          throw new Error("invalid_vault_record_batch");
        }
        entries.push({
          record: await this.#sealRecord(lease, {
            recordId: mutation.recordId,
            kind: mutation.kind,
            revision,
            deleted: mutation.plaintext === undefined,
            plaintext: mutation.plaintext ?? new Uint8Array(),
          }),
          expectedRevision: mutation.expectedRevision,
        });
      }
      this.#assertOperationActive(lease);
      await this.#storage.compareAndSwapRecords(entries);
      this.#touchAfterSuccess(lease);
      return entries.map((entry) => entry.record.revision);
    } finally {
      this.#endOperation();
    }
  }

  async destroy(): Promise<void> {
    if (this.#state === "destroyed") return;
    await this.lockAndDrain();
    await this.#storage.clear();
    this.#state = "destroyed";
  }

  async #sealRecord(
    lease: VaultOperationLease,
    input: {
      recordId: string;
      kind: VaultRecordKind;
      revision: number;
      deleted: boolean;
      plaintext: Uint8Array;
    },
  ): Promise<EncryptedVaultRecordV1> {
    const recordBase = {
      formatVersion: 1 as const,
      vaultId: lease.header.vaultId,
      recordId: input.recordId,
      kind: input.kind,
      revision: input.revision,
      deleted: input.deleted,
      nonce: this.#randomBytes(V1_LOCAL_VAULT_POLICY.nonceBytes),
      updatedAt: this.#checkedNow(),
    };
    return {
      ...recordBase,
      ciphertext: await this.#encrypt(
        lease.dataKey,
        recordBase.nonce,
        encodeRecordAad(recordBase),
        input.plaintext,
      ),
    };
  }

  async #deriveWrappingKey(
    unlockSecret: string,
    salt: Uint8Array,
  ): Promise<CryptoKey> {
    const normalized = new TextEncoder().encode(unlockSecret.normalize("NFC"));
    if (
      normalized.byteLength < V1_LOCAL_VAULT_POLICY.minUnlockSecretBytes ||
      normalized.byteLength > V1_LOCAL_VAULT_POLICY.maxUnlockSecretBytes
    ) {
      normalized.fill(0);
      throw new Error("invalid_unlock_secret_length");
    }
    let derived: Uint8Array | undefined;
    try {
      derived = await this.#deriveKey(normalized, new Uint8Array(salt));
      if (derived.byteLength !== V1_LOCAL_VAULT_POLICY.keyBytes) {
        throw new Error("invalid_derived_key_length");
      }
      return await this.#importAesKey(derived);
    } finally {
      normalized.fill(0);
      derived?.fill(0);
    }
  }

  #importAesKey(raw: Uint8Array): Promise<CryptoKey> {
    return this.#crypto.subtle.importKey(
      "raw",
      toArrayBuffer(raw),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async #encrypt(
    key: CryptoKey,
    nonce: Uint8Array,
    aad: Uint8Array,
    plaintext: Uint8Array,
  ): Promise<Uint8Array> {
    return new Uint8Array(
      await this.#crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(aad),
          tagLength: V1_LOCAL_VAULT_POLICY.tagBits,
        },
        key,
        toArrayBuffer(plaintext),
      ),
    );
  }

  async #decrypt(
    key: CryptoKey,
    nonce: Uint8Array,
    aad: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    return new Uint8Array(
      await this.#crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(aad),
          tagLength: V1_LOCAL_VAULT_POLICY.tagBits,
        },
        key,
        toArrayBuffer(ciphertext),
      ),
    );
  }

  #randomBytes(length: number): Uint8Array {
    return this.#crypto.getRandomValues(new Uint8Array(length));
  }

  #checkedNow(): number {
    const now = this.#now();
    if (!isSafeUnsigned(now)) {
      throw new Error("invalid_vault_time");
    }
    return now;
  }

  #nextLockDeadline(now: number): number | null {
    return this.#inactivityLockMs === null
      ? null
      : now + this.#inactivityLockMs;
  }

  #beginOperation(): VaultOperationLease {
    this.#requireUnlocked();
    this.#activeOperations += 1;
    return {
      generation: this.#sessionGeneration,
      header: this.#header!,
      dataKey: this.#dataKey!,
    };
  }

  #beginTransition(expected: LocalVaultState): number {
    this.#requireState(expected);
    this.#activeOperations += 1;
    return this.#sessionGeneration;
  }

  #isTransitionActive(generation: number, expected: LocalVaultState): boolean {
    return this.#sessionGeneration === generation && this.#state === expected;
  }

  #assertTransitionActive(generation: number, expected: LocalVaultState): void {
    if (!this.#isTransitionActive(generation, expected)) {
      throw new Error(
        this.#state === "destroyed" ? "vault_destroyed" : "vault_locked",
      );
    }
  }

  #assertOperationActive(lease: VaultOperationLease): void {
    if (!this.#operationIsActive(lease)) {
      throw new Error(
        this.#state === "destroyed" ? "vault_destroyed" : "vault_locked",
      );
    }
  }

  #operationIsActive(lease: VaultOperationLease): boolean {
    return (
      this.#state === "unlocked" &&
      this.#sessionGeneration === lease.generation &&
      this.#header === lease.header &&
      this.#dataKey === lease.dataKey
    );
  }

  #touchAfterSuccess(lease: VaultOperationLease): void {
    if (this.#operationIsActive(lease)) {
      try {
        this.#lockDeadline = this.#nextLockDeadline(this.#checkedNow());
      } catch {
        // Durability has already linearized; a bad clock may lock the session,
        // but must never turn committed success into an ambiguous failure.
        this.lock();
      }
    }
  }

  #markCorruptIfActive(lease: VaultOperationLease): void {
    if (
      this.#state === "unlocked" &&
      this.#sessionGeneration === lease.generation
    ) {
      this.#markCorrupt();
    }
  }

  #endOperation(): void {
    this.#activeOperations -= 1;
    if (this.#activeOperations !== 0) return;
    for (const resolve of this.#drainWaiters) resolve();
    this.#drainWaiters.clear();
  }

  #enforceDeadline(): void {
    if (
      this.#state === "unlocked" &&
      this.#lockDeadline !== null &&
      this.#checkedNow() >= this.#lockDeadline
    ) {
      this.lock();
    }
  }

  #requireUnlocked(): void {
    this.#enforceDeadline();
    if (this.#state !== "unlocked" || !this.#header || !this.#dataKey) {
      throw new Error(
        this.#state === "corrupt" ? "vault_corrupt" : "vault_locked",
      );
    }
  }

  #requireState(expected: LocalVaultState): void {
    if (this.#state !== expected) {
      throw new Error(`vault_state_${this.#state}`);
    }
  }

  #markCorrupt(): void {
    this.#sessionGeneration += 1;
    this.#dataKey = undefined;
    this.#header = undefined;
    this.#lockDeadline = null;
    this.#state = "corrupt";
  }
}

/** IndexedDB adapter. Secret bytes enter the records store only as ciphertext. */
export class IndexedDbVaultStorage implements LocalVaultStorage {
  readonly #databaseName: string;
  readonly #indexedDb: IDBFactory;
  #database: Promise<IDBDatabase> | undefined;

  constructor(
    databaseName = "nekon-secret-vault-v1",
    indexedDb: IDBFactory = globalThis.indexedDB,
  ) {
    if (!/^[A-Za-z0-9._-]{1,128}$/u.test(databaseName) || !indexedDb) {
      throw new Error("invalid_indexeddb_vault_configuration");
    }
    this.#databaseName = databaseName;
    this.#indexedDb = indexedDb;
  }

  async readHeader(): Promise<unknown | null> {
    const database = await this.#open();
    return requestResult(
      database
        .transaction("metadata", "readonly")
        .objectStore("metadata")
        .get(HEADER_KEY),
    ).then((value) => value ?? null);
  }

  async createHeader(header: VaultHeaderV1): Promise<void> {
    const database = await this.#open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("metadata", "readwrite");
      const store = transaction.objectStore("metadata");
      const request = store.add(cloneHeader(header), HEADER_KEY);
      request.onerror = () => reject(new Error("vault_already_initialized"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("vault_storage_write_failed"));
      transaction.onabort = () =>
        reject(new Error("vault_storage_write_failed"));
    });
  }

  async replaceHeader(
    header: VaultHeaderV1,
    expectedRevision: number,
  ): Promise<void> {
    const database = await this.#open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("metadata", "readwrite");
      const store = transaction.objectStore("metadata");
      const read = store.get(HEADER_KEY);
      read.onsuccess = () => {
        const current = read.result as unknown;
        if (
          !isVaultHeader(current) ||
          current.headerRevision !== expectedRevision
        ) {
          transaction.abort();
          reject(new Error("vault_header_revision_conflict"));
          return;
        }
        store.put(cloneHeader(header), HEADER_KEY);
      };
      read.onerror = () => reject(new Error("vault_storage_read_failed"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("vault_storage_write_failed"));
    });
  }

  async readRecord(recordId: string): Promise<unknown | null> {
    const database = await this.#open();
    return requestResult(
      database
        .transaction("records", "readonly")
        .objectStore("records")
        .get(recordId),
    ).then((value) => value ?? null);
  }

  async compareAndSwapRecord(
    record: EncryptedVaultRecordV1,
    expectedRevision: number,
  ): Promise<void> {
    const database = await this.#open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        ["metadata", "records"],
        "readwrite",
      );
      const store = transaction.objectStore("records");
      const headerRead = transaction.objectStore("metadata").get(HEADER_KEY);
      headerRead.onsuccess = () => {
        const header = headerRead.result as unknown;
        if (!isVaultHeader(header) || header.vaultId !== record.vaultId) {
          transaction.abort();
          reject(new Error("vault_header_revision_conflict"));
          return;
        }
        const read = store.get(record.recordId);
        read.onsuccess = () => {
          const current = read.result as unknown;
          if (current !== undefined && !isEncryptedVaultRecord(current)) {
            transaction.abort();
            reject(new Error("vault_record_corrupt"));
            return;
          }
          const currentRevision = isEncryptedVaultRecord(current)
            ? current.revision
            : 0;
          if (currentRevision !== expectedRevision) {
            transaction.abort();
            reject(new Error("vault_record_revision_conflict"));
            return;
          }
          store.put(cloneRecord(record), record.recordId);
        };
        read.onerror = () => reject(new Error("vault_storage_read_failed"));
      };
      headerRead.onerror = () => reject(new Error("vault_storage_read_failed"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("vault_storage_write_failed"));
    });
  }

  async compareAndSwapRecords(
    entries: readonly VaultRecordCas[],
  ): Promise<void> {
    if (
      entries.length < 2 ||
      entries.length > 8 ||
      new Set(entries.map((entry) => entry.record.recordId)).size !==
        entries.length
    ) {
      throw new Error("invalid_vault_record_batch");
    }
    const database = await this.#open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        ["metadata", "records"],
        "readwrite",
      );
      const store = transaction.objectStore("records");
      let remaining = entries.length;
      let failure: Error | undefined;
      const abort = (error: Error): void => {
        if (failure) return;
        failure = error;
        transaction.abort();
      };
      const headerRead = transaction.objectStore("metadata").get(HEADER_KEY);
      headerRead.onsuccess = () => {
        const header = headerRead.result as unknown;
        if (
          !isVaultHeader(header) ||
          entries.some((entry) => entry.record.vaultId !== header.vaultId)
        ) {
          abort(new Error("vault_header_revision_conflict"));
          return;
        }
        for (const entry of entries) {
          const read = store.get(entry.record.recordId);
          read.onsuccess = () => {
            const current = read.result as unknown;
            if (current !== undefined && !isEncryptedVaultRecord(current)) {
              abort(new Error("vault_record_corrupt"));
              return;
            }
            const currentRevision = isEncryptedVaultRecord(current)
              ? current.revision
              : 0;
            if (currentRevision !== entry.expectedRevision) {
              abort(new Error("vault_record_revision_conflict"));
              return;
            }
            remaining -= 1;
            if (remaining === 0) {
              for (const candidate of entries) {
                store.put(
                  cloneRecord(candidate.record),
                  candidate.record.recordId,
                );
              }
            }
          };
          read.onerror = () => abort(new Error("vault_storage_read_failed"));
        }
      };
      headerRead.onerror = () => abort(new Error("vault_storage_read_failed"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(failure ?? new Error("vault_storage_write_failed"));
      transaction.onabort = () =>
        reject(failure ?? new Error("vault_storage_write_failed"));
    });
  }

  async clear(): Promise<void> {
    const database = await this.#open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        ["metadata", "records"],
        "readwrite",
      );
      transaction.objectStore("metadata").clear();
      transaction.objectStore("records").clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("vault_storage_clear_failed"));
      transaction.onabort = () =>
        reject(new Error("vault_storage_clear_failed"));
    });
  }

  #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.#indexedDb.open(this.#databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("metadata")) {
          database.createObjectStore("metadata");
        }
        if (!database.objectStoreNames.contains("records")) {
          database.createObjectStore("records");
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(new Error("vault_storage_open_failed"));
      request.onblocked = () => reject(new Error("vault_storage_open_blocked"));
    });
    return this.#database;
  }
}

function headerFields(input: {
  vaultId: string;
  headerRevision: number;
  salt: Uint8Array;
  createdAt: number;
  updatedAt: number;
}): Omit<VaultHeaderV1, "wrapNonce" | "wrappedDataKey"> {
  return {
    formatVersion: 1,
    vaultId: input.vaultId,
    headerRevision: input.headerRevision,
    kdf: {
      id: "argon2id-v1",
      memoryKiB: V1_LOCAL_VAULT_POLICY.kdfMemoryKiB,
      iterations: V1_LOCAL_VAULT_POLICY.kdfIterations,
      parallelism: V1_LOCAL_VAULT_POLICY.kdfParallelism,
      salt: new Uint8Array(input.salt),
    },
    wrappingCipher: "AES-256-GCM",
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function encodeHeaderAad(
  header: Omit<VaultHeaderV1, "wrapNonce" | "wrappedDataKey"> | VaultHeaderV1,
): Uint8Array {
  return encodeFields(HEADER_AAD_DOMAIN, [
    String(header.formatVersion),
    header.vaultId,
    String(header.headerRevision),
    header.kdf.id,
    String(header.kdf.memoryKiB),
    String(header.kdf.iterations),
    String(header.kdf.parallelism),
    encodeBase64Url(header.kdf.salt),
    header.wrappingCipher,
    String(header.createdAt),
    String(header.updatedAt),
  ]);
}

function encodeRecordAad(
  record: Omit<EncryptedVaultRecordV1, "ciphertext">,
): Uint8Array {
  return encodeFields(RECORD_AAD_DOMAIN, [
    String(record.formatVersion),
    record.vaultId,
    record.recordId,
    record.kind,
    String(record.revision),
    record.deleted ? "1" : "0",
    String(record.updatedAt),
  ]);
}

function encodeFields(domain: string, fields: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts = [encoder.encode(domain)];
  let length = parts[0]!.byteLength;
  for (const field of fields) {
    const bytes = encoder.encode(field);
    const prefix = new Uint8Array(4);
    new DataView(prefix.buffer).setUint32(0, bytes.byteLength, false);
    parts.push(prefix, bytes);
    length += prefix.byteLength + bytes.byteLength;
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function isVaultHeader(value: unknown): value is VaultHeaderV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "formatVersion",
      "vaultId",
      "headerRevision",
      "kdf",
      "wrappingCipher",
      "wrapNonce",
      "wrappedDataKey",
      "createdAt",
      "updatedAt",
    ]) &&
    value.formatVersion === V1_LOCAL_VAULT_POLICY.formatVersion &&
    typeof value.vaultId === "string" &&
    /^vault_[A-Za-z0-9_-]{22}$/u.test(value.vaultId) &&
    isPositiveSafeInteger(value.headerRevision) &&
    isRecord(value.kdf) &&
    hasExactKeys(value.kdf, [
      "id",
      "memoryKiB",
      "iterations",
      "parallelism",
      "salt",
    ]) &&
    value.kdf.id === V1_LOCAL_VAULT_POLICY.kdfId &&
    value.kdf.memoryKiB === V1_LOCAL_VAULT_POLICY.kdfMemoryKiB &&
    value.kdf.iterations === V1_LOCAL_VAULT_POLICY.kdfIterations &&
    value.kdf.parallelism === V1_LOCAL_VAULT_POLICY.kdfParallelism &&
    isByteArray(value.kdf.salt, V1_LOCAL_VAULT_POLICY.saltBytes) &&
    value.wrappingCipher === "AES-256-GCM" &&
    isByteArray(value.wrapNonce, V1_LOCAL_VAULT_POLICY.nonceBytes) &&
    isByteArray(
      value.wrappedDataKey,
      V1_LOCAL_VAULT_POLICY.keyBytes + V1_LOCAL_VAULT_POLICY.tagBits / 8,
    ) &&
    isSafeUnsigned(value.createdAt) &&
    isSafeUnsigned(value.updatedAt) &&
    value.updatedAt >= value.createdAt
  );
}

function isEncryptedVaultRecord(
  value: unknown,
): value is EncryptedVaultRecordV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "formatVersion",
      "vaultId",
      "recordId",
      "kind",
      "revision",
      "deleted",
      "nonce",
      "ciphertext",
      "updatedAt",
    ]) &&
    value.formatVersion === V1_LOCAL_VAULT_POLICY.formatVersion &&
    typeof value.vaultId === "string" &&
    /^vault_[A-Za-z0-9_-]{22}$/u.test(value.vaultId) &&
    typeof value.recordId === "string" &&
    /^[a-z][a-z0-9._:-]{0,127}$/u.test(value.recordId) &&
    isVaultRecordKind(value.kind) &&
    isPositiveSafeInteger(value.revision) &&
    typeof value.deleted === "boolean" &&
    isByteArray(value.nonce, V1_LOCAL_VAULT_POLICY.nonceBytes) &&
    value.ciphertext instanceof Uint8Array &&
    value.ciphertext.byteLength >= V1_LOCAL_VAULT_POLICY.tagBits / 8 &&
    value.ciphertext.byteLength <=
      V1_LOCAL_VAULT_POLICY.maxRecordBytes +
        V1_LOCAL_VAULT_POLICY.tagBits / 8 &&
    isSafeUnsigned(value.updatedAt)
  );
}

function validateRecordIdentity(recordId: string, kind: VaultRecordKind): void {
  if (
    !/^[a-z][a-z0-9._:-]{0,127}$/u.test(recordId) ||
    !isVaultRecordKind(kind)
  ) {
    throw new Error("invalid_vault_record_identity");
  }
}

function isVaultRecordKind(value: unknown): value is VaultRecordKind {
  return [
    "account_root",
    "account_manifest",
    "mls_state",
    "recovery_material",
    "history_key",
    "attachment_key",
    "attachment_upload",
    "identity_trust",
    "identity_genome",
    "anonymous_persona",
    "anonymous_room_draft",
    "anonymous_admission",
    "anonymous_abuse_token_pool",
    "anonymous_abuse_prefetch",
    "anonymous_traffic_schedule",
    "anonymous_outbound_batch",
    "anonymous_message_fanout",
    "anonymous_recipient_directory",
    "anonymous_recipient_offer_collection",
    "anonymous_membership_consent",
    "anonymous_membership_admission",
    "anonymous_message_order",
    "anonymous_active_room",
    "anonymous_active_mailbox_registration",
    "p2p_endpoint_directory",
    "device_operation",
    "request_operation",
    "enterprise_provisioning",
    "webauthn_operation",
    "guest_room_invitation",
    "guest_room_provisioning",
  ].includes(value as VaultRecordKind);
}

function cloneHeader(header: VaultHeaderV1): VaultHeaderV1 {
  return {
    ...header,
    kdf: { ...header.kdf, salt: new Uint8Array(header.kdf.salt) },
    wrapNonce: new Uint8Array(header.wrapNonce),
    wrappedDataKey: new Uint8Array(header.wrappedDataKey),
  };
}

function sameHeaderVersion(left: VaultHeaderV1, right: VaultHeaderV1): boolean {
  return (
    left.vaultId === right.vaultId &&
    left.headerRevision === right.headerRevision &&
    equalBytes(left.wrappedDataKey, right.wrappedDataKey)
  );
}

function cloneRecord(record: EncryptedVaultRecordV1): EncryptedVaultRecordV1 {
  return {
    ...record,
    nonce: new Uint8Array(record.nonce),
    ciphertext: new Uint8Array(record.ciphertext),
  };
}

function requestResult(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as unknown);
    request.onerror = () => reject(new Error("vault_storage_read_failed"));
  });
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isByteArray(value: unknown, length: number): value is Uint8Array {
  return value instanceof Uint8Array && value.byteLength === length;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isSafeUnsigned(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(value.byteLength);
  new Uint8Array(output).set(value);
  return output;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
