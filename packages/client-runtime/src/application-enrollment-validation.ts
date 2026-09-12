import type {
  ApplicationEnrollmentDraft,
  ApplicationEnrollmentProof,
  ApplicationEnrollmentReceipt,
  ApplicationEnrollmentScope,
  ApplicationEnrollmentSnapshot,
} from "./application-enrollment-types";

export const MAX_APPLICATION_ENROLLMENT_RECORD_BYTES = 128 * 1_024;
const scopeKeys = ["applicationId", "authorizationRequestId", "redirectUri", "targetIdentityId", "targetDeviceId", "state", "codeVerifier", "codeChallenge", "targetSigningKeyHash", "targetMlsCredentialHash", "targetMlsCredential"];
const receiptKeys = ["enrolled", "applicationId", "authorizationRequestId", "accountId", "identityId", "deviceId", "duplicate"];

export function requireEnrollmentId(value: unknown, prefix: "acct" | "app" | "id" | "dev" | "ear"): asserts value is string {
  if (typeof value !== "string" || value.length > prefix.length + 129 ||
      !value.startsWith(`${prefix}_`) || !/^[A-Za-z0-9_-]{16,128}$/u.test(value.slice(prefix.length + 1)))
    throw new Error(`invalid_${prefix}_id`);
}

export function isEnrollmentHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4_096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" &&
      url.hash === "" && url.toString() === value;
  } catch { return false; }
}

export function validateEnrollmentScope(value: ApplicationEnrollmentScope): void {
  if (!isEnrollmentHttpsUrl(value.redirectUri)) throw new Error("invalid_organization_application_redirect_uri");
  requireEnrollmentId(value.targetIdentityId, "id");
  requireEnrollmentId(value.targetDeviceId, "dev");
}

export function decodeEnrollmentBytes(value: unknown, minimum: number, maximum = minimum): Uint8Array {
  if (typeof value !== "string" || value.length > Math.ceil(maximum * 4 / 3) || !/^[A-Za-z0-9_-]+$/u.test(value))
    throw new Error("invalid_base64url");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytes.length < minimum || bytes.length > maximum || encodeEnrollmentBytes(bytes) !== value) {
    bytes.fill(0);
    throw new Error("invalid_base64url");
  }
  return bytes;
}

export function encodeEnrollmentBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function hasEnrollmentKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateEnrollmentReceipt(value: unknown): asserts value is ApplicationEnrollmentReceipt {
  if (!record(value) || !hasEnrollmentKeys(value, receiptKeys) || value.enrolled !== true || typeof value.duplicate !== "boolean")
    throw new Error("organization_application_enrollment_receipt_mismatch");
  requireEnrollmentId(value.applicationId, "app");
  requireEnrollmentId(value.authorizationRequestId, "ear");
  requireEnrollmentId(value.accountId, "acct");
  requireEnrollmentId(value.identityId, "id");
  requireEnrollmentId(value.deviceId, "dev");
}

/** No new stored generation: validate the existing four-state V1 vocabulary. */
export function validateEnrollmentDraft(value: unknown): asserts value is ApplicationEnrollmentDraft {
  try {
    if (!record(value)) throw new Error();
    requireEnrollmentId(value.applicationId, "app");
    requireEnrollmentId(value.targetIdentityId, "id");
    requireEnrollmentId(value.targetDeviceId, "dev");
    requireEnrollmentId(value.authorizationRequestId, "ear");
    if (value.status === "enrolled") {
      if (!hasEnrollmentKeys(value, ["status", "applicationId", "accountId", "targetIdentityId", "targetDeviceId", "authorizationRequestId", "receipt"])) throw new Error();
      validateEnrollmentReceipt(value.receipt);
      if (value.accountId !== value.receipt.accountId || value.applicationId !== value.receipt.applicationId ||
          value.authorizationRequestId !== value.receipt.authorizationRequestId || value.targetIdentityId !== value.receipt.identityId ||
          value.targetDeviceId !== value.receipt.deviceId) throw new Error();
      return;
    }
    if (value.status !== "prepared" && value.status !== "approval_required" && value.status !== "redeeming") throw new Error();
    const keys = ["status", ...scopeKeys];
    if (value.status !== "prepared") keys.push("authorizationUrl", "expiresAt");
    if (value.status === "redeeming") keys.push("code");
    if (!hasEnrollmentKeys(value, keys) || !isEnrollmentHttpsUrl(value.redirectUri) ||
        typeof value.codeVerifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/u.test(value.codeVerifier)) throw new Error();
    decodeEnrollmentBytes(value.state, 24).fill(0);
    for (const key of ["codeChallenge", "targetSigningKeyHash", "targetMlsCredentialHash"])
      decodeEnrollmentBytes(value[key], 32).fill(0);
    decodeEnrollmentBytes(value.targetMlsCredential, 1, 64 * 1_024).fill(0);
    if (value.status !== "prepared" && (!isEnrollmentHttpsUrl(value.authorizationUrl) ||
        !Number.isSafeInteger(value.expiresAt) || Number(value.expiresAt) < 0)) throw new Error();
    if (value.status === "redeeming") decodeEnrollmentBytes(value.code, 32).fill(0);
  } catch { throw new Error("organization_application_authorization_corrupt"); }
}

export function validateEnrollmentSnapshot(value: unknown): asserts value is ApplicationEnrollmentSnapshot {
  if (!record(value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1)
    throw new Error("organization_application_authorization_corrupt");
  const { revision: _, ...draft } = value;
  validateEnrollmentDraft(draft);
}

type DraftOf<T> = T extends unknown ? Omit<T, "revision"> : never;
export function enrollmentDraft<T extends ApplicationEnrollmentSnapshot>(value: T): DraftOf<T> {
  const { revision: _, ...draft } = value;
  return draft as DraftOf<T>;
}

export function assertEnrollmentScope(state: ApplicationEnrollmentSnapshot, applicationId: string, scope: ApplicationEnrollmentScope): void {
  if (state.applicationId !== applicationId || state.targetIdentityId !== scope.targetIdentityId ||
      state.targetDeviceId !== scope.targetDeviceId || (state.status !== "enrolled" && state.redirectUri !== scope.redirectUri))
    throw new Error("organization_application_authorization_pending");
}

export function equalEnrollmentState(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length > 171) return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  a.fill(0); b.fill(0);
  return difference === 0;
}

/** Stable comparison for bounded, validated JSON data from a storage adapter. */
export function sameEnrollmentValue(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (!record(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Check relationships between existing V1 fields, not only their byte shapes.
 * The caller owns the validated draft; this function snapshots hash inputs before
 * awaiting crypto and never repairs or rewrites an inconsistent retry record.
 */
export async function validateEnrollmentMaterialIntegrity(
  draft: ApplicationEnrollmentDraft,
): Promise<void> {
  validateEnrollmentDraft(draft);
  if (draft.status === "enrolled") return;
  const expectedChallenge = draft.codeChallenge;
  const expectedCredentialHash = draft.targetMlsCredentialHash;
  const verifier = new Uint8Array(draft.codeVerifier.length);
  new TextEncoder().encodeInto(draft.codeVerifier, verifier);
  const credential = decodeEnrollmentBytes(draft.targetMlsCredential, 1, 64 * 1_024);
  const credentialInput = Uint8Array.from(credential);
  let challenge: Uint8Array | undefined;
  let credentialHash: Uint8Array | undefined;
  try {
    // Sequential awaits keep cleanup bounded even when one crypto call fails.
    challenge = new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", verifier.buffer),
    );
    credentialHash = new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", credentialInput.buffer),
    );
    if (encodeEnrollmentBytes(challenge) !== expectedChallenge ||
        encodeEnrollmentBytes(credentialHash) !== expectedCredentialHash)
      throw new Error();
  } catch {
    // Do not attach provider errors or indicate which sensitive value differed.
    throw new Error("organization_application_authorization_corrupt");
  } finally {
    verifier.fill(0);
    credential.fill(0);
    credentialInput.fill(0);
    challenge?.fill(0);
    credentialHash?.fill(0);
  }
}

/** Own the exact bounded proof before any asynchronous validation or dispatch. */
export function snapshotEnrollmentProof(value: unknown): ApplicationEnrollmentProof {
  try {
    const keys = ["authorizationRequestId", "code", "codeVerifier", "targetSigningPublicKey", "targetMlsCredential", "targetSignature"];
    if (!record(value) || !hasEnrollmentKeys(value, keys)) throw new Error();
    const proof = { ...value };
    requireEnrollmentId(proof.authorizationRequestId, "ear");
    if (typeof proof.codeVerifier !== "string" ||
        !/^[A-Za-z0-9._~-]{43,128}$/u.test(proof.codeVerifier)) throw new Error();
    decodeEnrollmentBytes(proof.code, 32).fill(0);
    decodeEnrollmentBytes(proof.targetSigningPublicKey, 32).fill(0);
    decodeEnrollmentBytes(proof.targetMlsCredential, 1, 64 * 1_024).fill(0);
    decodeEnrollmentBytes(proof.targetSignature, 64).fill(0);
    return Object.freeze(proof) as unknown as ApplicationEnrollmentProof;
  } catch {
    throw new Error("organization_application_authorization_proof_mismatch");
  }
}