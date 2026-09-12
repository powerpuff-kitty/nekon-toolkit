"""Actual self-contained workbench UI; no live NEKON endpoint or browser navigation.

Render local HTML and emitted modules in memory using Playwright. No browser
policy is changed. This tests DOM behavior, not TLS/CORS/MLS/Cloud messaging.
"""
import argparse
import hashlib
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--chromium', default='/usr/bin/chromium')
parser.add_argument('--screenshot', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
html = (root / 'examples/developer-workbench/dist/index.html').read_text()
results = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    results.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1120})
    network = []
    context.route('**/*', lambda route: (network.append(route.request.url), route.abort()))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    # Instrument API use before the actual page's modules execute. The browser's
    # own data-URL module loading is unchanged and does not call window.fetch.
    page.evaluate('''() => {
      window.__sideEffects = [];
      window.fetch = () => { window.__sideEffects.push('fetch'); throw new Error('test_network_forbidden'); };
      window.WebSocket = class { constructor() { window.__sideEffects.push('socket'); throw new Error('test_socket_forbidden'); } };
      Storage.prototype.setItem = () => { window.__sideEffects.push('storage'); throw new Error('test_storage_forbidden'); };
      IDBFactory.prototype.open = () => { window.__sideEffects.push('indexedDB'); throw new Error('test_idb_forbidden'); };
    }''')
    page.set_content(html)
    page.wait_for_function("document.querySelector('#loadState').textContent === 'Local SDK loaded'")
    check('loads actual embedded public SDK with controls enabled', not page.get_by_role('button', name='Encode and inspect').is_disabled())
    check('explicit plaintext and no-Cloud boundaries remain visible', page.get_by_text('Encoding is not encryption.', exact=True).is_visible())
    check('all form inputs have an accessible label', page.evaluate('''() => [...document.querySelectorAll('input, select, textarea')].every(el => el.labels.length > 0)'''))

    def sample(name):
        page.locator(f'[data-sample="{name}"]').click()
    def encode():
        page.get_by_role('button', name='Encode and inspect').click()
    sample('message'); encode()
    check('message sample round-trip', page.locator('#decoded').inner_text() == 'Hello from your own interface.')
    first_hex = page.locator('#encoded').input_value()
    page.locator('#content').fill('猫 👋 café')
    check('editing invalidates old output', page.locator('#encoded').input_value() == '' and page.locator('#byteCount').inner_text() == '—')
    encode()
    check('unicode content and UTF-8 byte count', page.locator('#decoded').inner_text() == '猫 👋 café' and page.locator('#contentCount').inner_text() == str(len('猫 👋 café'.encode())))
    sample('telemetry'); encode()
    check('JSON sample is preserved without normalizing', page.locator('#decoded').inner_text() == page.locator('#content').input_value())
    page.locator('#content').fill('{invalid'); encode()
    check('invalid JSON clears previous results and reports failure', page.locator('#resultState').inner_text() == 'Input rejected' and page.locator('#encoded').input_value() == '')
    sample('command'); encode()
    check('command payload is inert and labelled', 'setTemperature' in page.locator('#decoded').inner_text() and not page.evaluate('window.__sideEffects.length'))
    page.get_by_role('button', name='Re-inspect these bytes').click()
    check('encoded result can be re-inspected through real decoder', page.locator('#resultState').inner_text() == 'Canonical payload valid' and page.locator('#hexInput').input_value() != '')
    page.locator('#hexInput').fill('aa trailing text')
    page.get_by_role('button', name='Inspect hex', exact=True).click()
    check('malformed hex fails and removes stale output', page.locator('#resultState').inner_text() == 'Input rejected' and page.locator('#encoded').input_value() == '')
    sample('message')
    payload = '<img src="https://example.invalid/test" onerror="window.__executed=true">'
    page.locator('#content').fill(payload); encode()
    check('HTML-like content renders as text without elements or code execution', page.locator('#decoded').inner_text() == payload and page.locator('#decoded img').count() == 0 and page.evaluate('window.__executed !== true'))
    page.locator('#type').fill('invalid'); encode()
    check('invalid namespace fails through actual codec', page.locator('#resultState').inner_text() == 'Input rejected')
    page.get_by_role('button', name='Clear all', exact=True).click()
    check('clear removes inputs and outputs', page.locator('#content').input_value() == '' and page.locator('#hexInput').input_value() == '' and page.locator('#encoded').input_value() == '')
    check('clear returns keyboard focus to content', page.locator('#content').evaluate('(el) => el === document.activeElement'))
    sample('message'); encode()
    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
    check('pagehide clears transient values', page.locator('#content').input_value() == '' and page.locator('#encoded').input_value() == '')
    for width in (390, 320):
        page.set_viewport_size({'width': width, 'height': 844})
        sample('telemetry'); encode()
        check(f'no horizontal overflow at {width}px', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    page.emulate_media(forced_colors='active', reduced_motion='reduce')
    page.get_by_role('button', name='Clear all', exact=True).focus()
    page.keyboard.press('Shift+Tab')
    check('keyboard focus remains visible in forced colors', page.evaluate("getComputedStyle(document.activeElement).outlineStyle !== 'none'"))
    check('no browser-side fetch, socket or storage calls', page.evaluate('window.__sideEffects') == [])
    check('no HTTP requests or JavaScript errors', network == [] and errors == [])
    # Broken local module: recompute the test document's CSP hash so this tests
    # the app's loading error branch, not a browser CSP violation.
    start = html.index('<script type="importmap">') + len('<script type="importmap">')
    end = html.index('</script>', start)
    old_map = html[start:end]
    imports = json.loads(old_map)
    imports['imports']['@nekon/sdk/application-event'] = 'data:text/javascript,export%20%7B%7D%3B'
    new_map = json.dumps(imports, separators=(',', ':'))
    hash64 = lambda value: base64.b64encode(hashlib.sha256(value.encode()).digest()).decode()
    broken_html = html.replace(old_map, new_map).replace(hash64(old_map), hash64(new_map))
    broken = context.new_page()
    broken.set_content(broken_html)
    broken.wait_for_function("document.querySelector('#loadState').textContent === 'Local SDK unavailable'")
    check('local module failure disables work without remote fallback', broken.get_by_role('button', name='Encode and inspect').is_disabled())
    broken.close()
    page.set_viewport_size({'width': 1440, 'height': 1120})
    page.emulate_media(forced_colors='none')
    sample('message'); encode()
    if args.screenshot:
        args.screenshot.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(args.screenshot), full_page=True)
    print(json.dumps({'browser': browser.version, 'passed': len(results), 'checks': results,
                      'networkRequests': len(network), 'mode': 'local in-memory HTML; no service integration'}, indent=2))
    context.close()
    browser.close()
