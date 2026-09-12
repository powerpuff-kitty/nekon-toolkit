import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationEnrollmentCoordinator as Coordinator } from '@nekon/sdk/application-enrollment';
import { ApplicationEnrollmentCoordinator as Runtime } from '@nekon/client-runtime/application-enrollment';
import { fixture, app, deviceId, origin, requestId, scope } from './enrollment-fixture.mjs';

// These tests exercise real coordinator code with the upstream AES-GCM/CAS and
// Ed25519 fixture. They do not substitute for production browser/MLS integration.
test('SDK and runtime exports use the same coordinator class', () => assert.equal(Coordinator, Runtime));
test('empty read/resume/retire do not create state or contact a service', async () => {
  const f = await fixture(Coordinator);
  assert.equal(await f.owner.read(), null); assert.equal(await f.owner.resume(), null);
  await f.owner.retire(); assert.equal(f.calls.prepare, 0); assert.equal(f.calls.requests.length, 0);
});
test('complete flow persists preparation and callback before HTTP, receipt before activation', async () => {
  const f = await fixture(Coordinator);
  const progress = await f.owner.begin(scope); const saved = await f.owner.read();
  assert.equal(progress.status, 'approval_required'); assert.equal(saved.revision, 2);
  assert.ok(!JSON.stringify(progress).includes(saved.codeVerifier));
  assert.ok(!new TextDecoder().decode(f.vault.ciphertext()).includes(saved.codeVerifier));
  assert.equal((await f.owner.acceptCallback(await f.callback())).status, 'enrolled');
  const enrolled = await f.owner.read(); assert.equal(enrolled.revision, 4);
  assert.ok(!JSON.stringify(enrolled).includes(saved.codeVerifier));
  assert.equal(f.calls.prepare, 1); assert.equal(f.calls.proof, 1);
  assert.equal(f.calls.activate, 1); assert.equal(f.calls.authenticate, 1);
  await f.owner.retire(); assert.equal(await f.owner.read(), null);
});
for (const stage of ['prepared', 'approval_required', 'redeeming', 'enrolled']) {
  test(`reload resumes ${stage} without generating new keys`, async () => {
    const f = await fixture(Coordinator);
    if (stage === 'prepared') { f.control.lostRequest = true; await assert.rejects(f.owner.begin(scope)); }
    else {
      await f.owner.begin(scope);
      if (stage === 'redeeming') { f.control.lostRedemption = true; await assert.rejects(f.owner.acceptCallback(await f.callback())); }
      if (stage === 'enrolled') await f.owner.acceptCallback(await f.callback());
    }
    assert.equal((await f.vault.read()).status, stage);
    const before = { requests:f.calls.requests.length, redeem:f.calls.redemptions.length };
    await f.reopen().resume();
    assert.equal(f.calls.prepare, 1);
    assert.equal(f.calls.requests.length, before.requests + (stage === 'prepared' ? 1 : 0));
    assert.equal(f.calls.redemptions.length, before.redeem + (stage === 'redeeming' ? 1 : 0));
    if (stage === 'prepared') assert.deepEqual(f.calls.requests[0], f.calls.requests[1]);
    if (stage === 'redeeming') assert.deepEqual(f.calls.redemptions[0], f.calls.redemptions[1]);
  });
}
for (const failure of ['activationFailure', 'sessionFailure']) {
  test(`saved receipt recovers ${failure} without another redemption`, async () => {
    const f = await fixture(Coordinator); await f.owner.begin(scope); f.control[failure] = true;
    await assert.rejects(f.owner.acceptCallback(await f.callback()));
    assert.equal((await f.vault.read()).status, 'enrolled');
    await f.reopen().resume(); assert.equal(f.calls.redemptions.length, 1);
  });
}
for (const failStatus of ['prepared', 'redeeming', 'enrolled']) {
  test(`storage failure at ${failStatus} never skips durability ordering`, async () => {
    const f = await fixture(Coordinator);
    if (failStatus !== 'prepared') await f.owner.begin(scope);
    f.vault.hooks.failStatus = failStatus;
    await assert.rejects(failStatus === 'prepared' ? f.owner.begin(scope) : f.owner.acceptCallback(await f.callback()), /test_storage_failure/);
    assert.equal(f.calls.activate, 0);
    if (failStatus === 'prepared') assert.equal(f.calls.requests.length, 0);
    if (failStatus === 'redeeming') assert.equal(f.calls.proof, 0);
    if (failStatus === 'enrolled') {
      assert.equal((await f.vault.read()).status, 'redeeming');
      await f.reopen().resume(); assert.deepEqual(f.calls.redemptions[0], f.calls.redemptions[1]);
    }
  });
}
test('wrong callback state and malformed code cannot reach proof generation', async () => {
  const f = await fixture(Coordinator); await f.owner.begin(scope); const callback = await f.callback();
  await assert.rejects(f.owner.acceptCallback({...callback,state:'incorrect'}), /state_mismatch/);
  await assert.rejects(f.owner.acceptCallback({...callback,code:'bad'}), /invalid_base64url/);
  assert.equal(f.calls.proof, 0); assert.equal((await f.vault.read()).status, 'approval_required');
});
test('different callback cannot replace durable redemption material', async () => {
  const f = await fixture(Coordinator); await f.owner.begin(scope); const callback = await f.callback();
  f.control.lostRedemption = true; await assert.rejects(f.owner.acceptCallback(callback));
  await assert.rejects(f.reopen().acceptCallback({...callback, code:Buffer.alloc(32,9).toString('base64url')}), /code_mismatch/);
  assert.equal(f.calls.redemptions.length,1);
});
for (const field of ['applicationId','scope','authorizationOrigin']) {
  test(`pinned ${field} cannot be replaced on resume`, async () => {
    const f = await fixture(Coordinator); await f.owner.begin(scope);
    const value = field === 'scope' ? {...scope,targetDeviceId:'dev_fedcba9876543210'} :
      field === 'applicationId' ? 'app_fedcba9876543210' : 'https://other.example';
    await assert.rejects(f.reopen({[field]:value}).resume(), /scope_mismatch|authorization_pending|receipt_mismatch/);
    assert.equal(f.calls.redemptions.length,0);
  });
}
test('expired approval does not start redemption; ambiguous accepted redemption remains recoverable', async () => {
  const f = await fixture(Coordinator); await f.owner.begin(scope); const callback = await f.callback();
  f.control.now = 301000; await assert.rejects(f.owner.acceptCallback(callback), /expired/);
  assert.equal(f.calls.proof,0); f.control.now=1000; f.control.lostRedemption=true;
  await assert.rejects(f.owner.acceptCallback(callback)); f.control.now=999000;
  assert.equal((await f.reopen().resume()).status,'enrolled');
});
test('concurrent work rejects rather than racing device preparation', async () => {
  const f = await fixture(Coordinator); let release; const blocked = new Promise(r => {release=r;});
  f.control.beforePrepare = () => blocked;
  const first = f.owner.begin(scope); await assert.rejects(f.owner.resume(), /busy/);
  release(); await first; assert.equal(f.calls.prepare,1);
});
test('competing coordinators rely on atomic store CAS', async () => {
  const f = await fixture(Coordinator);
  const result=await Promise.allSettled([f.owner.begin(scope),f.reopen().begin(scope)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1); assert.equal(f.calls.requests.length,1);
});
test('mutated store return and incorrect revision cannot dispatch', async () => {
  const f=await fixture(Coordinator); f.vault.hooks.mutateReturn=r=>{r.targetDeviceId='dev_fedcba9876543210';};
  await assert.rejects(f.owner.begin(scope), /storage_mismatch/); assert.equal(f.calls.requests.length,0);
  const g=await fixture(Coordinator); await g.owner.begin(scope); g.vault.hooks.mutateReturn=r=>{r.revision++;};
  await assert.rejects(g.owner.acceptCallback(await g.callback()), /storage_mismatch/); assert.equal(g.calls.redemptions.length,0);
});
for (const field of ['identityId','deviceId','applicationId','authorizationRequestId','enrolled','extra']) {
  test(`substituted receipt ${field} cannot activate`, async () => {
    const f=await fixture(Coordinator); await f.owner.begin(scope);
    f.control.receiptMutation=r=>{r[field]=field==='enrolled'?false:'unexpected';};
    await assert.rejects(f.owner.acceptCallback(await f.callback())); assert.equal(f.calls.activate,0);
    assert.equal((await f.vault.read()).status,'redeeming');
  });
}
test('unapproved URL is rejected and never stored', async () => {
  const f=await fixture(Coordinator); f.control.requestMutation=r=>{r.authorizationUrl='https://other.example/approve';};
  await assert.rejects(f.owner.begin(scope), /receipt_mismatch/); assert.equal((await f.vault.read()).status,'prepared');
});
for (const status of ['prepared','approval_required','redeeming']) {
  for (const field of ['codeChallenge','codeVerifier','targetMlsCredential','targetMlsCredentialHash']) {
    test(`inconsistent ${status} ${field} is retained but cannot resume`, async () => {
      const f=await fixture(Coordinator);
      if(status==='prepared'){f.control.lostRequest=true;await assert.rejects(f.owner.begin(scope));}
      else {await f.owner.begin(scope);if(status==='redeeming'){f.control.lostRedemption=true;await assert.rejects(f.owner.acceptCallback(await f.callback()));}}
      const {revision,...draft}=await f.vault.read();
      draft[field]=field==='codeVerifier'?'A'.repeat(43):Buffer.alloc(field==='targetMlsCredential'?12:32,91).toString('base64url');
      await f.vault.advance(draft,revision); const before={req:f.calls.requests.length,proof:f.calls.proof,redeem:f.calls.redemptions.length};
      await assert.rejects(f.reopen().resume(), /authorization_corrupt/);
      assert.equal(f.calls.requests.length,before.req);assert.equal(f.calls.proof,before.proof);assert.equal(f.calls.redemptions.length,before.redeem);
      assert.deepEqual(await f.vault.read(), {...draft,revision:revision+1});
    });
  }
}
for(const kind of ['extra','missing','null','wrong-key']){
  test(`invalid ${kind} proof does not reach redemption`, async()=>{
    const f=await fixture(Coordinator);await f.owner.begin(scope);const original=f.options.device.prepareRedemption;
    f.options.device.prepareRedemption=async s=>{const p=await original(s);if(kind==='extra')p.extra=true;
      if(kind==='missing')delete p.targetSignature;if(kind==='wrong-key')p.targetSigningPublicKey=Buffer.alloc(32).toString('base64url');
      return kind==='null'?null:p;};
    await assert.rejects(f.owner.acceptCallback(await f.callback()),/proof_mismatch/);assert.equal(f.calls.redemptions.length,0);
  });
}
test('begin and callback own their input before awaiting',async()=>{
  const f=await fixture(Coordinator);const initial={...scope};const starting=f.owner.begin(initial);initial.targetDeviceId='dev_fedcba9876543210';await starting;
  const callback=await f.callback();const original={...callback};const pending=f.owner.acceptCallback(callback);callback.state='changed';callback.code='changed';
  await pending;assert.equal(f.calls.requests[0].targetDeviceId,deviceId);assert.equal(f.calls.redemptions[0].code,original.code);
});
test('lock after durable stage preserves resumable state without HTTP',async()=>{
  const f=await fixture(Coordinator);f.vault.hooks.afterCommit=()=>{f.control.closed=true;};
  await assert.rejects(f.owner.begin(scope),/test_closed/);assert.equal((await f.vault.read()).status,'prepared');assert.equal(f.calls.requests.length,0);
  f.control.closed=false;f.vault.hooks.afterCommit=undefined;await f.reopen().resume();assert.equal(f.calls.prepare,1);
});
test('locked coordinator cannot begin; incomplete state cannot retire',async()=>{
  const f=await fixture(Coordinator);f.control.closed=true;await assert.rejects(f.owner.begin(scope),/test_closed/);assert.equal(f.calls.prepare,0);
  f.control.closed=false;await f.owner.begin(scope);await assert.rejects(f.owner.retire(),/incomplete/);
});
test('generic helper paths and unextracted browser coordinator are not public',async()=>{
  for(const name of ['@nekon/client-runtime/application-enrollment-validation','@nekon/sdk/browser']){
    await assert.rejects(import(name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
  }
});

for (const field of ['authorizationRequestId','code','codeVerifier','targetSigningPublicKey','targetMlsCredential','targetSignature']) {
  test(`proof snapshot survives ${field} mutation during asynchronous hashing`, async () => {
    const f=await fixture(Coordinator);await f.owner.begin(scope);let returned;let expected;let changed=false;
    f.control.proofMutation=p=>{returned=p;expected=structuredClone(p);};
    const original=crypto.subtle.digest;
    crypto.subtle.digest=function(...args){if(returned&&!changed){changed=true;returned[field]='changed';}return original.apply(this,args);};
    try {await f.owner.acceptCallback(await f.callback());} finally {crypto.subtle.digest=original;}
    assert.equal(changed,true);assert.deepEqual(f.calls.redemptions[0],expected);
  });
}
for(const field of ['codeChallenge','codeVerifier','targetMlsCredential','targetMlsCredentialHash']) {
  test(`fresh inconsistent ${field} cannot be persisted or dispatched`,async()=>{
    const f=await fixture(Coordinator);const prepare=f.options.device.prepare;
    f.options.device.prepare=async(...args)=>{const p=await prepare(...args);p[field]=field==='codeVerifier'?'A'.repeat(43):Buffer.alloc(32,91).toString('base64url');return p;};
    await assert.rejects(f.owner.begin(scope),/authorization_corrupt/);assert.equal(await f.vault.read(),null);assert.equal(f.calls.requests.length,0);
  });
}
test('owned digest inputs are ordinary ArrayBuffers and are cleared after cancellation',async()=>{
  const f=await fixture(Coordinator);const prepare=f.options.device.prepare;let checking=false;const buffers=[];
  f.options.device.prepare=async(...args)=>{const p=await prepare(...args);checking=true;return p;};
  const original=crypto.subtle.digest;
  crypto.subtle.digest=function(algorithm,input){if(checking){buffers.push(input);f.control.closed=true;}return original.call(this,algorithm,input);};
  try{await assert.rejects(f.owner.begin(scope),/test_closed/);}finally{crypto.subtle.digest=original;}
  assert.ok(buffers.length>0);for(const input of buffers){assert.ok(input instanceof ArrayBuffer);assert.ok(new Uint8Array(input).every(b=>b===0));}
  assert.equal(await f.vault.read(),null);assert.equal(f.calls.requests.length,0);
});
test('failed integrity provider cannot expose its error or discard retry state',async()=>{
  const f=await fixture(Coordinator);f.control.lostRequest=true;await assert.rejects(f.owner.begin(scope));
  const saved=await f.vault.read();const count=f.calls.requests.length;const original=crypto.subtle.digest;
  crypto.subtle.digest=()=>{throw new Error('synthetic-provider-canary');};
  try{await assert.rejects(f.owner.resume(),e=>e.message==='organization_application_authorization_corrupt'&&e.cause===undefined);}
  finally{crypto.subtle.digest=original;}
  assert.deepEqual(await f.vault.read(),saved);assert.equal(f.calls.requests.length,count);
});
