import test from 'node:test';
import assert from 'node:assert/strict';
import { NekonTransport, NEKON_API_VERSION, NEKON_API_VERSION_HEADER } from '@nekon/client-runtime/transport';

// Synthetic responses only. This suite never contacts a service or opens a port.
const ORIGIN = 'https://example.invalid';
const fixture = (options = {}, respond = () => new Response(null, { status: 204 })) => {
  const requests = [];
  const transport = new NekonTransport(ORIGIN, { requestTimeoutMs: 0, ...options,
    fetch: async (url, init) => { requests.push({ url, init }); return respond(url, init); },
  });
  return { transport, requests };
};

// RFC 9110 §8.6 permits representation length on bodyless HEAD/304 responses.
for (const requestTimeoutMs of [0, 10]) {
  for (const [method, status] of [['HEAD', 200], ['HEAD', 404], ['GET', 304]]) {
    test(`http-semantics: ${method} ${status} metadata is not response content (${requestTimeoutMs})`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const raw = new Response(null, { status, headers: {
        'content-length': '1048576', etag: '"synthetic-version"',
      } });
      const { transport, requests } = fixture({ requestTimeoutMs, responseBodyLimitBytes: 3 }, () => raw);
      const response = await transport.request('metadata', { method });
      assert.equal(response, raw, 'bodyless responses retain native metadata and identity');
      assert.equal(response.body, null);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('content-length'), '1048576');
      assert.equal(response.headers.get('etag'), '"synthetic-version"');
      assert.equal(await response.clone().text(), '');
      t.mock.timers.tick(100);
      assert.notEqual(requests[0].init.signal?.aborted, true, 'bodyless response must clear its deadline');
    });
  }
}

// Query data is not part of the route: never trim or decode/re-encode it.
for (const [path, target] of [
  ['objects?cursor=folder/', 'objects?cursor=folder/'],
  ['objects?cursor=/', 'objects?cursor=/'],
  ['objects?cursor=folder//', 'objects?cursor=folder//'],
  ['objects?next=https://app.example/callback/', 'objects?next=https://app.example/callback/'],
  ['objects?cursor=a%2Fb%2F', 'objects?cursor=a%2Fb%2F'],
  ['objects?item=one&item=two/&empty=', 'objects?item=one&item=two/&empty='],
  ['objects?cursor=a+b%20c&last=/', 'objects?cursor=a+b%20c&last=/'],
  ['/objects/?cursor=folder/', 'objects?cursor=folder/'],
  ['///objects///?cursor=folder/', 'objects?cursor=folder/'],
  ['objects?cursor=question?/', 'objects?cursor=question?/'],
  ['objects/?', 'objects?'],
  ['/objects///', 'objects'],
]) {
  test(`http-semantics: preserve query for ${path}`, async () => {
    const { transport, requests } = fixture();
    await transport.request(path);
    assert.equal(requests[0].url.href, `${ORIGIN}/api/client/v1/${target}`);
    assert.equal(requests[0].init.redirect, 'error');
    assert.equal(requests[0].init.headers.get(NEKON_API_VERSION_HEADER), NEKON_API_VERSION);
    assert.equal(requests.length, 1);
  });
}
for (const path of ['?cursor=/', '/?cursor=/', '%2e%2e/metadata?cursor=/', 'rooms%2fadmin?cursor=/']) {
  test(`http-semantics: query preservation cannot relax path constraints: ${path}`, () => {
    const { transport, requests } = fixture();
    assert.throws(() => transport.request(path), /invalid_client_api_path/);
    assert.equal(requests.length, 0);
  });
}
for (const requestTimeoutMs of [0, 10]) {
  test(`http-semantics: a real body still enforces declared size (${requestTimeoutMs})`, async () => {
    let cancellations = 0;
    const { transport } = fixture({ requestTimeoutMs, responseBodyLimitBytes: 3 }, () =>
      new Response(new ReadableStream({ cancel() { cancellations++; } }), {
        headers: { 'content-length': '1048576' },
      }));
    await assert.rejects(transport.request('content'), /response_body_too_large/);
    assert.equal(cancellations, 1);
  });
  test(`http-semantics: abort beats bodyless metadata success (${requestTimeoutMs})`, async () => {
    const source = new AbortController();
    const reason = new Error('synthetic abort');
    const { transport } = fixture({ requestTimeoutMs, responseBodyLimitBytes: 3 }, () => {
      source.abort(reason);
      return new Response(null, { headers: { 'content-length': '1048576' } });
    });
    await assert.rejects(transport.request('metadata', { method: 'HEAD', signal: source.signal }), e => e === reason);
  });
}
