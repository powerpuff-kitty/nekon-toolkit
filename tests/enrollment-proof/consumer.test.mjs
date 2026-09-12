import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign, verify, webcrypto } from 'node:crypto';
import { createEnterpriseAuthorizationRedemptionWithSigner as createProof } from '@nekon/sdk/application-enrollment-proof';
import { createEnterpriseAuthorizationRedemptionWithSigner as runtimeProof } from '@nekon/client-runtime/application-enrollment-proof';

// Independent Node signing/verification plus the helper's real Web Crypto self-check.
// These generated keys and opaque credentials are test-only; no service is contacted.
const DOMAIN = 'NEKON-ENTERPRISE-AUTHORIZATION-CODE-REDEMPTION-V1\0';
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const digest = bytes => createHash('sha256').update(bytes).digest('base64url');
function transcript(input) {
  return Buffer.from(DOMAIN + JSON.stringify({
    protocolVersion: 1,
    applicationId: input.applicationId,
    authorizationRequestId: input.authorizationRequestId,
    targetDeviceId: input.targetDeviceId,
    authorizationCodeHash: digest(input.code),
    codeVerifierHash: digest(Buffer.from(input.codeVerifier)),
    targetSigningKeyHash: digest(input.targetSigningPublicKey),
    targetMlsCredentialHash: digest(input.targetMlsCredential),
  }));
}
function fixture() {
  const keys = generateKeyPairSync('ed25519');
  const key = Buffer.from(keys.publicKey.export({format:'jwk'}).x, 'base64url');
  const calls = { sign: 0, payloads: [], signatures: [], buffers: [], outputs: [] };
  const crypto = { subtle: {
    async digest(algorithm, bytes) {
      calls.buffers.push(bytes);
      const output = await webcrypto.subtle.digest(algorithm, bytes);
      calls.outputs.push(output); return output;
    },
    async importKey(format, bytes, ...args) {
      calls.buffers.push(bytes); return webcrypto.subtle.importKey(format, bytes, ...args);
    },
    async verify(algorithm, key, signature, payload) {
      calls.buffers.push(signature, payload);
      return webcrypto.subtle.verify(algorithm, key, signature, payload);
    },
  } };
  const input = {
    applicationId:'app_0123456789abcdef', authorizationRequestId:'ear_0123456789abcdef',
    targetDeviceId:'dev_0123456789abcdef', code:Uint8Array.from({length:32},(_,i)=>i),
    codeVerifier:'synthetic-test-verifier-'.repeat(3),
    targetSigningPublicKey:Uint8Array.from(key),
    targetMlsCredential:new TextEncoder().encode('test-only opaque credential, not MLS'), crypto,
    async sign(payload) {
      calls.sign++; calls.payloads.push(payload);
      const signature = Uint8Array.from(sign(null, payload, keys.privateKey));
      calls.signatures.push(signature); return signature;
    },
  };
  return { keys, input, calls };
}
function cleared(calls) {
  for (const value of [...calls.buffers, ...calls.outputs]) {
    assert.ok(value instanceof ArrayBuffer);
    assert.ok(new Uint8Array(value).every(b => b === 0));
  }
  for (const bytes of [...calls.payloads, ...calls.signatures]) assert.ok(bytes.every(b => b === 0));
}

test('SDK uses the exact runtime function', () => assert.equal(createProof, runtimeProof));
test('proof verifies with an independent V1 transcript and Node Ed25519 implementation', async () => {
  const f=fixture(); const expected=transcript(f.input); let captured;
  const signer=f.input.sign; f.input.sign=async bytes=>{captured=Buffer.from(bytes); return signer(bytes);};
  const snapshots=[f.input.code.slice(), f.input.targetSigningPublicKey.slice(), f.input.targetMlsCredential.slice()];
  const proof=await createProof(f.input);
  assert.deepEqual(captured,expected);
  assert.equal(verify(null,expected,f.keys.publicKey,Buffer.from(proof.targetSignature,'base64url')),true);
  assert.equal(proof.code,b64(snapshots[0])); assert.equal(proof.targetSigningPublicKey,b64(snapshots[1]));
  assert.equal(proof.targetMlsCredential,b64(snapshots[2])); assert.equal(proof.codeVerifier,f.input.codeVerifier);
  assert.deepEqual(Object.keys(proof).sort(),['authorizationRequestId','code','codeVerifier','targetSigningPublicKey','targetMlsCredential','targetSignature'].sort());
  assert.ok(Object.isFrozen(proof)); assert.equal(f.calls.sign,1);
  assert.deepEqual([f.input.code,f.input.targetSigningPublicKey,f.input.targetMlsCredential],snapshots); cleared(f.calls);
});
test('same durable inputs produce byte-identical Ed25519 proof on explicit retry', async () => {
  const f=fixture(); assert.deepEqual(await createProof(f.input),await createProof(f.input));
  assert.equal(f.calls.sign,2); cleared(f.calls);
});
for(const field of ['applicationId','authorizationRequestId','targetDeviceId','code','codeVerifier','targetSigningPublicKey','targetMlsCredential']) {
  test(`caller mutation of ${field} after dispatch cannot change owned proof inputs`, async()=>{
    const f=fixture(); const before={...f.input,code:f.input.code.slice(),targetSigningPublicKey:f.input.targetSigningPublicKey.slice(),targetMlsCredential:f.input.targetMlsCredential.slice()};
    const pending=createProof(f.input);
    if(f.input[field] instanceof Uint8Array) f.input[field].fill(91);
    else f.input[field]='changed';
    const proof=await pending;
    assert.equal(verify(null,transcript(before),f.keys.publicKey,Buffer.from(proof.targetSignature,'base64url')),true);
    assert.equal(proof.authorizationRequestId,before.authorizationRequestId); assert.equal(proof.codeVerifier,before.codeVerifier);
    cleared(f.calls);
  });
}
test('caller replacing signer or crypto after dispatch cannot redirect the active operation',async()=>{
  const f=fixture();const pending=createProof(f.input);
  f.input.sign=()=>{throw new Error('must not call');};f.input.crypto={};
  await pending;assert.equal(f.calls.sign,1);cleared(f.calls);
});
for(const [field,value,error] of [
  ['applicationId','bad','binding'],['authorizationRequestId','ear_short','binding'],['targetDeviceId','dev_short','binding'],
  ['applicationId','app_'+ 'a'.repeat(129),'binding'],['sign',null,'binding'],
  ['code',new Uint8Array(31),'code'],['code',new Uint8Array(33),'code'],['code',[],'code'],
  ['codeVerifier','a'.repeat(42),'code'],['codeVerifier','a'.repeat(129),'code'],['codeVerifier','!'.repeat(43),'code'],
  ['targetSigningPublicKey',new Uint8Array(31),'public_material'],['targetSigningPublicKey',new Uint8Array(33),'public_material'],
  ['targetMlsCredential',new Uint8Array(0),'public_material'],['targetMlsCredential',new Uint8Array(65537),'public_material'],
]) {
  test(`invalid ${field} (${value?.length ?? typeof value}) never reaches the signer`,async()=>{
    const f=fixture();await assert.rejects(createProof({...f.input,[field]:value}),new RegExp('invalid_enterprise_authorization_'+error));
    assert.equal(f.calls.sign,0);assert.equal(f.calls.buffers.length,0);
  });
}
for(const length of [1,65536]) {
  test(`accepts opaque credential size boundary ${length} without interpreting MLS`,async()=>{
    const f=fixture();f.input.targetMlsCredential=new Uint8Array(length).fill(7);
    const proof=await createProof(f.input);assert.equal(Buffer.from(proof.targetMlsCredential,'base64url').length,length);cleared(f.calls);
  });
}
for(const length of [43,128]) {
  test(`accepts validated ASCII verifier size ${length}`,async()=>{
    const f=fixture();f.input.codeVerifier='a'.repeat(length);await createProof(f.input);cleared(f.calls);
  });
}
test('missing Web Crypto fails before signing',async()=>{
  const f=fixture();await assert.rejects(createProof({...f.input,crypto:{}}),/web_crypto_required/);assert.equal(f.calls.sign,0);
});
test('pre-aborted proof operation does no hashing or signing',async()=>{
  const f=fixture();const abort=new AbortController();abort.abort();
  await assert.rejects(createProof({...f.input,signal:abort.signal}),/enterprise_authorization_aborted/);
  assert.equal(f.calls.sign,0);assert.equal(f.calls.buffers.length,0);
});
for(const [operation,nth] of [['digest',1],['digest',2],['digest',3],['digest',4],['importKey',1],['verify',1]]) {
  test(`abort after ${operation} ${nth} clears owned crypto input and prevents a proof return`,async()=>{
    const f=fixture();const abort=new AbortController();let count=0;
    const fn=f.input.crypto.subtle[operation];
    f.input.crypto.subtle[operation]=async(...args)=>{const value=await fn(...args);if(++count===nth)abort.abort();return value;};
    await assert.rejects(createProof({...f.input,signal:abort.signal}),/enterprise_authorization_aborted/);
    assert.equal(f.calls.sign,operation==='digest'?0:1);cleared(f.calls);
  });
}
test('abort after signing clears the returned signature before rejecting',async()=>{
  const f=fixture();const abort=new AbortController();const signer=f.input.sign;
  f.input.sign=async bytes=>{const signature=await signer(bytes);abort.abort();return signature;};
  await assert.rejects(createProof({...f.input,signal:abort.signal}),/enterprise_authorization_aborted/);cleared(f.calls);
});
for(const operation of ['digest','importKey','verify']) {
  test(`crypto ${operation} rejection still clears earlier owned buffers`,async()=>{
    const f=fixture();const cause=new Error('synthetic-provider-failure');const fn=f.input.crypto.subtle[operation];
    f.input.crypto.subtle[operation]=async(...args)=>{await fn(...args);throw cause;};
    await assert.rejects(createProof(f.input),e=>e===cause);
    // A provider throwing after privately creating an output does not transfer it
    // to the helper; exclude that unreturned output from the ownership assertion.
    if(operation==='digest') f.calls.outputs.pop();
    cleared(f.calls);
  });
}
test('signer failure is propagated without automatic retry and all given transcripts are cleared',async()=>{
  const f=fixture();const cause=new Error('synthetic-signer-failure');
  f.input.sign=async bytes=>{f.calls.sign++;f.calls.payloads.push(bytes);throw cause;};
  await assert.rejects(createProof(f.input),e=>e===cause);assert.equal(f.calls.sign,1);cleared(f.calls);
});
for(const signature of [new Uint8Array(63),new Uint8Array(65),null,[]]) {
  test(`malformed signature ${signature?.length ?? 'null'} is rejected`,async()=>{
    const f=fixture();f.input.sign=async bytes=>{f.calls.payloads.push(bytes);return signature;};
    await assert.rejects(createProof(f.input),/invalid_enterprise_authorization_signature/);cleared(f.calls);
    if(signature instanceof Uint8Array) assert.ok(signature.every(x=>x===0));
  });
}
test('signature from an unrelated key fails independent self-check',async()=>{
  const f=fixture();const wrong=generateKeyPairSync('ed25519');
  f.input.sign=async bytes=>{f.calls.payloads.push(bytes);const s=Uint8Array.from(sign(null,bytes,wrong.privateKey));f.calls.signatures.push(s);return s;};
  await assert.rejects(createProof(f.input),/signature_self_check_failed/);cleared(f.calls);
});
test('signer cannot change the transcript it is asked to authenticate',async()=>{
  const f=fixture();const signer=f.input.sign;f.input.sign=async bytes=>{bytes[0]^=1;return signer(bytes);};
  await assert.rejects(createProof(f.input),/signature_self_check_failed/);cleared(f.calls);
});
test('returned signature is snapshotted before key import awaits',async()=>{
  const f=fixture();const importKey=f.input.crypto.subtle.importKey;
  f.input.crypto.subtle.importKey=async(...args)=>{f.calls.signatures[0].fill(9);return importKey(...args);};
  const proof=await createProof(f.input);assert.equal(verify(null,transcript(f.input),f.keys.publicKey,Buffer.from(proof.targetSignature,'base64url')),true);cleared(f.calls);
});
for(const field of ['applicationId','authorizationRequestId','targetDeviceId','codeVerifier']) {
  test(`independent verifier rejects proof reinterpreted with another ${field}`,async()=>{
    const f=fixture();const proof=await createProof(f.input);const changed={...f.input,[field]:f.input[field]+'x'};
    assert.equal(verify(null,transcript(changed),f.keys.publicKey,Buffer.from(proof.targetSignature,'base64url')),false);
  });
}
test('changing the domain invalidates the same signature',async()=>{
  const f=fixture();const proof=await createProof(f.input);const wrong=Buffer.from(transcript(f.input));wrong[0]^=1;
  assert.equal(verify(null,wrong,f.keys.publicKey,Buffer.from(proof.targetSignature,'base64url')),false);
});
test('signer sees a domain-separated hash transcript, not the raw code or verifier',async()=>{
  const f=fixture();let captured;const signer=f.input.sign;
  f.input.sign=async bytes=>{captured=Buffer.from(bytes);return signer(bytes);};
  await createProof(f.input);
  assert.ok(captured.toString().startsWith(DOMAIN));
  assert.equal(captured.includes(Buffer.from(f.input.codeVerifier)),false);
  assert.equal(captured.includes(Buffer.from(b64(f.input.code))),false);
});
