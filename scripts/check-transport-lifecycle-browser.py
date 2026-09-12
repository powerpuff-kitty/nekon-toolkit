"""Run emitted transport modules with native browser streams and synthetic adapters only."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from importlib.metadata import version
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', type=Path, help='An already installed Chromium executable')
    args = parser.parse_args()
    if version('playwright') != '1.57.0':
        raise SystemExit('Use the pinned scripts/browser-requirements.txt environment.')
    modules = {
        f'https://transport.test/{name}.js':
            (ROOT / f'packages/client-runtime/dist/{name}.js').read_text(encoding='utf-8')
        for name in ['client-transport', 'bounded-response']
    }
    unexpected: list[str] = []
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **(
            {'executable_path': str(args.chromium.resolve(strict=True))} if args.chromium else {}
        ))
        context = browser.new_context(offline=True)
        def fulfill(route):
            if route.request.url not in modules:
                unexpected.append(route.request.url)
                route.abort()
                return
            route.fulfill(status=200, content_type='text/javascript',
                          headers={'Access-Control-Allow-Origin': '*'}, body=modules[route.request.url])
        context.route('**/*', fulfill)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.set_content('<!doctype html><html lang="en"><title>Transport lifecycle</title></html>')
            checks = page.evaluate('''async () => {
              const { NekonTransport } = await import('https://transport.test/client-transport.js');
              const checks = [];
              const assert = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
              const rejected = async promise => { try { await promise; } catch (error) { return error; } throw new Error('Expected rejection'); };
              const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
              const origin = 'https://example.invalid';
              const body = mode => {
                const state = { canceled:0, pulls:0 };
                const stream = new ReadableStream({
                  pull(){state.pulls++;},
                  cancel(){state.canceled++; if(mode==='reject') return Promise.reject(new Error('synthetic'));
                    if(mode==='pending') return new Promise(()=>{});}
                }, {highWaterMark:0});
                return {state, stream};
              };
              const operations = [
                ['discover', t=>t.discover()], ['connect', t=>t.connect('dev_SYNTHETICDEVICE0000')],
                ['connectRoomLive', t=>t.connectRoomLive('room_SYNTHETICROOM00000','dev_SYNTHETICDEVICE0000')],
                ['connectCall', t=>t.connectCall('call_SYNTHETICCALL00000','dev_SYNTHETICDEVICE0000')]
              ];
              for (const [name, run] of operations) {
                const {state,stream}=body(); let sockets=0;
                class Socket {constructor(){sockets++;}}
                const client=new NekonTransport(origin,{requestTimeoutMs:0,WebSocket:Socket,
                  fetch:async()=>new Response(stream,{status:503})});
                const error=await rejected(run(client)); await flush();
                assert(error.message.endsWith(':503')&&state.canceled===1&&state.pulls===0&&sockets===0,
                  name+': error closes unread body and opens no socket');
              }
              for(const mode of ['reject','pending']){
                const {state,stream}=body(mode);
                const client=new NekonTransport(origin,{requestTimeoutMs:0,fetch:async()=>new Response(stream,{status:503})});
                const error=await rejected(client.discover()); await flush();
                assert(error.message==='nekon_discovery_failed:503'&&state.canceled===1,
                  mode+' cancellation cannot replace or delay the status error');
              }
              const abort=new AbortController();const reason=new Error('synthetic pre-abort');abort.abort(reason);let calls=0;
              const pre=new NekonTransport(origin,{fetch:async()=>{calls++;return new Response(null,{status:204});}});
              assert(await rejected(pre.request('session',{signal:abort.signal}))===reason&&calls===0,
                'pre-aborted request never dispatches');
              for(const hasBody of [false,true]){
                const during=new AbortController();const cause=new Error('synthetic in-flight abort');const {state,stream}=body();
                const client=new NekonTransport(origin,{requestTimeoutMs:0,fetch:async()=>{during.abort(cause);return new Response(hasBody?stream:null,{status:hasBody?200:204});}});
                const error=await rejected(client.request('session',{signal:during.signal}));await flush();
                assert(error===cause&&state.canceled===(hasBody?1:0),'late '+(hasBody?'body':'empty')+' response honors cancellation');
              }
              const client=new NekonTransport(origin,{requestTimeoutMs:0,fetch:async()=>new Response('synthetic conflict',{status:409})});
              const response=await client.request('session');
              assert(response.status===409&&await response.text()==='synthetic conflict','generic request retains caller ownership of error data');
              let canceled=0;let cancelReason;
              const bounded=new NekonTransport(origin,{requestTimeoutMs:0,responseBodyLimitBytes:3,fetch:async()=>new Response(new ReadableStream({
                pull(c){c.enqueue(new TextEncoder().encode('abcdef'));},
                cancel(reason){canceled++;cancelReason=reason;}
              },{highWaterMark:0}))});
              const limited=await bounded.request('session');const clone=limited.clone();
              const failures=await Promise.all([rejected(limited.text()),rejected(clone.text())]);
              await flush();
              // Chromium may translate a stream error to TypeError("Failed to fetch")
              // in native convenience methods. Verify the actual cancellation cause
              // and the raw reader separately, rather than assuming Node's message.
              assert(failures.every(e=>e instanceof Error)&&canceled===1&&cancelReason.message==='response_body_too_large',
                'clone and original reject overflow and cancel their shared upstream once');
              const raw=await bounded.request('session');
              assert((await rejected(raw.body.getReader().read())).message==='response_body_too_large',
                'raw reader preserves the overflow reason');
              return checks;
            }''')
            assert not unexpected, 'Unexpected request outside the in-memory module allowlist'
            assert not errors, 'Unexpected page error'
            checks.append('only two emitted modules fulfilled locally; no external network or page errors')
            print(json.dumps({'passed':len(checks),'browser':browser.version,'playwright':version('playwright'),'checks':checks}, indent=2))
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
