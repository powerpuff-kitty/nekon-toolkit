// TEST ONLY storage/device/service adapters with real AES-GCM/CAS and Ed25519.
// The proof builder is the actual extracted V1 implementation, verified against
// an independently constructed service-shaped transcript. This is not MLS,
// LocalSecretVault, IndexedDB or a live enrollment service.
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
import { createEnterpriseAuthorizationRedemptionWithSigner as createProof } from '@nekon/sdk/application-enrollment-proof';
const text = value => new TextEncoder().encode(value);
const encode = bytes => Buffer.from(bytes).toString('base64url');
const decode = value => new Uint8Array(Buffer.from(value, 'base64url'));
const hash = async bytes => encode(await crypto.subtle.digest('SHA-256', bytes));
export const applicationId = 'app_0123456789abcdef';
export const requestId = 'ear_0123456789abcdef';
export const serviceOrigin = 'https://service.example';
export const scope = Object.freeze({ redirectUri: 'https://app.example/callback',
  targetIdentityId: 'id_0123456789abcdef', targetDeviceId: 'dev_0123456789abcdef' });
const RECORD = 'organization:application-authorization';
const KIND = 'enterprise_provisioning';

export async function compositionFixture(Coordinator, openBoundVault) {
  const encryptionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const signing = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', signing.publicKey));
  const credential = text('TEST ONLY opaque credential, not an OpenMLS credential');
  const binding = Object.freeze({ purpose: 'browser-application-enrollment', serviceOrigin,
    applicationId, ...scope, targetSigningKeyHash: await hash(publicKey), targetMlsCredentialHash: await hash(credential) });
  const calls = { prepare: 0, proof: 0, requests: [], redemptions: [], activate: 0, authenticate: 0,
    writes: [], readBuffers: [], writeBuffers: [] };
  const control = { active: true, loseApproval: false, loseRedemption: false, failBefore: undefined,
    failAfter: undefined, closeAfter: undefined, activationFailure: false, authenticationFailure: false };
  let record = null;
  let currentStore;
  const active = () => { if (!control.active) throw new Error('test_closed'); };
  const aad = revision => text(`TEST-ONLY-Vault\0${RECORD}\0${KIND}\0${revision}`);
  const vault = {
    async read(id, kind) {
      assert.equal(id, RECORD); assert.equal(kind, KIND);
      const captured = record;
      if (captured === null || captured.deleted) return null;
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM',
        iv: captured.iv, additionalData: aad(captured.revision) }, encryptionKey, captured.ciphertext));
      calls.readBuffers.push(plaintext);
      return { plaintext, revision: captured.revision };
    },
    async inspectRecord(id, kind) {
      assert.equal(id, RECORD); assert.equal(kind, KIND);
      return record === null ? null : { revision: record.revision, deleted: record.deleted ?? false };
    },
    async write(input) {
      assert.equal(input.recordId, RECORD); assert.equal(input.kind, KIND);
      calls.writeBuffers.push(input.plaintext);
      const bytes = Uint8Array.from(input.plaintext);
      try {
        const envelope = JSON.parse(new TextDecoder().decode(bytes));
        const status = envelope.draft?.status ?? 'binding';
        if (control.failBefore === status) { control.failBefore = undefined; throw new Error('test_before_commit'); }
        const revision = input.expectedRevision + 1;
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
          additionalData: aad(revision) }, encryptionKey, bytes));
        if ((record?.revision ?? 0) !== input.expectedRevision) throw new Error('test_cas_conflict');
        record = { revision, iv, ciphertext };
        calls.writes.push({ revision, status });
        if (control.closeAfter === status) control.active = false;
        if (control.failAfter === status) { control.failAfter = undefined; throw new Error('test_after_commit'); }
        return revision;
      } finally { bytes.fill(0); }
    },
  };
  const open = (context = binding, initializeNewVault = false) => openBoundVault({
    vault, binding: context, initializeNewVault, assertActive: active,
  });
  // Independent oracle: never ask the production builder for expected bytes.
  const transcript = async state => text('NEKON-ENTERPRISE-AUTHORIZATION-CODE-REDEMPTION-V1\0' + JSON.stringify({
    protocolVersion: 1, applicationId: state.applicationId,
    authorizationRequestId: state.authorizationRequestId, targetDeviceId: state.targetDeviceId,
    authorizationCodeHash: await hash(decode(state.code)),
    codeVerifierHash: await hash(text(state.codeVerifier)),
    targetSigningKeyHash: await hash(publicKey),
    targetMlsCredentialHash: await hash(decode(state.targetMlsCredential)),
  }));
  const device = {
    async prepare() {
      calls.prepare++;
      const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
      return { state: encode(crypto.getRandomValues(new Uint8Array(24))), codeVerifier: verifier,
        codeChallenge: await hash(text(verifier)), targetSigningKeyHash: binding.targetSigningKeyHash,
        targetMlsCredentialHash: binding.targetMlsCredentialHash, targetMlsCredential: encode(credential) };
    },
    async prepareRedemption(state) {
      calls.proof++;
      assert.equal((await currentStore.read()).status, 'redeeming');
      const code = decode(state.code);
      const persistedCredential = decode(state.targetMlsCredential);
      try {
        return await createProof({
          applicationId: state.applicationId, authorizationRequestId: state.authorizationRequestId,
          targetDeviceId: state.targetDeviceId, code, codeVerifier: state.codeVerifier,
          targetSigningPublicKey: publicKey, targetMlsCredential: persistedCredential, crypto,
          sign: async payload => new Uint8Array(await crypto.subtle.sign('Ed25519', signing.privateKey, payload)),
        });
      } finally { code.fill(0); persistedCredential.fill(0); }
    },
    async authenticate() {
      calls.authenticate++; assert.equal((await currentStore.read()).status, 'enrolled');
      if (control.authenticationFailure) { control.authenticationFailure = false; throw new Error('test_auth_failure'); }
    },
  };
  const transport = {
    async createEnterpriseAuthorizationRequest(app, input) {
      assert.equal(app, applicationId); assert.equal((await currentStore.read()).status, 'prepared');
      calls.requests.push(structuredClone(input));
      if (control.loseApproval) { control.loseApproval = false; throw new Error('test_lost_approval'); }
      return { authorizationRequestId: input.authorizationRequestId,
        authorizationUrl: `${serviceOrigin}/enterprise/authorize/${input.authorizationRequestId}`,
        expiresAt: 301000, duplicate: calls.requests.length > 1 };
    },
    async redeemEnterpriseAuthorization(app, proof) {
      assert.equal(app, applicationId);
      const state = await currentStore.read(); assert.equal(state.status, 'redeeming');
      assert.equal(proof.authorizationRequestId, state.authorizationRequestId);
      assert.equal(proof.code, state.code); assert.equal(proof.codeVerifier, state.codeVerifier);
      assert.equal(proof.targetSigningPublicKey, encode(publicKey));
      assert.equal(proof.targetMlsCredential, state.targetMlsCredential);
      const bytes = await transcript(state); const signature = decode(proof.targetSignature);
      try { assert.equal(await crypto.subtle.verify('Ed25519', signing.publicKey, signature, bytes), true); }
      finally { bytes.fill(0); signature.fill(0); }
      calls.redemptions.push(structuredClone(proof));
      if (control.loseRedemption) { control.loseRedemption = false; throw new Error('test_lost_redemption'); }
      return { enrolled: true, applicationId, authorizationRequestId: requestId,
        accountId: 'acct_0123456789abcdef', identityId: scope.targetIdentityId,
        deviceId: scope.targetDeviceId, duplicate: calls.redemptions.length > 1 };
    },
  };
  const activator = { async activate() {
    calls.activate++; assert.equal((await currentStore.read()).status, 'enrolled');
    if (control.activationFailure) { control.activationFailure = false; throw new Error('test_activation_failure'); }
  } };
  async function reopen(initializeNewVault = false) {
    currentStore = await open(binding, initializeNewVault);
    return new Coordinator({ applicationId, authorizationOrigin: serviceOrigin, scope,
      vault: currentStore, device, activator, transport, newRequestId: () => requestId,
      now: () => 1000, assertActive: active });
  }
  return { binding, control, calls, open, reopen, vault,
    snapshot: () => structuredClone(record),
    corrupt: () => { record.ciphertext[0] ^= 1; },
    store: () => currentStore,
    callback: async () => ({ state: (await currentStore.read()).state, code: encode(new Uint8Array(32).fill(7)) }),
  };
}
