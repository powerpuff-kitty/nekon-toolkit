"""Exercise emitted transport ESM with synthetic adapters; module requests are fulfilled in memory."""
from __future__ import annotations
import argparse
import json
from importlib.metadata import version
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'https://nekon-modules.invalid/'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', type=Path, help='An already installed Chromium executable')
    args = parser.parse_args()
    if version('playwright') != '1.57.0':
        raise SystemExit('Use scripts/browser-requirements.txt: Playwright 1.57.0.')
    modules = {
        PREFIX + name + '.js': (ROOT / 'packages/client-runtime/dist' / (name + '.js')).read_text()
        for name in ['client-transport', 'bounded-response']
    }
    served: list[str] = []
    unexpected: list[str] = []
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **(
            {'executable_path': str(args.chromium.resolve(strict=True))} if args.chromium else {}
        ))
        context = browser.new_context(offline=True)
        def route_request(route):
            url = route.request.url
            if url not in modules:
                unexpected.append(url)
                route.abort()
                return
            served.append(url)
            route.fulfill(status=200, body=modules[url], headers={
                'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*',
            })
        context.route('**/*', route_request)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.set_content('<!doctype html><html lang="en"><head><title>Transport tests</title></head><body></body></html>')
            result = page.evaluate('''async (entry) => {
              const { NekonTransport } = await import(entry);
              const checks = [];
              const assert = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
              const rejects = async (action) => { try { await action(); return false; } catch { return true; } };
              let canceled = false;
              const observed = [];
              const transport = new NekonTransport('https://example.invalid', {
                requestTimeoutMs: 0, responseBodyLimitBytes: 3,
                fetch: async (url, init) => {
                  observed.push({url: String(url), init});
                  return new Response(new ReadableStream({
                    start(c) { c.enqueue(new TextEncoder().encode('abcdef')); },
                    cancel() { canceled = true; },
                  }));
                },
              });
              const response = await transport.request('test', {redirect:'follow'});
              const copy = response.clone();
              const failed = await Promise.all([rejects(()=>response.text()), rejects(()=>copy.text())]);
              assert(failed.every(Boolean) && canceled, 'browser clones and original share byte bounds and upstream cancellation');
              assert(observed[0].init.redirect === 'error', 'browser request configuration forbids redirect forwarding');
              assert(await rejects(()=>transport.request('../invalid')), 'invalid route is rejected before browser fetch adapter');
              assert(observed.length===1, 'invalid route does not dispatch HTTP');
              const direct = await transport.request('test');
              assert(await rejects(()=>direct.body.getReader().read()), 'browser direct body readers obey byte bounds');
              const allowed = new NekonTransport('https://example.invalid', {requestTimeoutMs:0,responseBodyLimitBytes:3,
                fetch:async()=>new Response('abc',{status:201})});
              const good = await allowed.request('test');
              assert(good.status===201 && await good.text()==='abc' && good.bodyUsed, 'native browser Response success and bodyUsed semantics survive wrapping');
              const abort = new AbortController(); let aborted=false;
              const pending = new NekonTransport('https://example.invalid',{requestTimeoutMs:0,
                fetch:async()=>new Response(new ReadableStream({cancel(){aborted=true;}}))});
              const body = await pending.request('test',{signal:abort.signal});
              const outcome=rejects(()=>body.text()); abort.abort();
              assert(await outcome && aborted, 'caller abort cancels browser stream consumption');
              const sockets=[]; const requests=[];
              const device='dev_SYNTHETICDEVICE0000';
              class Socket { constructor(url,protocols) { this.url=String(url);this.protocols=protocols;sockets.push(this); } }
              const socketTransport=new NekonTransport('https://example.invalid',{requestTimeoutMs:0,WebSocket:Socket,
                fetch:async(url,init)=>{requests.push({url:String(url),init});return Response.json({
                  ...JSON.parse(init.body),ticket:'A'.repeat(43),expiresAt:Date.now()+5000});}});
              const socket=await socketTransport.connect(device);
              assert(sockets.length===1 && socket.protocols[0]==='nekon.protocol.v1' && !socket.url.includes('A'.repeat(43)),
                'browser ticket negotiation constructs a socket with no ticket in its URL');
              const guest=new NekonTransport('https://example.invalid',{roomGuestRoomId:'room_SYNTHETICROOM00000',requestTimeoutMs:0,
                fetch:async(url,init)=>{requests.push({url:String(url),init});return new Response(null,{status:204});}});
              await guest.request('test',{headers:{Cookie:'synthetic=1',Authorization:'Bearer synthetic'}});
              assert(requests.at(-1).init.credentials==='omit' && !requests.at(-1).init.headers.has('Cookie') && !requests.at(-1).init.headers.has('Authorization'),
                'guest request removes account credential headers before dispatch');
              return checks;
            }''', PREFIX + 'client-transport.js')
            assert sorted(served) == sorted(modules), 'Both emitted modules must be served exactly once'
            assert not unexpected and not errors, 'Unexpected request or browser page error'
            result.append('only two unchanged emitted modules are fulfilled in memory; all other network access is blocked')
            print(json.dumps({'passed':len(result),'browser':browser.version,'playwright':version('playwright'),
                'mode':'offline, in-memory modules and synthetic HTTP/WebSocket adapters','checks':result},indent=2))
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
