import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { NekonTransport } from '@nekon/client-runtime/transport';

// Explicit --http lane only; ephemeral loopback servers with test teardown.
async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const options = { timeout: 5000 };

for (const requestTimeoutMs of [0, 1000]) {
  for (const [method, status] of [['HEAD', 200], ['GET', 304]]) {
    test(`http-semantics: native ${method} ${status} retains representation length (${requestTimeoutMs})`, options, async t => {
      const origin = await serve(t, (req, res) => {
        res.writeHead(status, { 'content-length': '1048576', etag: '"synthetic-version"' });
        res.end();
      });
      const response = await new NekonTransport(origin, { requestTimeoutMs, responseBodyLimitBytes: 3 })
        .request('metadata', { method });
      assert.equal(response.status, status);
      assert.equal(response.body, null);
      assert.equal(response.headers.get('content-length'), '1048576');
      assert.equal(await response.text(), '');
    });
  }
}
for (const [path, target] of [
  ['objects?cursor=folder/', '/api/client/v1/objects?cursor=folder/'],
  ['/objects/?cursor=folder//', '/api/client/v1/objects?cursor=folder//'],
  ['objects?cursor=a%2Fb%2F&last=/', '/api/client/v1/objects?cursor=a%2Fb%2F&last=/'],
]) {
  test(`http-semantics: native request sends the exact query: ${path}`, options, async t => {
    let seen;
    const origin = await serve(t, (req, res) => { seen = req.url; res.writeHead(204); res.end(); });
    await new NekonTransport(origin).request(path);
    assert.equal(seen, target);
  });
}
test('http-semantics: native HEAD success does not permit the subsequent oversized GET', options, async t => {
  const origin = await serve(t, (req, res) => {
    res.writeHead(200, { 'content-length': '8' });
    res.end(req.method === 'HEAD' ? undefined : 'abcdefgh');
  });
  const client = new NekonTransport(origin, { responseBodyLimitBytes: 3 });
  assert.equal((await client.request('metadata', { method: 'HEAD' })).status, 200);
  await assert.rejects(client.request('metadata'), /response_body_too_large/);
});
