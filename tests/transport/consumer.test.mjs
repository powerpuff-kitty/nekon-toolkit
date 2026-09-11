import test from 'node:test';
import assert from 'node:assert/strict';
const {
  NekonTransport, NEKON_API_VERSION, NEKON_API_VERSION_HEADER,
  NEKON_APPLICATION_SESSION_HEADER, NEKON_ROOM_GUEST_SESSION_HEADER,
  NEKON_WEBSOCKET_PROTOCOL, NEKON_ROOM_LIVE_WEBSOCKET_PROTOCOL,
  NEKON_CALL_WEBSOCKET_PROTOCOL,
} = await import(process.env.NEKON_TRANSPORT_TEST_MODULE ?? '@nekon/client-runtime/transport');

const ORIGIN = 'https://example.invalid';
const DEVICE = 'dev_SYNTHETICDEVICE0000';
const ROOM = 'room_SYNTHETICROOM00000';
const CALL = 'call_SYNTHETICCALL00000';
// Synthetic test tokens, never valid production credentials.
const SESSION = `${DEVICE}.${Buffer.alloc(32).toString('base64url')}`;
const TOKEN = 'A'.repeat(43);
const textBytes = value => new TextEncoder().encode(value);
const fixture = (options = {}, respond = () => new Response(null, {status: 204})) => {
  const requests = [];
  const transport = new NekonTransport(ORIGIN, {requestTimeoutMs:0, ...options, fetch: async (url, init) => {
    requests.push({url, init}); return respond(url, init);
  }});
  return {transport, requests};
};

test('request uses canonical API version and origin without mutating caller headers', async () => {
  const {transport, requests} = fixture();
  const headers = new Headers({[NEKON_API_VERSION_HEADER]:'wrong', 'x-demo':'value'});
  await transport.request('/rooms/example?cursor=a%2Fb', {headers});
  assert.equal(requests[0].url.href, `${ORIGIN}/api/client/v1/rooms/example?cursor=a%2Fb`);
  assert.equal(requests[0].init.headers.get(NEKON_API_VERSION_HEADER), NEKON_API_VERSION);
  assert.equal(headers.get(NEKON_API_VERSION_HEADER), 'wrong');
});
for (const origin of ['http://localhost:7100', 'http://127.0.0.1:7100', 'http://[::1]:7100', ORIGIN]) {
  test(`accepts supported origin ${origin}`, () => assert.doesNotThrow(() => new NekonTransport(origin)));
}
for (const origin of ['http://example.invalid', 'ftp://example.invalid', 'https://user:password@example.invalid']) {
  test('rejects an unsupported or credential-bearing origin before request dispatch', () => {
    assert.throws(() => new NekonTransport(origin), /secure_nekon_origin_required/);
  });
}
for (const path of ['', '/', '../admin', '%2e%2e/%2e%2e/admin', '%2Fadmin', '%252e%252e/admin',
  '\\admin', 'rooms\n/x', 'rooms#fragment', 'https://other.invalid', '?cursor=1']) {
  test(`rejects noncanonical API route ${JSON.stringify(path)}`, () => {
    const {transport, requests} = fixture();
    assert.throws(() => transport.request(path), /invalid_client_api_path/);
    assert.equal(requests.length, 0);
  });
}
test('discovery is credential-free and removes base-path/query fragments', async () => {
  let observed;
  const transport = new NekonTransport(`${ORIGIN}/ignored?x=1#fragment`, {
    requestTimeoutMs:0, fetch:async (url,init) => { observed={url,init}; return Response.json({synthetic:true}); },
  });
  assert.deepEqual(await transport.discover(), {synthetic:true});
  assert.equal(observed.url.href, `${ORIGIN}/api/client/versions`);
  assert.equal(observed.init.credentials, 'omit');
  assert.equal(observed.init.redirect, 'error');
});
test('requests cannot opt into redirect forwarding', async () => {
  const {transport, requests}=fixture();
  await transport.request('session',{redirect:'follow'});
  assert.equal(requests[0].init.redirect,'error');
});
test('application sessions are installed and cleared without changing caller headers', async () => {
  const {transport,requests}=fixture(); transport.setApplicationSession(SESSION);
  await transport.request('session'); transport.clearApplicationSession(); await transport.request('session');
  assert.equal(requests[0].init.headers.get(NEKON_APPLICATION_SESSION_HEADER),SESSION);
  assert.equal(requests[1].init.headers.has(NEKON_APPLICATION_SESSION_HEADER),false);
});
test('explicit public request strips automatic and caller-supplied application sessions', async () => {
  const {transport,requests}=fixture(); transport.setApplicationSession(SESSION);
  await transport.request('public',{headers:{[NEKON_APPLICATION_SESSION_HEADER]:SESSION}}, {credentialMode:'public'});
  assert.equal(requests[0].init.credentials,'omit');
  assert.equal(requests[0].init.headers.has(NEKON_APPLICATION_SESSION_HEADER),false);
});
test('invalid sessions and contradictory credential policies are rejected', () => {
  const {transport}=fixture();
  for (const invalid of ['', 'invalid', `${DEVICE}.bad`, `${SESSION}=`]) assert.throws(()=>transport.setApplicationSession(invalid));
  assert.throws(()=>transport.request('session',{credentials:'omit'},{credentialMode:'application-session'}));
  assert.throws(()=>transport.request('session',{}, {credentialMode:'invented'}));
});
test('guest transport excludes account authority and uses only its owned guest session', async () => {
  const {transport,requests}=fixture({roomGuestRoomId:ROOM});
  assert.throws(()=>transport.setApplicationSession(SESSION),/guest_transport_forbids_account_session/);
  transport.setRoomGuestSession(SESSION);
  await transport.request('rooms/'+ROOM,{headers:{Cookie:'synthetic=1',Authorization:'Bearer synthetic',
    [NEKON_APPLICATION_SESSION_HEADER]:SESSION,[NEKON_ROOM_GUEST_SESSION_HEADER]:'caller'}});
  const {headers,credentials}=requests[0].init;
  assert.equal(credentials,'omit'); assert.equal(headers.get(NEKON_ROOM_GUEST_SESSION_HEADER),SESSION);
  for (const name of ['Cookie','Authorization',NEKON_APPLICATION_SESSION_HEADER]) assert.equal(headers.has(name),false);
  transport.clearApplicationSession(); await transport.request('rooms/'+ROOM);
  assert.equal(requests[1].init.headers.has(NEKON_ROOM_GUEST_SESSION_HEADER),false);
});
test('guest object capability remains restricted to its explicit public attachment operation', async () => {
  const {transport,requests}=fixture({roomGuestRoomId:ROOM}); transport.setRoomGuestSession(SESSION);
  const auth=`Nekon-Attachment-Download ${TOKEN}`;
  await transport.request(`attachments/${TOKEN}/content`,{headers:{Authorization:auth}},{credentialMode:'public'});
  assert.equal(requests[0].init.headers.get('Authorization'),auth);
  assert.equal(requests[0].init.headers.has(NEKON_ROOM_GUEST_SESSION_HEADER),false);
  await transport.request('rooms/'+ROOM,{headers:{Authorization:auth}},{credentialMode:'public'});
  assert.equal(requests[1].init.headers.has('Authorization'),false);
});
for (const invalid of [NaN,Infinity,-1,1.5,2147483648]) {
  test('invalid timer configuration is rejected',()=>assert.throws(()=>fixture({requestTimeoutMs:invalid}),/invalid_request_timeout/));
}
test('invalid size and deadline policies are rejected',()=>{
  for (const invalid of [NaN,Infinity,0,-1,1.5]) {
    assert.throws(()=>fixture({responseBodyLimitBytes:invalid}));
    assert.throws(()=>fixture().transport.request('test',{}, {responseBodyLimitBytes:invalid}));
  }
  for (const invalid of [0,-1,NaN,Infinity,1.5,2147483648]) assert.throws(()=>fixture().transport.request('test',{}, {deadlineMs:invalid}));
});
for (const method of ['text','json','arrayBuffer','blob','formData','clone','reader']) {
  test(`body limit applies to ${method} consumption`,async()=>{
    const {transport}=fixture({responseBodyLimitBytes:3},()=>new Response('abcdef',{headers:{'content-type':'application/x-www-form-urlencoded'}}));
    const response=await transport.request('test');
    if(method==='clone') {
      const clone=response.clone();
      await Promise.all([assert.rejects(clone.text(),/response_body_too_large/),assert.rejects(response.text(),/response_body_too_large/)]);
    } else if(method==='reader') await assert.rejects(response.body.getReader().read(),/response_body_too_large/);
    else await assert.rejects(response[method](),/response_body_too_large/);
  });
}
test('stream byte accounting spans chunks, cancels overflow, and tolerates omitted/incorrect length',async()=>{
  let canceled=false;
  const {transport}=fixture({responseBodyLimitBytes:3},()=>new Response(new ReadableStream({
    start(c){c.enqueue(textBytes('ab'));c.enqueue(textBytes('cd'));},cancel(){canceled=true;},
  }),{headers:{'content-length':'1'}}));
  await assert.rejects((await transport.request('test')).text(),/response_body_too_large/);
  assert.equal(canceled,true);
});
test('declared oversized response is canceled before returning it',async()=>{
  let canceled=false;
  const {transport}=fixture({responseBodyLimitBytes:3},()=>new Response(new ReadableStream({cancel(){canceled=true;}}),{headers:{'content-length':'999999999999999999999999'}}));
  await assert.rejects(transport.request('test'),/response_body_too_large/); assert.equal(canceled,true);
});
test('discovery remains bounded when deadlines are disabled',async()=>{
  const {transport}=fixture({responseBodyLimitBytes:3},()=>Response.json({synthetic:true}));
  await assert.rejects(transport.discover(),/response_body_too_large/);
});
test('Response methods, metadata, cloning, bodyUsed and exact-limit success are preserved',async()=>{
  const raw=new Response('abc',{status:201,statusText:'Created',headers:{'x-demo':'yes'}});
  Object.defineProperty(raw,'url',{value:`${ORIGIN}/api/client/v1/test`});
  const {transport}=fixture({responseBodyLimitBytes:3},()=>raw);
  const response=await transport.request('test'); const clone=response.clone();
  assert.equal(response.status,201);assert.equal(response.statusText,'Created');assert.equal(response.headers.get('x-demo'),'yes');
  assert.equal(response.url,raw.url);assert.equal(clone.url,raw.url); assert.equal(response.bodyUsed,false);
  assert.deepEqual(await Promise.all([response.text(),clone.text()]),['abc','abc']);assert.equal(response.bodyUsed,true);
  await assert.rejects(response.text(),TypeError);
});
test('ordinary writes are not automatically deadline-aborted',async()=>{
  const {transport,requests}=fixture({requestTimeoutMs:1});
  await transport.request('test',{method:'POST',body:'synthetic'});
  assert.equal(requests[0].init.signal,undefined);
  assert.equal(requests.length,1);
});
test('read deadline cancels an unread stream without requiring a convenience method',async t=>{
  t.mock.timers.enable({apis:['setTimeout']}); let canceled=false;
  const {transport}=fixture({requestTimeoutMs:10},()=>new Response(new ReadableStream({cancel(){canceled=true;}})));
  const response=await transport.request('test');
  t.mock.timers.tick(10);
  await assert.rejects(response.body.getReader().read(),{name:'TimeoutError'});
  assert.equal(canceled,true);
});
test('explicit write deadline and caller abort propagate and cancel pending observation',async()=>{
  let canceled=false; const abort=new AbortController();
  const {transport}=fixture({},()=>new Response(new ReadableStream({cancel(){canceled=true;}})));
  const response=await transport.request('test',{method:'POST',signal:abort.signal},{deadlineMs:10000});
  const rejected=assert.rejects(response.text(),{name:'AbortError'});
  abort.abort();await rejected;assert.equal(canceled,true);
});
test('completion clears deadline timer and stream cancellation is handled',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {transport}=fixture({requestTimeoutMs:10},()=>new Response('ok'));
  const response=await transport.request('test');assert.equal(await response.text(),'ok');
  t.mock.timers.tick(100);assert.equal(response.bodyUsed,true);
  let canceled=false;
  const next=fixture({requestTimeoutMs:10},()=>new Response(new ReadableStream({cancel(){canceled=true;}})));
  await (await next.transport.request('test')).body.cancel();assert.equal(canceled,true);
});

function socketFixture(change = value => value, status=200) {
  const sockets=[]; const requests=[];
  class Socket { constructor(url,protocols){this.url=String(url);this.protocols=protocols;sockets.push(this);} }
  const transport=new NekonTransport(ORIGIN,{WebSocket:Socket,requestTimeoutMs:0,fetch:async(url,init)=>{
    requests.push({url,init}); const scope=JSON.parse(init.body);
    return Response.json(change({...scope,ticket:TOKEN,expiresAt:Date.now()+5000}),{status});
  }});return {transport,sockets,requests};
}
for (const [method,args,protocol,suffix] of [
  ['connect',[DEVICE],NEKON_WEBSOCKET_PROTOCOL,`/ws?deviceId=${DEVICE}`],
  ['connectRoomLive',[ROOM,DEVICE],NEKON_ROOM_LIVE_WEBSOCKET_PROTOCOL,`/api/client/v1/rooms/${ROOM}/live?deviceId=${DEVICE}`],
  ['connectCall',[CALL,DEVICE],NEKON_CALL_WEBSOCKET_PROTOCOL,`/api/client/v1/calls/${CALL}/ws?deviceId=${DEVICE}`],
]) {
  test(`${method} opens only after a validated target-bound ticket`,async()=>{
    const {transport,sockets,requests}=socketFixture();transport.setApplicationSession(SESSION);
    const socket=await transport[method](...args);
    assert.equal(sockets.length,1);assert.equal(socket.url,`wss://example.invalid${suffix}`);
    assert.deepEqual(socket.protocols,[protocol,`nekon.ws-ticket.${TOKEN}`]);
    assert.equal(socket.url.includes(TOKEN),false);
    assert.equal(requests[0].init.headers.get(NEKON_APPLICATION_SESSION_HEADER),SESSION);
    assert.equal(requests[0].init.redirect,'error');
    assert.deepEqual(JSON.parse(requests[0].init.body),{protocol,target:suffix});
  });
}
for (const [label,change] of [
  ['wrong target',b=>({...b,target:'/different'})],['wrong protocol',b=>({...b,protocol:'different'})],
  ['expired',b=>({...b,expiresAt:0})],['too far in future',b=>({...b,expiresAt:Date.now()+120000})],
  ['noninteger expiry',b=>({...b,expiresAt:1.5})],['short ticket',b=>({...b,ticket:'invalid'})],
  ['extra field',b=>({...b,extra:true})],['missing ticket',b=>({target:b.target,protocol:b.protocol,expiresAt:b.expiresAt})],
]) {
  test(`rejects ${label} ticket without opening a socket`,async()=>{
    const {transport,sockets}=socketFixture(change);
    await assert.rejects(transport.connect(DEVICE),/invalid_websocket_ticket_response/);assert.equal(sockets.length,0);
  });
}
test('HTTP failure and invalid identifiers never create sockets',async()=>{
  const denied=socketFixture(b=>b,403);await assert.rejects(denied.transport.connect(DEVICE),/websocket_ticket_failed:403/);
  assert.equal(denied.sockets.length,0);
  const other=socketFixture();
  await assert.rejects(other.transport.connect('bad'),/invalid_device_id/);
  await assert.rejects(other.transport.connectRoomLive('bad',DEVICE),/invalid_room_id/);
  assert.equal(other.requests.length,0);assert.equal(other.sockets.length,0);
});
