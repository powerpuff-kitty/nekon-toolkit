import type {
  ApplicationEnrollmentActivator,
  ApplicationEnrollmentDevice,
  ApplicationEnrollmentDraft,
  ApplicationEnrollmentProgress,
  ApplicationEnrollmentReceipt,
  ApplicationEnrollmentScope,
  ApplicationEnrollmentSnapshot,
  ApplicationEnrollmentStore,
  ApplicationEnrollmentTransport,
} from "./application-enrollment-types";
import {
  assertEnrollmentScope,
  decodeEnrollmentBytes,
  encodeEnrollmentBytes,
  enrollmentDraft,
  equalEnrollmentState,
  isEnrollmentHttpsUrl,
  requireEnrollmentId,
  sameEnrollmentValue,
  snapshotEnrollmentProof,
  validateEnrollmentMaterialIntegrity,
  validateEnrollmentDraft,
  validateEnrollmentReceipt,
  validateEnrollmentScope,
  validateEnrollmentSnapshot,
} from "./application-enrollment-validation";

export interface ApplicationEnrollmentCoordinatorOptions {
  readonly applicationId: string;
  readonly transport: ApplicationEnrollmentTransport;
  readonly vault: ApplicationEnrollmentStore;
  readonly device: ApplicationEnrollmentDevice;
  readonly activator: ApplicationEnrollmentActivator;
  readonly newRequestId?: () => string;
  readonly now?: () => number;
  readonly assertActive?: () => void;
  /** Pins approval links for a hosted SDK integration; legacy callers may omit. */
  readonly authorizationOrigin?: string;
  /** Prevents resume from selecting another Device's valid encrypted record. */
  readonly scope?: ApplicationEnrollmentScope;
}

/** Shared four-state owner for legacy and SDK enrollment, with no private-key API. */
export class ApplicationEnrollmentCoordinator {
  readonly #options: ApplicationEnrollmentCoordinatorOptions;
  readonly #now: () => number;
  readonly #active: () => void;
  readonly #newRequestId: () => string;
  #busy = false;

  constructor(options: ApplicationEnrollmentCoordinatorOptions) {
    requireEnrollmentId(options.applicationId, "app");
    if (options.scope) validateEnrollmentScope(options.scope);
    if (options.authorizationOrigin !== undefined) {
      const url = new URL(options.authorizationOrigin);
      if (url.protocol !== "https:" || url.origin !== options.authorizationOrigin)
        throw new Error("invalid_organization_application_origin");
    }
    this.#options = { ...options, ...(options.scope ? { scope: Object.freeze({ ...options.scope }) } : {}) };
    this.#now = options.now ?? Date.now;
    this.#active = options.assertActive ?? (() => undefined);
    this.#newRequestId = options.newRequestId ?? (() => {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
      try { return `ear_${encodeEnrollmentBytes(bytes)}`; } finally { bytes.fill(0); }
    });
  }

  read(): Promise<ApplicationEnrollmentSnapshot | null> {
    return this.#run(() => this.#read());
  }

  begin(input: ApplicationEnrollmentScope): Promise<ApplicationEnrollmentProgress> {
    const scope = { ...input };
    return this.#run(async () => {
      validateEnrollmentScope(scope);
      const existing = await this.#read();
      if (existing !== null) {
        assertEnrollmentScope(existing, this.#options.applicationId, scope);
        return this.#resume(existing);
      }
      if (this.#options.scope && !sameEnrollmentValue(scope, this.#options.scope))
        throw new Error("organization_application_authorization_scope_mismatch");
      const material = await this.#options.device.prepare(Object.freeze({ ...scope }));
      this.#active();
      const authorizationRequestId = this.#newRequestId();
      requireEnrollmentId(authorizationRequestId, "ear");
      const draft: ApplicationEnrollmentDraft = {
        ...material, ...scope, applicationId: this.#options.applicationId,
        authorizationRequestId, status: "prepared",
      };
      const staged = await this.#write(draft);
      return this.#resume(staged);
    });
  }

  acceptCallback(input: { readonly state: string; readonly code: string }): Promise<ApplicationEnrollmentProgress> {
    const { state, code } = input;
    return this.#run(async () => {
      const current = await this.#read();
      if (current === null || current.status === "prepared")
        throw new Error("organization_application_authorization_not_requested");
      // No callback grants new authority after completion; resume existing state.
      if (current.status === "enrolled") return this.#resume(current);
      if (!equalEnrollmentState(current.state, state))
        throw new Error("organization_application_authorization_state_mismatch");
      decodeEnrollmentBytes(code, 32).fill(0);
      if (current.status === "redeeming") {
        if (current.code !== code) throw new Error("organization_application_authorization_code_mismatch");
        return this.#resume(current);
      }
      if (current.expiresAt <= this.#time()) throw new Error("organization_application_authorization_expired");
      const next = await this.#write({ ...enrollmentDraft(current), status: "redeeming", code }, current.revision);
      return this.#resume(next);
    });
  }

  resume(): Promise<ApplicationEnrollmentProgress | null> {
    return this.#run(async () => {
      const current = await this.#read();
      return current === null ? null : this.#resume(current);
    });
  }

  retire(): Promise<void> {
    return this.#run(async () => {
      const state = await this.#read();
      if (state === null) return;
      if (state.status !== "enrolled") throw new Error("organization_application_authorization_incomplete");
      await this.#options.vault.retire(state.revision);
      this.#active();
    });
  }

  async #run<T>(operation: () => Promise<T>): Promise<T> {
    this.#active();
    if (this.#busy) throw new Error("organization_application_authorization_busy");
    this.#busy = true;
    try { return await operation(); } finally { this.#busy = false; }
  }

  async #read(): Promise<ApplicationEnrollmentSnapshot | null> {
    this.#active();
    const value = await this.#options.vault.read();
    this.#active();
    if (value === null) return null;
    validateEnrollmentSnapshot(value);
    // The adapter retains its object. Own the complete snapshot before awaits.
    const snapshot = structuredClone(value);
    if (snapshot.applicationId !== this.#options.applicationId)
      throw new Error("organization_application_authorization_scope_mismatch");
    if (this.#options.scope) assertEnrollmentScope(snapshot, this.#options.applicationId, this.#options.scope);
    if (this.#options.authorizationOrigin !== undefined && snapshot.status !== "prepared" && snapshot.status !== "enrolled" &&
        snapshot.authorizationUrl !== `${this.#options.authorizationOrigin}/enterprise/authorize/${snapshot.authorizationRequestId}`)
      throw new Error("organization_application_authorization_receipt_mismatch");
    await validateEnrollmentMaterialIntegrity(enrollmentDraft(snapshot));
    this.#active();
    return snapshot;
  }

  async #write(draft: ApplicationEnrollmentDraft, revision?: number): Promise<ApplicationEnrollmentSnapshot> {
    this.#active();
    validateEnrollmentDraft(draft);
    const expected = structuredClone(draft);
    await validateEnrollmentMaterialIntegrity(expected);
    this.#active();
    const saved = revision === undefined
      ? await this.#options.vault.stage(structuredClone(expected))
      : await this.#options.vault.advance(structuredClone(expected), revision);
    validateEnrollmentSnapshot(saved);
    if ((revision !== undefined && saved.revision !== revision + 1) || !sameEnrollmentValue(enrollmentDraft(saved), expected))
      throw new Error("organization_application_authorization_storage_mismatch");
    this.#active();
    return structuredClone(saved);
  }

  async #resume(state: ApplicationEnrollmentSnapshot): Promise<ApplicationEnrollmentProgress> {
    this.#active();
    if (state.status === "prepared") return this.#requestApproval(state);
    if (state.status === "approval_required") {
      if (state.expiresAt <= this.#time()) throw new Error("organization_application_authorization_expired");
      return approval(state);
    }
    if (state.status === "redeeming") return this.#redeem(state);
    await this.#activate(state.receipt);
    return { status: "enrolled", receipt: { ...state.receipt } };
  }

  async #requestApproval(state: Extract<ApplicationEnrollmentSnapshot, { status: "prepared" }>): Promise<ApplicationEnrollmentProgress> {
    const request = {
      authorizationRequestId: state.authorizationRequestId, redirectUri: state.redirectUri,
      state: state.state, codeChallenge: state.codeChallenge, targetIdentityId: state.targetIdentityId,
      targetDeviceId: state.targetDeviceId, targetSigningKeyHash: state.targetSigningKeyHash,
      targetMlsCredentialHash: state.targetMlsCredentialHash,
    };
    const receipt = await this.#options.transport.createEnterpriseAuthorizationRequest(state.applicationId, request);
    this.#active();
    if (receipt.authorizationRequestId !== state.authorizationRequestId ||
        !Number.isSafeInteger(receipt.expiresAt) || receipt.expiresAt <= this.#time() ||
        typeof receipt.duplicate !== "boolean" || !isEnrollmentHttpsUrl(receipt.authorizationUrl))
      throw new Error("organization_application_authorization_receipt_mismatch");
    if (this.#options.authorizationOrigin !== undefined && receipt.authorizationUrl !==
        `${this.#options.authorizationOrigin}/enterprise/authorize/${state.authorizationRequestId}`)
      throw new Error("organization_application_authorization_receipt_mismatch");
    const saved = await this.#write({ ...enrollmentDraft(state), status: "approval_required",
      authorizationUrl: receipt.authorizationUrl, expiresAt: receipt.expiresAt }, state.revision);
    if (saved.status !== "approval_required") throw new Error("organization_application_authorization_storage_mismatch");
    return approval(saved);
  }

  async #redeem(state: Extract<ApplicationEnrollmentSnapshot, { status: "redeeming" }>): Promise<ApplicationEnrollmentProgress> {
    // The callback/code is already durable. Reconstruct the deterministic Ed25519
    // V1 proof from that exact state; never mint new PKCE material on a retry.
    const material = snapshotEnrollmentProof(
      await this.#options.device.prepareRedemption(structuredClone(state)),
    );
    this.#active();
    if (material.authorizationRequestId !== state.authorizationRequestId || material.code !== state.code ||
        material.codeVerifier !== state.codeVerifier || material.targetMlsCredential !== state.targetMlsCredential)
      throw new Error("organization_application_authorization_proof_mismatch");
    decodeEnrollmentBytes(material.targetSignature, 64).fill(0);
    const key = decodeEnrollmentBytes(material.targetSigningPublicKey, 32);
    try {
      const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(key).buffer));
      try {
        if (encodeEnrollmentBytes(hash) !== state.targetSigningKeyHash)
          throw new Error("organization_application_authorization_proof_mismatch");
      } finally { hash.fill(0); }
    } finally { key.fill(0); }
    this.#active();
    const receipt = await this.#options.transport.redeemEnterpriseAuthorization(state.applicationId, { ...material });
    validateEnrollmentReceipt(receipt);
    if (receipt.applicationId !== state.applicationId || receipt.authorizationRequestId !== state.authorizationRequestId ||
        receipt.identityId !== state.targetIdentityId || receipt.deviceId !== state.targetDeviceId)
      throw new Error("organization_application_enrollment_receipt_mismatch");
    // Persist the server result before activation. A cancellation, vault lock or
    // lost local commit leaves the exact redeeming draft available for retry.
    const draft: ApplicationEnrollmentDraft = { status: "enrolled", applicationId: state.applicationId,
      accountId: receipt.accountId, targetIdentityId: state.targetIdentityId, targetDeviceId: state.targetDeviceId,
      authorizationRequestId: state.authorizationRequestId, receipt: { ...receipt } };
    const saved = await this.#write(draft, state.revision);
    if (saved.status !== "enrolled") throw new Error("organization_application_authorization_storage_mismatch");
    await this.#activate(saved.receipt);
    return { status: "enrolled", receipt: { ...saved.receipt } };
  }

  async #activate(receipt: ApplicationEnrollmentReceipt): Promise<void> {
    this.#active();
    await this.#options.activator.activate({ ...receipt });
    this.#active();
    await this.#options.device.authenticate({ ...receipt });
    this.#active();
  }

  #time(): number {
    const now = this.#now();
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("invalid_organization_application_time");
    return now;
  }
}

function approval(state: Extract<ApplicationEnrollmentSnapshot, { status: "approval_required" }>): ApplicationEnrollmentProgress {
  return { status: "approval_required", authorizationUrl: state.authorizationUrl, expiresAt: state.expiresAt, targetDeviceId: state.targetDeviceId };
}
