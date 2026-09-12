import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const encode = bytes => Buffer.from(bytes).toString("base64url");
const text = value => new TextEncoder().encode(value);
const copy = value => structuredClone(value);
const binding = Object.freeze({
  purpose: "browser-application-enrollment", serviceOrigin: "https://service.example",
  applicationId: "app_0123456789abcdef", redirectUri: "https://app.example/callback",
  targetIdentityId: "id_0123456789abcdef", targetDeviceId: "dev_0123456789abcdef",
  targetSigningKeyHash: encode(new Uint8Array(32).fill(5)),
  targetMlsCredentialHash: encode(new Uint8Array(32).fill(6)),
});
const phases = ["prepared", "approval_required", "redeeming", "enrolled"];
function draft(status = "prepared") {
  const base = { applicationId: binding.applicationId, targetIdentityId: binding.targetIdentityId,
    targetDeviceId: binding.targetDeviceId, authorizationRequestId: "ear_0123456789abcdef", status };
  if (status === "enrolled") return { ...base, accountId: "acct_0123456789abcdef", receipt: {
    enrolled: true, applicationId: binding.applicationId, authorizationRequestId: base.authorizationRequestId,
    accountId: "acct_0123456789abcdef", identityId: binding.targetIdentityId, deviceId: binding.targetDeviceId, duplicate: false,
  } };
  return { ...base, redirectUri: binding.redirectUri, state: encode(new Uint8Array(24).fill(2)),
    codeVerifier: "A".repeat(43), codeChallenge: encode(new Uint8Array(32).fill(3)),
    targetSigningKeyHash: binding.targetSigningKeyHash, targetMlsCredentialHash: binding.targetMlsCredentialHash,
    targetMlsCredential: encode(text("opaque-synthetic-credential")),
    ...(status === "prepared" ? {} : { authorizationUrl: "https://service.example/approve", expiresAt: 9999999999999 }),
    ...(status === "redeeming" ? { code: encode(new Uint8Array(32).fill(4)) } : {}),
  };
}

// Real AES-GCM with in-memory CAS. This is NOT production LocalSecretVault,
// IndexedDB, KDF, MLS or a network service. Synthetic material stays in fixtures.
async function fixture(open) {
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  let stored = null, active = true;
  const observed = { writes: 0, buffers: [], failWrite: false, failAfterWrite: false, lieRevision: false };
  const aad = revision => text(`synthetic-vault\0organization:application-authorization\0enterprise_provisioning\0${revision}`);
  const vault = {
    async read(id, kind) {
      assert.equal(id, "organization:application-authorization"); assert.equal(kind, "enterprise_provisioning");
      if (!stored || stored.deleted) return null;
      const plaintext = new Uint8Array(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: stored.iv, additionalData: aad(stored.revision) }, key, stored.ciphertext));
      observed.buffers.push(plaintext);
      return { plaintext, revision: stored.revision };
    },
    async inspectRecord() { return stored ? { revision: stored.revision, deleted: stored.deleted ?? false } : null; },
    async write(input) {
      const bytes = Uint8Array.from(input.plaintext);
      try {
        if (observed.failWrite) throw new Error("fixture_write_failure");
        const revision = input.expectedRevision + 1;
        const iv = webcrypto.getRandomValues(new Uint8Array(12));
        const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(revision) }, key, bytes));
        if ((stored?.revision ?? 0) !== input.expectedRevision) throw new Error("fixture_cas_conflict");
        stored = { revision, iv, ciphertext }; observed.writes++;
        if (observed.failAfterWrite) throw new Error("fixture_lost_write_reply");
        return observed.lieRevision ? revision + 1 : revision;
      } finally { bytes.fill(0); }
    },
  };
  return {
    vault, observed,
    open: (context = binding, initializeNewVault = false) => open({ vault, binding: context, initializeNewVault,
      assertActive: () => { if (!active) throw new Error("fixture_closed"); } }),
    close: () => { active = false; },
    raw: () => stored,
    seed: async value => { await vault.write({ plaintext: text(JSON.stringify(value)), expectedRevision: stored?.revision ?? 0 }); },
    tombstone: () => { stored = { revision: 1, deleted: true }; },
  };
}
const rejects = (promise, code) => assert.rejects(promise, error => error.message === code);

export function registerEnrollmentBindingCases(test, open) {
  test("new vault binds before staging; reopening retains context and encrypts it", async () => {
    const f = await fixture(open); const owner = await f.open(binding, true);
    assert.equal(await owner.read(), null); assert.equal(f.observed.writes, 1);
    assert.equal(await (await f.open()).read(), null);
    assert.ok(!Buffer.from(f.raw().ciphertext).includes(text(binding.serviceOrigin)));
    assert.ok(f.observed.buffers.every(bytes => bytes.every(byte => byte === 0)));
  });
  for (const phase of phases) {
    test(`saved ${phase} retains binding and exact draft after reopen`, async () => {
      const f = await fixture(open); const owner = await f.open(binding, true);
      const value = draft(phase); const saved = await owner.stage(value);
      assert.deepEqual(await (await f.open()).read(), { ...value, revision: saved.revision });
      assert.equal(f.observed.writes, 2);
    });
  }
  const substitutions = {
    serviceOrigin: "https://other-service.example", applicationId: "app_fedcba9876543210",
    redirectUri: "https://app.example/other-callback", targetIdentityId: "id_fedcba9876543210",
    targetDeviceId: "dev_fedcba9876543210", targetSigningKeyHash: encode(new Uint8Array(32).fill(9)),
    targetMlsCredentialHash: encode(new Uint8Array(32).fill(9)),
  };
  for (const phase of phases) {
    test(`${phase} rejects every cross-context substitution without writing`, async () => {
      const f = await fixture(open); const owner = await f.open(binding, true); await owner.stage(draft(phase));
      const before = copy(f.raw());
      for (const [field, replacement] of Object.entries(substitutions)) {
        await rejects(f.open({ ...binding, [field]: replacement }), "application_enrollment_binding_mismatch");
      }
      assert.deepEqual(f.raw(), before);
    });
  }
  test("null-draft context and different HTTPS port also reject substitution", async () => {
    const f = await fixture(open); await f.open(binding, true);
    await rejects(f.open({ ...binding, serviceOrigin: "https://service.example:444" }), "application_enrollment_binding_mismatch");
    assert.equal(f.observed.writes, 1);
  });
  for (const phase of phases) {
    test(`legacy V1 ${phase} is retained and rejected even when initialization is requested`, async () => {
      const f = await fixture(open); await f.seed({ formatVersion: 1, ...draft(phase) }); const before = copy(f.raw());
      await rejects(f.open(binding, true), "application_enrollment_binding_legacy_unsupported");
      assert.deepEqual(f.raw(), before);
    });
  }
  for (const invalid of [null, 3, {}, { formatVersion: 3 }, { formatVersion: 2, binding, draft: null, extra: true },
    { formatVersion: 2, binding: { ...binding, purpose: "mls" }, draft: null },
    { formatVersion: 2, binding: { ...binding, extra: true }, draft: null }]) {
    test(`malformed/unknown envelope is blocked: ${JSON.stringify(invalid).slice(0, 45)}`, async () => {
      const f = await fixture(open); await f.seed(invalid);
      await rejects(f.open(), "application_enrollment_binding_corrupt"); assert.equal(f.observed.writes, 1);
    });
  }
  test("existing empty vault cannot be adopted", async () => {
    const f = await fixture(open); await rejects(f.open(), "application_enrollment_binding_missing");
    assert.equal(f.observed.writes, 0);
  });
  test("tombstone cannot be reset as a fresh binding", async () => {
    const f = await fixture(open); f.tombstone();
    await rejects(f.open(binding, true), "application_enrollment_binding_missing"); assert.equal(f.observed.writes, 0);
  });
  test("retirement preserves the binding, revision and ability to stage the same context", async () => {
    const f = await fixture(open); const owner = await f.open(binding, true); const staged = await owner.stage(draft());
    await owner.retire(staged.revision); assert.equal(await owner.read(), null);
    await rejects(f.open({ ...binding, applicationId: substitutions.applicationId }), "application_enrollment_binding_mismatch");
    assert.equal((await owner.stage(draft())).revision, 4);
  });
  test("stale advance and retire cannot erase newer state", async () => {
    const f = await fixture(open); const owner = await f.open(binding, true); const first = await owner.stage(draft());
    const second = await owner.advance(draft("approval_required"), first.revision);
    await rejects(owner.advance(draft("redeeming"), first.revision), "application_enrollment_binding_state_conflict");
    await rejects(owner.retire(first.revision), "application_enrollment_binding_state_conflict");
    assert.deepEqual(await owner.read(), second);
  });
  test("binding is rechecked on an already open handle before advance/retire/read", async () => {
    const f = await fixture(open); const owner = await f.open(binding, true); const first = await owner.stage(draft());
    await f.seed({ formatVersion: 2, binding: { ...binding, serviceOrigin: substitutions.serviceOrigin }, draft: draft() });
    for (const operation of [() => owner.read(), () => owner.advance(draft(), first.revision), () => owner.retire(first.revision)]) {
      await rejects(operation(), "application_enrollment_binding_mismatch");
    }
    assert.equal(f.observed.writes, 3);
  });
  test("concurrent creators do not overwrite the first binding", async () => {
    const f = await fixture(open);
    const outcomes = await Promise.allSettled([f.open(binding, true), f.open({ ...binding, serviceOrigin: substitutions.serviceOrigin }, true)]);
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.observed.writes, 1);
  });
  test("write failure before persistence remains missing and does not adopt on reopen", async () => {
    const f = await fixture(open); f.observed.failWrite = true;
    await rejects(f.open(binding, true), "fixture_write_failure"); f.observed.failWrite = false;
    await rejects(f.open(), "application_enrollment_binding_missing"); assert.equal(f.observed.writes, 0);
  });
  test("lost reply after binding persistence resumes the exact context", async () => {
    const f = await fixture(open); f.observed.failAfterWrite = true;
    await rejects(f.open(binding, true), "fixture_lost_write_reply"); f.observed.failAfterWrite = false;
    assert.equal(await (await f.open()).read(), null); assert.equal(f.observed.writes, 1);
  });
  test("input binding and draft are captured before awaits", async () => {
    const f = await fixture(open); const context = { ...binding }; const pending = f.open(context, true);
    context.serviceOrigin = substitutions.serviceOrigin; const owner = await pending;
    const value = draft(); const staged = owner.stage(value); value.targetDeviceId = substitutions.targetDeviceId;
    assert.equal((await staged).targetDeviceId, binding.targetDeviceId); await f.open();
  });
  test("cross-binding draft and approval origin are rejected before storage mutation", async () => {
    const f = await fixture(open); const owner = await f.open(binding, true);
    for (const change of [{ targetDeviceId: substitutions.targetDeviceId }, { redirectUri: substitutions.redirectUri },
      { targetSigningKeyHash: substitutions.targetSigningKeyHash }, { targetMlsCredentialHash: substitutions.targetMlsCredentialHash },
      { authorizationUrl: "https://other-service.example/approve" }]) {
      await rejects(owner.stage({ ...draft("approval_required"), ...change }), "application_enrollment_binding_mismatch");
    }
    assert.equal(f.observed.writes, 1);
  });
  test("write receipt revision mismatch fails rather than reporting a successful transition", async () => {
    const f = await fixture(open); const owner = await f.open(binding, true); f.observed.lieRevision = true;
    await rejects(owner.stage(draft()), "application_enrollment_binding_state_conflict");
  });
  test("closed owner performs no writes", async () => {
    const f = await fixture(open); const owner = await f.open(binding, true); f.close();
    await rejects(owner.stage(draft()), "fixture_closed"); await rejects(owner.read(), "fixture_closed");
    assert.equal(f.observed.writes, 1);
  });
  for (const serviceOrigin of ["http://service.example", "https://service.example/path", "https://user:pass@service.example", "https://service.example?x=1", "https://service.example/", "https://app.example"]) {
    test(`noncanonical or same-app service origin rejected (${serviceOrigin})`, async () => {
      const f = await fixture(open); await rejects(f.open({ ...binding, serviceOrigin }, true), "invalid_application_enrollment_binding");
      assert.equal(f.observed.writes, 0);
    });
  }
}
