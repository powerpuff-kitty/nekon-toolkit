import type {
  ApplicationEnrollmentDraft,
  ApplicationEnrollmentSnapshot,
  ApplicationEnrollmentStore,
} from "./application-enrollment-types";
import {
  MAX_APPLICATION_ENROLLMENT_RECORD_BYTES,
  decodeEnrollmentBytes,
  hasEnrollmentKeys,
  isEnrollmentHttpsUrl,
  requireEnrollmentId,
  validateEnrollmentDraft,
} from "./application-enrollment-validation";

const RECORD_ID = "organization:application-authorization";
const KIND = "enterprise_provisioning" as const;
const PURPOSE = "browser-application-enrollment";
const MAX_BOUND_RECORD_BYTES = MAX_APPLICATION_ENROLLMENT_RECORD_BYTES + 12 * 1_024;
const BINDING_KEYS = [
  "purpose", "serviceOrigin", "applicationId", "redirectUri",
  "targetIdentityId", "targetDeviceId", "targetSigningKeyHash", "targetMlsCredentialHash",
] as const;

export interface ApplicationEnrollmentBinding {
  readonly purpose: "browser-application-enrollment";
  readonly serviceOrigin: string;
  readonly applicationId: string;
  readonly redirectUri: string;
  readonly targetIdentityId: string;
  readonly targetDeviceId: string;
  readonly targetSigningKeyHash: string;
  readonly targetMlsCredentialHash: string;
}

/** Narrow LocalSecretVault port; encryption, AAD and CAS remain vault-owned. */
export interface ApplicationEnrollmentSecretVault {
  read(recordId: string, kind: typeof KIND): Promise<{
    readonly plaintext: Uint8Array;
    readonly revision: number;
  } | null>;
  inspectRecord(recordId: string, kind: typeof KIND): Promise<{
    readonly revision: number;
    readonly deleted: boolean;
  } | null>;
  write(input: {
    readonly recordId: string;
    readonly kind: typeof KIND;
    readonly plaintext: Uint8Array;
    readonly expectedRevision: number;
  }): Promise<number>;
}

interface BoundRecord {
  readonly draft: ApplicationEnrollmentDraft | null;
  readonly revision: number;
}

/**
 * Open the proposed V2 local envelope (ADR-0062). Initialization is allowed ONLY
 * when the caller has just created this vault, never as adoption of old storage.
 * No HTTP or key generation occurs here. V1 data is retained and rejected.
 */
export async function openBoundApplicationEnrollmentVault(input: {
  readonly vault: ApplicationEnrollmentSecretVault;
  readonly binding: ApplicationEnrollmentBinding;
  readonly initializeNewVault: boolean;
  readonly assertActive: () => void;
}): Promise<ApplicationEnrollmentStore> {
  const { vault, assertActive, initializeNewVault } = input;
  const binding = snapshotBinding(input.binding);
  if (typeof initializeNewVault !== "boolean" || typeof assertActive !== "function") {
    throw failure("invalid_application_enrollment_binding");
  }
  const owner = new BoundApplicationEnrollmentVault(vault, binding, assertActive);
  await owner.open(initializeNewVault);
  return owner;
}

class BoundApplicationEnrollmentVault implements ApplicationEnrollmentStore {
  readonly #vault: ApplicationEnrollmentSecretVault;
  readonly #binding: ApplicationEnrollmentBinding;
  readonly #assertActive: () => void;

  constructor(vault: ApplicationEnrollmentSecretVault, binding: ApplicationEnrollmentBinding, assertActive: () => void) {
    this.#vault = vault;
    this.#binding = binding;
    this.#assertActive = assertActive;
  }

  async open(initializeNewVault: boolean): Promise<void> {
    const current = await this.readRecord();
    if (current !== null) return;
    if (!initializeNewVault) throw failure("application_enrollment_binding_missing");
    const previous = await this.#vault.inspectRecord(RECORD_ID, KIND);
    this.#assertActive();
    // An authenticated tombstone is not a never-used enrollment namespace.
    if (previous !== null) throw failure("application_enrollment_binding_missing");
    await this.writeRecord(null, 0);
  }

  async read(): Promise<ApplicationEnrollmentSnapshot | null> {
    const current = await this.requireRecord();
    return current.draft === null ? null : { ...current.draft, revision: current.revision };
  }

  async stage(value: ApplicationEnrollmentDraft): Promise<ApplicationEnrollmentSnapshot> {
    const draft = this.snapshotDraft(value);
    const current = await this.requireRecord();
    if (current.draft !== null) throw failure("organization_application_authorization_pending");
    const revision = await this.writeRecord(draft, current.revision);
    return { ...draft, revision };
  }

  async advance(value: ApplicationEnrollmentDraft, expectedRevision: number): Promise<ApplicationEnrollmentSnapshot> {
    const draft = this.snapshotDraft(value);
    const current = await this.requireRecord();
    this.requireRevision(current, expectedRevision);
    if (current.draft === null) throw failure("application_enrollment_binding_state_conflict");
    const revision = await this.writeRecord(draft, expectedRevision);
    return { ...draft, revision };
  }

  async retire(expectedRevision: number): Promise<void> {
    const current = await this.requireRecord();
    this.requireRevision(current, expectedRevision);
    if (current.draft === null) throw failure("application_enrollment_binding_state_conflict");
    // The coordinator owns retirement eligibility; context is never retired.
    await this.writeRecord(null, expectedRevision);
  }

  private requireRevision(current: BoundRecord, expected: number): void {
    if (!Number.isSafeInteger(expected) || expected < 1 || expected !== current.revision) {
      throw failure("application_enrollment_binding_state_conflict");
    }
  }

  private async requireRecord(): Promise<BoundRecord> {
    const record = await this.readRecord();
    if (record === null) throw failure("application_enrollment_binding_missing");
    return record;
  }

  private async readRecord(): Promise<BoundRecord | null> {
    this.#assertActive();
    const record = await this.#vault.read(RECORD_ID, KIND);
    try {
      this.#assertActive();
      if (record === null) return null;
      if (!Number.isSafeInteger(record.revision) || record.revision < 1 ||
          !(record.plaintext instanceof Uint8Array) || record.plaintext.length < 1 ||
          record.plaintext.length > MAX_BOUND_RECORD_BYTES) {
        throw failure("application_enrollment_binding_corrupt");
      }
      let value: unknown;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.plaintext));
      } catch { throw failure("application_enrollment_binding_corrupt"); }
      if (isRecord(value) && value.formatVersion === 1) {
        throw failure("application_enrollment_binding_legacy_unsupported");
      }
      if (!isRecord(value) || !hasEnrollmentKeys(value, ["formatVersion", "binding", "draft"]) ||
          value.formatVersion !== 2) throw failure("application_enrollment_binding_corrupt");
      let stored: ApplicationEnrollmentBinding;
      try { stored = snapshotBinding(value.binding); }
      catch { throw failure("application_enrollment_binding_corrupt"); }
      if (BINDING_KEYS.some(key => stored[key] !== this.#binding[key])) {
        throw failure("application_enrollment_binding_mismatch");
      }
      return {
        revision: record.revision,
        draft: value.draft === null ? null : this.snapshotDraft(value.draft),
      };
    } finally {
      if (record?.plaintext instanceof Uint8Array) record.plaintext.fill(0);
    }
  }

  private snapshotDraft(value: unknown): ApplicationEnrollmentDraft {
    this.#assertActive();
    validateEnrollmentDraft(value);
    const draft = structuredClone(value);
    const b = this.#binding;
    if (draft.applicationId !== b.applicationId || draft.targetIdentityId !== b.targetIdentityId ||
        draft.targetDeviceId !== b.targetDeviceId || (draft.status !== "enrolled" &&
        (draft.redirectUri !== b.redirectUri || draft.targetSigningKeyHash !== b.targetSigningKeyHash ||
         draft.targetMlsCredentialHash !== b.targetMlsCredentialHash ||
         (draft.status !== "prepared" && new URL(draft.authorizationUrl).origin !== b.serviceOrigin)))) {
      throw failure("application_enrollment_binding_mismatch");
    }
    return draft;
  }

  private async writeRecord(draft: ApplicationEnrollmentDraft | null, expectedRevision: number): Promise<number> {
    this.#assertActive();
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
      throw failure("application_enrollment_binding_state_conflict");
    }
    const plaintext = new TextEncoder().encode(JSON.stringify({
      formatVersion: 2, binding: this.#binding, draft,
    }));
    try {
      if (plaintext.length > MAX_BOUND_RECORD_BYTES) throw failure("application_enrollment_binding_corrupt");
      const revision = await this.#vault.write({ recordId: RECORD_ID, kind: KIND, plaintext, expectedRevision });
      this.#assertActive();
      if (!Number.isSafeInteger(revision) || revision !== expectedRevision + 1) {
        throw failure("application_enrollment_binding_state_conflict");
      }
      return revision;
    } finally { plaintext.fill(0); }
  }
}

function snapshotBinding(value: unknown): ApplicationEnrollmentBinding {
  try {
    if (!isRecord(value) || !hasEnrollmentKeys(value, BINDING_KEYS)) throw new Error();
    const b = { ...value };
    if (b.purpose !== PURPOSE || typeof b.serviceOrigin !== "string" ||
        b.serviceOrigin.length > 4_096 || !isEnrollmentHttpsUrl(b.redirectUri)) throw new Error();
    const service = new URL(b.serviceOrigin);
    if (service.protocol !== "https:" || service.origin !== b.serviceOrigin ||
        new URL(b.redirectUri).origin === service.origin) throw new Error();
    requireEnrollmentId(b.applicationId, "app");
    requireEnrollmentId(b.targetIdentityId, "id");
    requireEnrollmentId(b.targetDeviceId, "dev");
    decodeEnrollmentBytes(b.targetSigningKeyHash, 32).fill(0);
    decodeEnrollmentBytes(b.targetMlsCredentialHash, 32).fill(0);
    return Object.freeze(b) as unknown as ApplicationEnrollmentBinding;
  } catch { throw failure("invalid_application_enrollment_binding"); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failure(code: string): Error { return new Error(code); }
