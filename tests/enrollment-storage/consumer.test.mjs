import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationEnrollmentCoordinator } from '@nekon/sdk/application-enrollment';
import { openBoundApplicationEnrollmentVault as open } from '@nekon/sdk/application-enrollment-storage';
import { openBoundApplicationEnrollmentVault as runtimeOpen } from '@nekon/client-runtime/application-enrollment-storage';
import { registerEnrollmentBindingCases } from './upstream-binding-cases.mjs';
import { compositionFixture, scope } from './composition-fixture.mjs';
registerEnrollmentBindingCases(test, open);
const fixture = () => compositionFixture(ApplicationEnrollmentCoordinator, open);
const zeroed = buffers => assert.ok(buffers.every(bytes => bytes.every(byte => byte === 0)));

test('SDK storage entry delegates to the exact runtime export', () => assert.equal(open, runtimeOpen));
test('coordinator and bound store compose through all four states with correct revisions', async () => {
  const f = await fixture(); const owner = await f.reopen(true);
  assert.equal(await owner.read(), null);
  const progress = await owner.begin(scope); const saved = await owner.read();
  assert.equal(progress.status, 'approval_required'); assert.equal(saved.revision, 3);
  assert.ok(!Buffer.from(f.snapshot().ciphertext).includes(Buffer.from(saved.codeVerifier)));
  assert.equal((await owner.acceptCallback(await f.callback())).status, 'enrolled');
  assert.equal((await owner.read()).revision, 5);
  assert.deepEqual(f.calls.writes.map(w => w.status), ['binding', 'prepared', 'approval_required', 'redeeming', 'enrolled']);
  zeroed(f.calls.readBuffers); zeroed(f.calls.writeBuffers);
});
for (const status of ['prepared', 'approval_required', 'redeeming', 'enrolled']) {
  test(`composed ${status} state resumes using the same binding and preparation`, async () => {
    const f = await fixture(); let owner = await f.reopen(true);
    if (status === 'prepared') { f.control.loseApproval = true; await assert.rejects(owner.begin(scope)); }
    else {
      await owner.begin(scope);
      if (status === 'redeeming') { f.control.loseRedemption = true; await assert.rejects(owner.acceptCallback(await f.callback())); }
      if (status === 'enrolled') await owner.acceptCallback(await f.callback());
    }
    assert.equal((await owner.read()).status, status);
    const writes = f.calls.writes.length; const requests = f.calls.requests.length;
    owner = await f.reopen(); await owner.resume();
    assert.equal(f.calls.prepare, 1);
    if (status === 'prepared') assert.deepEqual(f.calls.requests[0], f.calls.requests[1]);
    else assert.equal(f.calls.requests.length, requests);
    if (status === 'redeeming') assert.deepEqual(f.calls.redemptions[0], f.calls.redemptions[1]);
    if (['approval_required', 'enrolled'].includes(status)) assert.equal(f.calls.writes.length, writes);
  });
}
for (const field of ['serviceOrigin', 'applicationId', 'redirectUri', 'targetIdentityId', 'targetDeviceId', 'targetSigningKeyHash', 'targetMlsCredentialHash']) {
  test(`completed enrollment cannot reopen a different ${field}`, async () => {
    const f = await fixture(); const owner = await f.reopen(true);
    await owner.begin(scope); await owner.acceptCallback(await f.callback());
    const before = f.snapshot(); const activationCount = f.calls.activate;
    const substitute = field === 'serviceOrigin' ? 'https://other.example' :
      field === 'redirectUri' ? 'https://app.example/other' :
      field.endsWith('Hash') ? Buffer.alloc(32, 9).toString('base64url') :
      field === 'applicationId' ? 'app_fedcba9876543210' :
      field === 'targetIdentityId' ? 'id_fedcba9876543210' : 'dev_fedcba9876543210';
    await assert.rejects(f.open({ ...f.binding, [field]: substitute }), /application_enrollment_binding_mismatch/);
    assert.deepEqual(f.snapshot(), before); assert.equal(f.calls.activate, activationCount);
    zeroed(f.calls.readBuffers);
  });
}
test('coordinator retirement preserves service binding and never resets its namespace', async () => {
  const f = await fixture(); const owner = await f.reopen(true);
  await owner.begin(scope); await owner.acceptCallback(await f.callback());
  await owner.retire(); assert.equal(await owner.read(), null);
  const retired = f.snapshot();
  await assert.rejects(f.open({ ...f.binding, serviceOrigin: 'https://other.example' }, true), /binding_mismatch/);
  assert.deepEqual(f.snapshot(), retired); assert.equal(retired.revision, 6);
  await (await f.reopen()).begin(scope); assert.equal((await f.store().read()).revision, 8);
});
for (const failure of ['activationFailure', 'authenticationFailure']) {
  test(`bound saved receipt recovers ${failure} without another redemption`, async () => {
    const f = await fixture(); const owner = await f.reopen(true); await owner.begin(scope);
    f.control[failure] = true; await assert.rejects(owner.acceptCallback(await f.callback()));
    assert.equal((await owner.read()).status, 'enrolled');
    const stored = f.snapshot(); await (await f.reopen()).resume();
    assert.deepEqual(f.snapshot(), stored); assert.equal(f.calls.redemptions.length, 1);
  });
}
for (const status of ['prepared', 'redeeming', 'enrolled']) {
  test(`bound persistence failure before ${status} retains the prior durable state`, async () => {
    const f = await fixture(); const owner = await f.reopen(true);
    if (status !== 'prepared') await owner.begin(scope);
    f.control.failBefore = status;
    await assert.rejects(status === 'prepared' ? owner.begin(scope) : owner.acceptCallback(await f.callback()), /test_before_commit/);
    if (status === 'prepared') { assert.equal(await owner.read(), null); assert.equal(f.calls.requests.length, 0); }
    if (status === 'redeeming') { assert.equal((await owner.read()).status, 'approval_required'); assert.equal(f.calls.proof, 0); }
    if (status === 'enrolled') {
      assert.equal((await owner.read()).status, 'redeeming'); assert.equal(f.calls.activate, 0);
      await (await f.reopen()).resume(); assert.deepEqual(f.calls.redemptions[0], f.calls.redemptions[1]);
    }
    zeroed(f.calls.writeBuffers);
  });
}
test('lost receipt commit reply resumes saved enrollment instead of re-redeeming', async () => {
  const f = await fixture(); const owner = await f.reopen(true); await owner.begin(scope);
  f.control.failAfter = 'enrolled'; await assert.rejects(owner.acceptCallback(await f.callback()), /test_after_commit/);
  assert.equal((await owner.read()).status, 'enrolled'); assert.equal(f.calls.activate, 0);
  await (await f.reopen()).resume(); assert.equal(f.calls.redemptions.length, 1);
});
test('lock after binding persistence leaves a reopenable same-service envelope', async () => {
  const f = await fixture(); f.control.closeAfter = 'binding';
  await assert.rejects(f.reopen(true), /test_closed/); assert.equal(f.calls.prepare, 0);
  f.control.active = true; f.control.closeAfter = undefined;
  const owner = await f.reopen(); assert.equal(await owner.read(), null);
  await owner.begin(scope); assert.equal(f.calls.writes[0].status, 'binding');
  zeroed(f.calls.writeBuffers);
});
test('authentication-tag corruption fails before preparation or HTTP and is retained', async () => {
  const f = await fixture(); const owner = await f.reopen(true); await owner.begin(scope);
  f.corrupt(); const corrupt = f.snapshot(); const requests = f.calls.requests.length;
  await assert.rejects(f.reopen(), { name: 'OperationError' });
  assert.deepEqual(f.snapshot(), corrupt); assert.equal(f.calls.requests.length, requests);
});
test('incomplete coordinator retirement cannot discard an ambiguous bound draft', async () => {
  const f = await fixture(); const owner = await f.reopen(true); await owner.begin(scope);
  const before = f.snapshot(); await assert.rejects(owner.retire(), /authorization_incomplete/);
  assert.deepEqual(f.snapshot(), before);
});
test('raw storage implementation and validation helpers are not package entry points', async () => {
  for (const name of ['application-enrollment-bound-vault', 'application-enrollment-validation']) {
    await assert.rejects(import(`@nekon/client-runtime/${name}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    await assert.rejects(import(`@nekon/client-runtime/dist/${name}.js`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
});
