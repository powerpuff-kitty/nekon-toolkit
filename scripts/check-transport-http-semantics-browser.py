"""Verification-only browser harness: emitted modules, synthetic Fetch responses, no service."""
import argparse
from pathlib import Path
from importlib.metadata import version
import json
from playwright.sync_api import sync_playwright
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--chromium', type=Path, help='An already installed Chromium executable')
args = parser.parse_args()
R = Path(__file__).resolve().parents[1]
modules={f'https://transport.test/{name}.js':(R/f'packages/client-runtime/dist/{name}.js').read_text() for name in ['client-transport','bounded-response']}
assert version('playwright')=='1.57.0'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, **({'executable_path': str(args.chromium.resolve(strict=True))} if args.chromium else {}))
 ctx=browser.new_context(offline=True)
 unexpected=[]; errors=[]
 def handle(route):
  if route.request.url not in modules:
   unexpected.append(route.request.url);route.abort();return
  route.fulfill(status=200,content_type='text/javascript',headers={'Access-Control-Allow-Origin':'*'},body=modules[route.request.url])
 ctx.route('**/*',handle)
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.set_content('<!doctype html><html lang="en"><title>Transport semantics verification</title></html>')
  checks=page.evaluate(r'''async()=>{
    const {NekonTransport}=await import('https://transport.test/client-transport.js');
    const checks=[];
    const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
    const rejects=async promise=>{try{await promise;}catch(e){return e;}throw new Error('Expected rejection');};
    const origin='https://example.invalid';
    for(const [method,status] of [['HEAD',200],['HEAD',404],['GET',304]]){
      const raw=new Response(null,{status,headers:{'content-length':'1048576'}});
      const client=new NekonTransport(origin,{requestTimeoutMs:0,responseBodyLimitBytes:3,fetch:async()=>raw});
      const response=await client.request('metadata',{method});
      assert(response===raw&&response.body===null&&response.headers.get('content-length')==='1048576'&&await response.text()==='',method+' '+status+' metadata is accepted without a body');
    }
    for(const [path,expected] of [
      ['objects?cursor=folder/','objects?cursor=folder/'],
      ['/objects/?cursor=folder//','objects?cursor=folder//'],
      ['objects?cursor=a%2Fb%2F&last=/','objects?cursor=a%2Fb%2F&last=/'],
      ['objects/?','objects?'],
    ]){
      let seen;const client=new NekonTransport(origin,{requestTimeoutMs:0,fetch:async(url)=>{seen=url;return new Response(null,{status:204});}});
      await client.request(path);
      assert(seen.href===origin+'/api/client/v1/'+expected,'query preserved: '+path);
    }
    let dispatched=0;
    const client=new NekonTransport(origin,{requestTimeoutMs:0,fetch:async()=>{dispatched++;return new Response(null,{status:204});}});
    for(const path of ['%2e%2e/metadata?cursor=/','rooms%2fadmin?cursor=/']){
      let rejected=false;try{client.request(path);}catch(e){rejected=e.message==='invalid_client_api_path';}
      assert(rejected&&dispatched===0,'path guard retained: '+path);
    }
    let canceled=0;
    const tooBig=new NekonTransport(origin,{requestTimeoutMs:0,responseBodyLimitBytes:3,fetch:async()=>
      new Response(new ReadableStream({cancel(){canceled++;}}),{headers:{'content-length':'9'}})});
    assert((await rejects(tooBig.request('content'))).message==='response_body_too_large'&&canceled===1,'non-null declared oversize is still rejected and canceled');
    let cause;
    const streamClient=new NekonTransport(origin,{requestTimeoutMs:0,responseBodyLimitBytes:3,fetch:async()=>new Response(new ReadableStream({
      pull(c){c.enqueue(new TextEncoder().encode('abcdef'));},cancel(e){cause=e;}
    },{highWaterMark:0}))});
    const response=await streamClient.request('content');const clone=response.clone();
    const failed=await Promise.all([rejects(response.text()),rejects(clone.text())]);
    assert(failed.every(e=>e instanceof Error)&&cause?.message==='response_body_too_large','original and clone still share the stream byte bound');
    const abort=new AbortController();abort.abort();
    assert((await rejects(client.request('metadata',{method:'HEAD',signal:abort.signal}))).name==='AbortError'&&dispatched===0,'pre-abort still prevents dispatch');
    let init;
    const redirectClient=new NekonTransport(origin,{requestTimeoutMs:0,fetch:async(_u,i)=>{init=i;return new Response(null,{status:204});}});
    await redirectClient.request('objects?cursor=/',{redirect:'follow'});
    assert(init.redirect==='error','caller cannot enable redirect forwarding');
    return checks;
  }''')
  assert not unexpected and not errors
  checks.append('two emitted modules fulfilled locally; no external requests or page errors')
  print(json.dumps({'passed':len(checks),'checks':checks,'browser':browser.version,'playwright':version('playwright'),'network':'Synthetic Fetch adapters; not browser TLS/CORS/cookies or a live service'},indent=2))
 finally:
  ctx.close();browser.close()
