"""Exercise the emitted ESM codec in offline Chromium; no HTTP or file navigation."""
from __future__ import annotations
import argparse
import json
from importlib.metadata import version
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', type=Path, help='An already installed Chromium executable')
    args = parser.parse_args()
    if version('playwright') != '1.57.0':
        raise SystemExit('Use the existing scripts/browser-requirements.txt (Playwright 1.57.0).')
    sources = {
        'runtime': (ROOT / 'packages/client-runtime/dist/application-event-payload.js').read_text(),
        'sdk': (ROOT / 'packages/sdk/dist/application-event.js').read_text(),
        'hex': (ROOT / 'tests/protocol-vectors/v1-application-event-payload.hex').read_text().strip(),
    }
    requests: list[str] = []
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **(
            {'executable_path': str(args.chromium.resolve(strict=True))} if args.chromium else {}
        ))
        context = browser.new_context(offline=True)
        context.route('**/*', lambda route: route.abort())
        page = context.new_page()
        page.on('request', lambda request: requests.append(request.url)
                if request.url.startswith(('http:', 'https:', 'ws:', 'wss:')) else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.set_content('<!doctype html><html lang="en"><head><title>Codec test</title></head><body></body></html>')
            result = page.evaluate('''async ({runtime, sdk, hex}) => {
              const checks = [];
              const assert = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
              const expectReject = callback => { try { callback(); return false; } catch { return true; } };
              const runtimeURL = URL.createObjectURL(new Blob([runtime], {type: 'text/javascript'}));
              const sdkURL = URL.createObjectURL(new Blob([sdk], {type: 'text/javascript'}));
              try {
                const map = document.createElement('script'); map.type = 'importmap';
                map.textContent = JSON.stringify({imports: {'@nekon/client-runtime/application-event': runtimeURL}});
                document.head.append(map);
                const api = await import(sdkURL);
                assert(api.NEKON_APPLICATION_EVENT_SCHEMA === 'nekon.application-event/1', 'emitted SDK imports its separate runtime module in a browser');
                const content = new TextEncoder().encode('{"taskId":"task_123","title":"Review proposal"}');
                const input = {roomId:'room_01JABCDEFGHIJKLMNOP',eventId:'evt_01JAPPLICATIONEVENT0',
                  type:'com.example.task.created',schemaVersion:1,contentType:'application/json',content,
                  relation:{kind:'thread',eventId:'evt_01JPREVIOUSTASK000'}};
                const bytes = api.encodeApplicationEventPayload(input);
                assert([...bytes].map(b=>b.toString(16).padStart(2,'0')).join('') === hex, 'browser output matches the pinned upstream protocol vector');
                const decoded = api.inspectApplicationEventPayload(bytes);
                assert(new TextDecoder().decode(decoded.content) === new TextDecoder().decode(content), 'opaque bytes round trip');
                api.clearApplicationEventPayload(decoded);
                assert(decoded.content.every(b=>b===0) && content[0]!==0 && bytes[0]!==0, 'clearing decoded content preserves separately owned input and encoded buffers');
                const encoder = api.createApplicationEventEncoder(input);
                content.fill(0); input.relation.kind = 'reaction';
                const fromDraft = api.inspectApplicationEventPayload(encoder({roomId:input.roomId,eventId:input.eventId}));
                assert(fromDraft.content[0]===123 && fromDraft.relation.kind==='thread', 'draft wrapper snapshots caller-owned input');
                assert(expectReject(()=>api.inspectApplicationEventPayload(bytes.subarray(0,20))), 'truncated payload is rejected');
                const extra = new Uint8Array(bytes.length+1); extra.set(bytes);
                assert(expectReject(()=>api.inspectApplicationEventPayload(extra)), 'trailing data is rejected');
                assert(Object.isFrozen(api.V1_APPLICATION_EVENT_POLICY), 'policy is immutable');
                return checks;
              } finally { URL.revokeObjectURL(runtimeURL); URL.revokeObjectURL(sdkURL); }
            }''', sources)
            assert not requests, 'Unexpected external network request'
            assert not errors, 'Unexpected page error'
            result.append('offline browser produces no external requests or page errors')
            print(json.dumps({'passed': len(result), 'browser': browser.version,
                              'playwright': version('playwright'), 'checks': result}, indent=2))
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
