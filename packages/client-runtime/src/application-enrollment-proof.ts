/** Existing V1 enrollment proof, shared by key-handle and SDK signer callers. */
const REDEMPTION_DOMAIN = "NEKON-ENTERPRISE-AUTHORIZATION-CODE-REDEMPTION-V1\0";
const MAX_CREDENTIAL_BYTES = 64 * 1_024;

export interface EnterpriseAuthorizationRedemptionProof {
  readonly authorizationRequestId: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly targetSigningPublicKey: string;
  readonly targetMlsCredential: string;
  readonly targetSignature: string;
}

export interface EnterpriseAuthorizationRedemptionSignerInput {
  readonly applicationId: string;
  readonly authorizationRequestId: string;
  readonly targetDeviceId: string;
  readonly code: Uint8Array;
  readonly codeVerifier: string;
  readonly targetSigningPublicKey: Uint8Array;
  readonly targetMlsCredential: Uint8Array;
  /** Owns only the supplied transcript copy; returns an owned signature. */
  readonly sign: (payload: Uint8Array) => Promise<Uint8Array>;
  readonly crypto?: Crypto;
  readonly signal?: AbortSignal;
}

/**
 * Construct the unchanged V1 proof without accepting a private-key handle.
 * This performs no HTTP, approval, callback validation or durable transition.
 * The enrollment coordinator must persist/reuse its exact draft and check the
 * approved callback state before calling this helper, then validate the receipt.
 */
export async function createEnterpriseAuthorizationRedemptionWithSigner(
  input: EnterpriseAuthorizationRedemptionSignerInput,
): Promise<EnterpriseAuthorizationRedemptionProof> {
  // Capture every scalar, callback and byte input before the first await.
  const {
    applicationId,
    authorizationRequestId,
    targetDeviceId,
    codeVerifier,
    sign,
    signal,
  } = input;
  const provider = input.crypto ?? globalThis.crypto;
  const assertActive = (): void => {
    if (signal?.aborted) throw new Error("enterprise_authorization_aborted");
  };
  assertActive();
  if (
    !isId(applicationId, "app") ||
    !isId(authorizationRequestId, "ear") ||
    !isId(targetDeviceId, "dev") ||
    typeof sign !== "function"
  )
    throw new Error("invalid_enterprise_authorization_binding");
  if (
    typeof codeVerifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/u.test(codeVerifier) ||
    !isBytes(input.code, 32, 32)
  )
    throw new Error("invalid_enterprise_authorization_code");
  if (
    !isBytes(input.targetSigningPublicKey, 32, 32) ||
    !isBytes(input.targetMlsCredential, 1, MAX_CREDENTIAL_BYTES)
  )
    throw new Error("invalid_enterprise_authorization_public_material");
  if (!provider?.subtle) throw new Error("web_crypto_required");

  const owned: Uint8Array[] = [];
  const remember = (bytes: Uint8Array): Uint8Array => {
    owned.push(bytes);
    return bytes;
  };
  const buffer = (bytes: Uint8Array): ArrayBuffer => {
    const copy = Uint8Array.from(bytes);
    remember(copy);
    return copy.buffer;
  };
  const code = remember(Uint8Array.from(input.code));
  const publicKey = remember(Uint8Array.from(input.targetSigningPublicKey));
  const credential = remember(Uint8Array.from(input.targetMlsCredential));
  const verifier = remember(new TextEncoder().encode(codeVerifier));
  let providerSignature: Uint8Array | undefined;
  const hash = async (bytes: Uint8Array): Promise<Uint8Array> => {
    assertActive();
    const result = remember(
      new Uint8Array(await provider.subtle.digest("SHA-256", buffer(bytes))),
    );
    assertActive();
    return result;
  };
  try {
    const codeHash = await hash(code);
    const verifierHash = await hash(verifier);
    const keyHash = await hash(publicKey);
    const credentialHash = await hash(credential);
    const authorization = remember(
      new TextEncoder().encode(
        JSON.stringify({
          protocolVersion: 1,
          applicationId,
          authorizationRequestId,
          targetDeviceId,
          authorizationCodeHash: encodeBase64Url(codeHash),
          codeVerifierHash: encodeBase64Url(verifierHash),
          targetSigningKeyHash: encodeBase64Url(keyHash),
          targetMlsCredentialHash: encodeBase64Url(credentialHash),
        }),
      ),
    );
    const domain = remember(new TextEncoder().encode(REDEMPTION_DOMAIN));
    const transcript = remember(
      new Uint8Array(domain.byteLength + authorization.byteLength),
    );
    transcript.set(domain);
    transcript.set(authorization, domain.byteLength);
    const signingCopy = remember(Uint8Array.from(transcript));
    assertActive();
    providerSignature = await sign(signingCopy);
    assertActive();
    if (!isBytes(providerSignature, 64, 64))
      throw new Error("invalid_enterprise_authorization_signature");
    // Verification uses independent copies, not signer-controlled buffers.
    const signature = remember(Uint8Array.from(providerSignature));
    const verifyKey = await provider.subtle.importKey(
      "raw",
      buffer(publicKey),
      "Ed25519",
      false,
      ["verify"],
    );
    assertActive();
    const valid = await provider.subtle.verify(
      "Ed25519",
      verifyKey,
      buffer(signature),
      buffer(transcript),
    );
    assertActive();
    if (!valid)
      throw new Error("enterprise_authorization_signature_self_check_failed");
    return Object.freeze({
      authorizationRequestId,
      code: encodeBase64Url(code),
      codeVerifier,
      targetSigningPublicKey: encodeBase64Url(publicKey),
      targetMlsCredential: encodeBase64Url(credential),
      targetSignature: encodeBase64Url(signature),
    });
  } finally {
    for (const bytes of owned) bytes.fill(0);
    if (providerSignature instanceof Uint8Array) providerSignature.fill(0);
  }
}

function isId(value: unknown, prefix: string): value is string {
  if (typeof value !== "string" || value.length > prefix.length + 129)
    return false;
  return value.startsWith(`${prefix}_`) &&
    /^[A-Za-z0-9_-]{16,128}$/u.test(value.slice(prefix.length + 1));
}

function isBytes(value: unknown, minimum: number, maximum: number): value is Uint8Array {
  return value instanceof Uint8Array &&
    value.byteLength >= minimum && value.byteLength <= maximum;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
