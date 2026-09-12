import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
const crypto = webcrypto;
export const app = "app_0123456789abcdef";
export const identity = "id_0123456789abcdef";
export const deviceId = "dev_0123456789abcdef";
export const requestId = "ear_0123456789abcdef";
export const origin = "https://service.example";
export const scope = { redirectUri: "https://app.example/callback", targetIdentityId: identity, targetDeviceId: deviceId };
const encode = bytes => Buffer.from(bytes).toString("base64url");
const decode = text => new Uint8Array(Buffer.from(text, "base64url"));
const text = value => new TextEncoder().encode(value);
const hash = async bytes => encode(await crypto.subtle.digest("SHA-256", bytes));

// Encrypted test storage with real AES-GCM and CAS; NOT the production IndexedDB vault.
export async function encryptedStore() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  let record = null;
  const hooks = { failStatus: undefined, mutateReturn: undefined, afterCommit: undefined };
  async function save(draft, expected) {
    if ((record?.revision ?? 0) !== expected) throw new Error("test_cas_conflict");
    if (draft.status === hooks.failStatus) { hooks.failStatus = undefined; throw new Error("test_storage_failure"); }
    const revision = expected + 1;
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = text(JSON.stringify(draft));
    let ciphertext;
    try { ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: text(String(revision)) }, key, plaintext)); }
    finally { plaintext.fill(0); }
    if ((record?.revision ?? 0) !== expected) throw new Error("test_cas_conflict");
    record = { revision, nonce, ciphertext };
    const result = { ...structuredClone(draft), revision };
    hooks.afterCommit?.(result);
    hooks.mutateReturn?.(result);
    return result;
  }
  return {
    hooks,
    ciphertext: () => Uint8Array.from(record?.ciphertext ?? []),
    async read() {
      if (!record) return null;
      const captured = record;
      const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: captured.nonce, additionalData: text(String(captured.revision)) }, key, captured.ciphertext));
      try { return { ...JSON.parse(new TextDecoder().decode(bytes)), revision: captured.revision }; }
      finally { bytes.fill(0); }
    },
    stage: draft => save(draft, 0),
    advance: (draft, revision) => save(draft, revision),
    async retire(revision) {
      if (record?.revision !== revision) throw new Error("test_cas_conflict");
      record = null;
    },
  };
}

export async function fixture(Coordinator) {
  const vault = await encryptedStore();
  const keys = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const credential = text("opaque-test-MLS-credential-not-an-interoperability-vector");
  const calls = { prepare: 0, proof: 0, activate: 0, authenticate: 0, requests: [], redemptions: [] };
  const control = { lostRequest: false, lostRedemption: false, activationFailure: false, sessionFailure: false, closed: false, now: 1_000, requestMutation: undefined, receiptMutation: undefined, proofMutation: undefined, beforePrepare: undefined };
  let issued;
  let enrolled;
  let acceptedProof;
  const device = {
    async prepare() {
      calls.prepare++;
      await control.beforePrepare?.();
      const codeVerifier = encode(crypto.getRandomValues(new Uint8Array(32)));
      return { state: encode(crypto.getRandomValues(new Uint8Array(24))), codeVerifier,
        codeChallenge: await hash(text(codeVerifier)), targetSigningKeyHash: await hash(publicKey),
        targetMlsCredentialHash: await hash(credential), targetMlsCredential: encode(credential) };
    },
    async prepareRedemption(state) {
      calls.proof++;
      assert.equal((await vault.read()).status, "redeeming", "callback must be durable before signing");
      const transcript = await makeTranscript(state, publicKey);
      const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, transcript));
      const proof = { authorizationRequestId: state.authorizationRequestId, code: state.code, codeVerifier: state.codeVerifier,
        targetSigningPublicKey: encode(publicKey), targetMlsCredential: state.targetMlsCredential, targetSignature: encode(signature) };
      control.proofMutation?.(proof);
      return proof;
    },
    async authenticate(receipt) {
      calls.authenticate++;
      assert.equal((await vault.read()).status, "enrolled");
      assert.equal(receipt.deviceId, deviceId);
      if (control.sessionFailure) { control.sessionFailure = false; throw new Error("test_session_failure"); }
    },
  };
  const transport = {
    async createEnterpriseAuthorizationRequest(applicationId, input) {
      assert.equal((await vault.read()).status, "prepared", "request must follow durable PKCE");
      assert.equal(applicationId, app);
      calls.requests.push(structuredClone(input));
      if (!issued) issued = { authorizationRequestId: input.authorizationRequestId,
        authorizationUrl: `${origin}/enterprise/authorize/${input.authorizationRequestId}`, expiresAt: 301_000, duplicate: false };
      const response = { ...issued, duplicate: calls.requests.length > 1 };
      control.requestMutation?.(response, input);
      if (control.lostRequest) { control.lostRequest = false; throw new Error("test_lost_request"); }
      return response;
    },
    async redeemEnterpriseAuthorization(applicationId, material) {
      calls.redemptions.push(structuredClone(material));
      const state = await vault.read();
      assert.equal(state.status, "redeeming");
      const verified = await crypto.subtle.verify("Ed25519", keys.publicKey, decode(material.targetSignature), await makeTranscript(state, publicKey));
      assert.equal(verified, true);
      if (!enrolled) {
        acceptedProof = structuredClone(material);
        enrolled = { enrolled: true, applicationId, authorizationRequestId: material.authorizationRequestId,
          accountId: "acct_0123456789abcdef", identityId: identity, deviceId, duplicate: false };
      } else assert.deepEqual(material, acceptedProof, "ambiguous redemption must retry exact proof");
      const receipt = { ...enrolled, duplicate: calls.redemptions.length > 1 };
      control.receiptMutation?.(receipt);
      if (control.lostRedemption) { control.lostRedemption = false; throw new Error("test_lost_redemption"); }
      return receipt;
    },
  };
  const activator = { async activate(receipt) {
    calls.activate++;
    assert.equal((await vault.read()).status, "enrolled", "activation cannot precede durable enrollment receipt");
    assert.equal(receipt.identityId, identity);
    if (control.activationFailure) { control.activationFailure = false; throw new Error("test_activation_failure"); }
  } };
  const options = { applicationId: app, authorizationOrigin: origin, vault, device, transport, activator,
    scope: { ...scope }, newRequestId: () => requestId, now: () => control.now,
    assertActive: () => { if (control.closed) throw new Error("test_closed"); } };
  const reopen = (extra = {}) => new Coordinator({ ...options, ...extra });
  const owner = reopen();
  const callback = async () => ({ state: (await vault.read()).state, code: encode(new Uint8Array(32).fill(7)) });
  return { owner, reopen, vault, calls, control, callback, options };
}

async function makeTranscript(state, publicKey) {
  return text("NEKON-ENTERPRISE-AUTHORIZATION-CODE-REDEMPTION-V1\0" + JSON.stringify({
    protocolVersion: 1, applicationId: state.applicationId, authorizationRequestId: state.authorizationRequestId,
    targetDeviceId: state.targetDeviceId, authorizationCodeHash: await hash(decode(state.code)),
    codeVerifierHash: await hash(text(state.codeVerifier)), targetSigningKeyHash: await hash(publicKey),
    targetMlsCredentialHash: await hash(decode(state.targetMlsCredential)),
  }));
}
