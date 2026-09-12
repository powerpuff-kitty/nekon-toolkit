import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApplicationDeviceAuthorizationApiResource as Resource,
} from '@nekon/sdk/application-authorization';
import { ApplicationDeviceAuthorizationApiResource as RuntimeResource } from '@nekon/client-runtime/application-authorization';
import { NekonTransport, NEKON_APPLICATION_SESSION_HEADER, NEKON_ROOM_GUEST_SESSION_HEADER } from '@nekon/client-runtime/transport';

// Deliberately synthetic material; no real key, proof, callback or enrolled identity.
const encoded = length => Buffer.alloc(length).toString('base64url');
const APP = 'app_SYNTHETICAPP00000';
const REQUEST = 'ear_SYNTHETICREQUEST0';
const IDENTITY = 'id_SYNTHETICIDENTITY0';
const DEVICE = 'dev_SYNTHETICDEVICE00';
const creation = () => Object.freeze({
  authorizationRequestId: REQUEST, redirectUri: 'https://app.example.invalid/callback',
  state: encoded(24), codeChallenge: encoded(32), targetIdentityId: IDENTITY,
  targetDeviceId: DEVICE, targetSigningKeyHash: encoded(32), targetMlsCredentialHash: encoded(32),
});
const redemption = () => Object.freeze({
  authorizationRequestId: REQUEST, code: encoded(32), codeVerifier: 'a'.repeat(43),
  targetSigningPublicKey: encoded(32), targetMlsCredential: encoded(1), targetSignature: encoded(64),
});
const creationReceipt = () => ({
  authorizationRequestId: REQUEST, authorizationUrl: 'https://auth.example.invalid/approve',
  expiresAt: 123456, duplicate: false,
});
const enrollmentReceipt = () => ({
  enrolled: true, applicationId: APP, authorizationRequestId: REQUEST,
  accountId: 'acct_SYNTHETICACCOUNT', identityId: IDENTITY, deviceId: DEVICE, duplicate: false,
});
function fixture(response = () => Response.json(creationReceipt())) {
  const calls = [];
  const transport = { async request(path, init, policy) { calls.push({ path, init, policy }); return response(); } };
  return { api: new Resource(transport), calls };
}
const operations = [
  ['creation', api => api.createEnterpriseAuthorizationRequest(APP, creation()), creationReceipt,
    'invalid_enterprise_authorization_request_receipt'],
  ['redemption', api => api.redeemEnterpriseAuthorization(APP, redemption()), enrollmentReceipt,
    'invalid_enterprise_authorization_redemption_receipt'],
];

test('SDK export is the exact runtime implementation, not another client', () => assert.equal(Resource, RuntimeResource));

test('creation uses the established public route, payload and credential policy once', async () => {
  const { api, calls } = fixture(); const input = creation();
  assert.deepEqual(await api.createEnterpriseAuthorizationRequest(APP, input), creationReceipt());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, `public/enterprise/applications/${APP}/authorization-requests`);
  assert.deepEqual(calls[0].policy, { credentialMode: 'public' });
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), input);
  assert.deepEqual(input, creation());
});

test('redemption submits the prepared proof without deriving or persisting key material', async () => {
  const { api, calls } = fixture(() => Response.json(enrollmentReceipt())); const input = redemption();
  assert.deepEqual(await api.redeemEnterpriseAuthorization(APP, input), enrollmentReceipt());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, `public/enterprise/applications/${APP}/authorization-codes/redeem`);
  assert.deepEqual(calls[0].policy, { credentialMode: 'public' });
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.credentials, 'omit');
  assert.deepEqual(JSON.parse(calls[0].init.body), input);
  assert.deepEqual(input, redemption());
});

for (const [name, run, receipt] of operations) {
  test(`${name}: duplicate receipt is returned without another write`, async () => {
    const value = { ...receipt(), duplicate: true };
    const { api, calls } = fixture(() => Response.json(value));
    assert.deepEqual(await run(api), value); assert.equal(calls.length, 1);
  });
  test(`${name}: real transport suppresses stored application/guest session authority`, async () => {
    const requests = [];
    const transport = new NekonTransport('https://service.example.invalid', {
      requestTimeoutMs: 0, fetch: async (url, init) => { requests.push({ url, init }); return Response.json(receipt()); },
    });
    transport.setApplicationSession(`${DEVICE}.${encoded(32)}`);
    await run(new Resource(transport));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.credentials, 'omit'); assert.equal(requests[0].init.redirect, 'error');
    assert.equal(requests[0].init.headers.has(NEKON_APPLICATION_SESSION_HEADER), false);
    assert.equal(requests[0].init.headers.has(NEKON_ROOM_GUEST_SESSION_HEADER), false);
    assert.equal(requests[0].init.signal, undefined, 'no implicit write deadline introduced');
  });
  test(`${name}: ambiguous fetch rejection is propagated with no retry`, async () => {
    const cause = new Error('synthetic connection loss');
    const { api, calls } = fixture(() => { throw cause; });
    await assert.rejects(run(api), e => e === cause); assert.equal(calls.length, 1);
  });
  test(`${name}: malformed success JSON is rejected, not treated as enrollment`, async () => {
    const { api } = fixture(() => new Response('{invalid', { status: 200 }));
    await assert.rejects(run(api), SyntaxError);
  });
  test(`${name}: success response byte limits are enforced by the real transport`, async () => {
    const transport = new NekonTransport('https://service.example.invalid', {
      requestTimeoutMs: 0, responseBodyLimitBytes: 8, fetch: async () => Response.json(receipt()),
    });
    await assert.rejects(run(new Resource(transport)), /response_body_too_large/);
  });
}

for (const applicationId of ['', 'wrong_prefix', '../app_demo', 'app_demo/path', 'app_' + 'a'.repeat(129)]) {
  test(`invalid application identifier rejects both operations: ${JSON.stringify(applicationId)}`, async () => {
    const { api, calls } = fixture();
    await assert.rejects(api.createEnterpriseAuthorizationRequest(applicationId, creation()), /invalid_application_id/);
    await assert.rejects(api.redeemEnterpriseAuthorization(applicationId, redemption()), /invalid_application_id/);
    assert.equal(calls.length, 0);
  });
}
for (const [field, value] of [
  ['authorizationRequestId', 'wrong'], ['targetIdentityId', 'wrong'], ['targetDeviceId', 'wrong'],
  ['redirectUri', 'http://localhost/callback'], ['redirectUri', 'https://user:secret@example.invalid/'],
  ['redirectUri', 'https://app.example.invalid/callback#fragment'], ['redirectUri', 'javascript:void(0)'],
  ['redirectUri', 'relative/callback'], ['state', encoded(23)], ['state', encoded(25)],
  ['state', encoded(24) + '='], ['codeChallenge', encoded(31)], ['codeChallenge', encoded(33)],
  ['targetSigningKeyHash', encoded(31)], ['targetMlsCredentialHash', encoded(33)],
  ['targetMlsCredentialHash', '*'.repeat(43)],
]) {
  test(`invalid creation ${field} (${String(value).length} characters) never dispatches`, async () => {
    const { api, calls } = fixture();
    await assert.rejects(api.createEnterpriseAuthorizationRequest(APP, { ...creation(), [field]: value }), /invalid_enterprise_authorization_request/);
    assert.equal(calls.length, 0);
  });
}
for (const [field, value] of [
  ['authorizationRequestId', 'wrong'], ['codeVerifier', 'a'.repeat(42)], ['codeVerifier', 'a'.repeat(129)],
  ['codeVerifier', '!'.repeat(43)], ['code', encoded(31)], ['code', encoded(33)], ['code', encoded(32) + '='],
  ['targetSigningPublicKey', encoded(31)], ['targetMlsCredential', ''],
  ['targetMlsCredential', encoded(65537)], ['targetSignature', encoded(63)], ['targetSignature', encoded(65)],
]) {
  test(`invalid redemption ${field} (${String(value).length} characters) never dispatches`, async () => {
    const { api, calls } = fixture();
    await assert.rejects(api.redeemEnterpriseAuthorization(APP, { ...redemption(), [field]: value }), /invalid_enterprise_authorization_redemption/);
    assert.equal(calls.length, 0);
  });
}
for (const [length, verifier] of [[1, 'a'.repeat(43)], [65536, 'a'.repeat(128)]]) {
  test(`redemption accepts documented credential/verifier shape boundary ${length}/${verifier.length}`, async () => {
    const { api } = fixture(() => Response.json(enrollmentReceipt()));
    await api.redeemEnterpriseAuthorization(APP, { ...redemption(), targetMlsCredential: encoded(length), codeVerifier: verifier });
  });
}
for (const [name, run, receipt, error] of operations) {
  const mutations = [
    ['not an object', () => null], ['array', () => []], ['unknown field', value => ({ ...value, extra: true })],
    ['missing field', value => { delete value.duplicate; return value; }],
    ['wrong duplicate type', value => ({ ...value, duplicate: 'true' })],
    ['mismatched request', value => ({ ...value, authorizationRequestId: 'ear_DIFFERENT' })],
  ];
  for (const [label, mutate] of mutations) {
    test(`${name} rejects ${label} receipt`, async () => {
      const { api } = fixture(() => Response.json(mutate(receipt())));
      await assert.rejects(run(api), new RegExp(error));
    });
  }
}
for (const [field, value] of [
  ['authorizationUrl', 'http://example.invalid/'], ['authorizationUrl', 'https://secret@example.invalid/'],
  ['authorizationUrl', 'https://auth.example.invalid/#fragment'], ['expiresAt', -1], ['expiresAt', 1.5],
]) {
  test(`creation rejects invalid ${field} receipt`, async () => {
    const { api } = fixture(() => Response.json({ ...creationReceipt(), [field]: value }));
    await assert.rejects(api.createEnterpriseAuthorizationRequest(APP, creation()), /invalid_enterprise_authorization_request_receipt/);
  });
}
for (const [field, value] of [
  ['enrolled', false], ['applicationId', 'app_DIFFERENT'], ['accountId', 'wrong'],
  ['identityId', 'wrong'], ['deviceId', 'wrong'],
]) {
  test(`redemption rejects invalid ${field} receipt`, async () => {
    const { api } = fixture(() => Response.json({ ...enrollmentReceipt(), [field]: value }));
    await assert.rejects(api.redeemEnterpriseAuthorization(APP, redemption()), /invalid_enterprise_authorization_redemption_receipt/);
  });
}
for (const [name, run] of operations) {
  test(`${name}: structured HTTP error exposes bounded code, status and retry hint`, async () => {
    const { api, calls } = fixture(() => Response.json({ error: 'rate_limited', currentEpoch: '42' }, {
      status: 429, headers: { 'Retry-After': '60' },
    }));
    await assert.rejects(run(api), e => e.name === 'NekonHttpError' && e.status === 429 &&
      e.code === 'rate_limited' && e.retryAfterSeconds === 60 && e.currentEpoch === 42);
    assert.equal(calls.length, 1);
  });
  for (const retry of ['3601', '-1', '1.5', 'tomorrow']) {
    test(`${name}: unsupported Retry-After ${retry} is not made into a retry policy`, async () => {
      const { api } = fixture(() => Response.json({ error: 'request_denied' }, { status: 403, headers: { 'Retry-After': retry } }));
      await assert.rejects(run(api), e => e.code === 'request_denied' && e.retryAfterSeconds === undefined);
    });
  }
  test(`${name}: unstructured error content is not echoed in the normalized error`, async () => {
    const { api } = fixture(() => new Response('<synthetic-secret>', { status: 503 }));
    await assert.rejects(run(api), e => e.code === 'request_failed' && e.status === 503 && !e.message.includes('synthetic-secret'));
  });
}
test('importing either entry point has no connection, DOM or storage side effects', async () => {
  const api = await import('@nekon/sdk/application-authorization');
  assert.deepEqual(Object.keys(api), ['ApplicationDeviceAuthorizationApiResource']);
});
test('shared binary/error/validation helpers are not public package subpaths', async () => {
  for (const name of ['client-binary-codec', 'client-api-error', 'client-response-validation']) {
    await assert.rejects(import(`@nekon/client-runtime/${name}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    await assert.rejects(import(`@nekon/client-runtime/dist/${name}.js`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
});
