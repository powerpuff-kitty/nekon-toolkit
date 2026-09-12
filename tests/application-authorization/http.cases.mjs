import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ApplicationDeviceAuthorizationApiResource as Resource } from '@nekon/sdk/application-authorization';
import { NekonTransport } from '@nekon/client-runtime/transport';

// Opt-in loopback integration. No real application, proof, callback or secret.
const app = 'app_SYNTHETICAPP00000';
const requestId = 'ear_SYNTHETICREQUEST0';
const b64 = n => Buffer.alloc(n).toString('base64url');
const input = Object.freeze({ authorizationRequestId: requestId,
  redirectUri: 'https://app.example.invalid/callback', state: b64(24), codeChallenge: b64(32),
  targetIdentityId: 'id_SYNTHETICIDENTITY0', targetDeviceId: 'dev_SYNTHETICDEVICE00',
  targetSigningKeyHash: b64(32), targetMlsCredentialHash: b64(32) });
const proof = Object.freeze({ authorizationRequestId: requestId, code: b64(32), codeVerifier: 'a'.repeat(43),
  targetSigningPublicKey: b64(32), targetMlsCredential: b64(1), targetSignature: b64(64) });
async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
const options = { timeout: 5000 };

test('native HTTP sends both prepared payloads once without stored application-session headers', options, async t => {
  const received = [];
  const origin = await serve(t, (req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received.push({ method: req.method, path: req.url, headers: req.headers,
        value: JSON.parse(Buffer.concat(chunks).toString()) });
      const value = req.url.endsWith('/redeem')
        ? { enrolled: true, applicationId: app, authorizationRequestId: requestId,
          accountId: 'acct_SYNTHETICACCOUNT', identityId: input.targetIdentityId, deviceId: input.targetDeviceId, duplicate: true }
        : { authorizationRequestId: requestId, authorizationUrl: 'https://service.example.invalid/approve', expiresAt: 123456, duplicate: false };
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
    });
  });
  const transport = new NekonTransport(origin);
  transport.setApplicationSession(`${input.targetDeviceId}.${b64(32)}`);
  const api = new Resource(transport);
  await api.createEnterpriseAuthorizationRequest(app, input);
  const result = await api.redeemEnterpriseAuthorization(app, proof);
  assert.equal(received.length, 2); assert.equal(result.duplicate, true);
  for (const entry of received) {
    assert.equal(entry.method, 'POST'); assert.equal(entry.headers['nekon-application-session'], undefined);
    assert.equal(entry.headers['nekon-room-guest-session'], undefined);
  }
  assert.deepEqual(received.map(r => r.value), [input, proof]);
  assert.equal(received[0].path, `/api/client/v1/public/enterprise/applications/${app}/authorization-requests`);
  assert.equal(received[1].path, `/api/client/v1/public/enterprise/applications/${app}/authorization-codes/redeem`);
});

test('native HTTP authorization redirect is rejected without contacting its target', options, async t => {
  let targetCalls = 0;
  const target = await serve(t, (_req, res) => { targetCalls++; res.end('unexpected'); });
  const origin = await serve(t, (req, res) => { req.resume(); res.writeHead(302, { location: `${target}/sink` }); res.end(); });
  const api = new Resource(new NekonTransport(origin));
  await assert.rejects(api.createEnterpriseAuthorizationRequest(app, input), TypeError);
  assert.equal(targetCalls, 0);
});

test('native HTTP denial is normalized and never automatically retried', options, async t => {
  let calls = 0;
  const origin = await serve(t, (req, res) => {
    calls++; req.resume(); res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '5' });
    res.end(JSON.stringify({ error: 'rate_limited' }));
  });
  const api = new Resource(new NekonTransport(origin));
  await assert.rejects(api.redeemEnterpriseAuthorization(app, proof), e => e.status === 429 && e.code === 'rate_limited' && e.retryAfterSeconds === 5);
  assert.equal(calls, 1);
});

test('native HTTP mismatched request receipt cannot be mistaken for the requested operation', options, async t => {
  const origin = await serve(t, (req, res) => {
    req.resume(); res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ authorizationRequestId: 'ear_DIFFERENT',
      authorizationUrl: 'https://service.example.invalid/approve', expiresAt: 123456, duplicate: false }));
  });
  const api = new Resource(new NekonTransport(origin));
  await assert.rejects(api.createEnterpriseAuthorizationRequest(app, input), /invalid_enterprise_authorization_request_receipt/);
});
