"""Exercise generated local docs with no network, storage or browser-policy changes.

In-memory HTML checks do not establish file navigation, hosting, cross-browser
or assistive-technology compatibility. No NEKON service is contacted.
"""
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
    parser.add_argument('--screenshot', type=Path)
    args = parser.parse_args()
    if version('playwright') != '1.57.0':
        raise SystemExit('Use the pinned scripts/browser-requirements.txt environment.')
    html = (ROOT / 'docs/portal/dist/index.html').read_text(encoding='utf-8')
    checks: list[str] = []
    network: list[str] = []
    errors: list[str] = []

    def check(label: str, value: bool) -> None:
        if not value:
            raise AssertionError(label)
        checks.append(label)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **(
            {'executable_path': str(args.chromium.resolve(strict=True))} if args.chromium else {}
        ))
        context = browser.new_context(offline=True, viewport={'width': 1440, 'height': 1050})
        context.route('**/*', lambda route: (network.append(route.request.url), route.abort()))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.evaluate('''() => {
              window.__docsSideEffects = [];
              window.fetch = () => { window.__docsSideEffects.push('fetch'); throw Error('blocked'); };
              window.WebSocket = class { constructor() { window.__docsSideEffects.push('socket'); throw Error('blocked'); } };
              window.EventSource = class { constructor() { window.__docsSideEffects.push('events'); throw Error('blocked'); } };
              Storage.prototype.setItem = () => { window.__docsSideEffects.push('storage'); throw Error('blocked'); };
              IDBFactory.prototype.open = () => { window.__docsSideEffects.push('idb'); throw Error('blocked'); };
              navigator.sendBeacon = () => { window.__docsSideEffects.push('beacon'); return false; };
            }''')
            page.set_content(html)
            page.locator('[data-nav="start"][aria-current="page"]').wait_for(state='visible')
            check('starts on one visible guide with an accurate maturity label',
                  page.locator('#start').is_visible() and page.get_by_text('UNPUBLISHED SOURCE PREVIEW', exact=True).is_visible())
            check('all generated and curated pages have a navigation entry',
                  page.locator('[data-page]').count() == 25 and page.locator('[data-nav]').count() == 25)
            check('search has an explicit accessible label', page.get_by_label('Search documentation').count() == 1)
            page.get_by_role('link', name='Run an application-event round trip').click()
            page.locator('#events').wait_for(state='visible')
            check('guide link selects the right page and focuses its heading',
                  page.locator('#events h1').evaluate('(el) => el === document.activeElement'))
            check('executable example includes real source and credentials context',
                  'createApplicationEventEncoder' in page.locator('#events pre').inner_text() and
                  'examples/application-event/example.mjs' in page.locator('#events').inner_text() and
                  'None. Synthetic IDs and content only.' in page.locator('#events').inner_text())
            search = page.get_by_label('Search documentation')
            search.fill('NekonTransport')
            check('local search finds API symbols across guide and generated reference pages',
                  page.locator('#searchResults a[href="#ref-nekon-client-runtime-transport"]').count() == 1)
            page.locator('#searchResults a[href="#ref-nekon-client-runtime-transport"]').click()
            page.locator('#ref-nekon-client-runtime-transport').wait_for(state='visible')
            check('reference reveals signatures resolved from emitted declarations',
                  'class NekonTransport' in page.locator('#ref-nekon-client-runtime-transport').inner_text())
            check('navigation exposes the current page to assistive technology',
                  page.locator('[aria-current="page"]').get_attribute('href') == '#ref-nekon-client-runtime-transport')
            check('opening a result clears the transient search without storing it in the URL',
                  search.input_value() == '' and 'NekonTransport' not in page.url)
            search.fill('ＮｅｋｏｎＴｒａｎｓｐｏｒｔ')
            check('search normalizes equivalent Unicode characters',
                  page.locator('#searchResults a[href="#ref-nekon-client-runtime-transport"]').count() == 1)
            search.fill('  BINDING   MISMATCH  ')
            check('search supports multiple case-insensitive terms', page.locator('#searchResults a').count() > 0)
            search.press('Escape')
            check('Escape clears search results and status', search.input_value() == '' and page.locator('#searchResults').is_hidden()
                  and page.locator('#searchStatus').inner_text() == '')
            search.fill('<img src="https://example.invalid/" onerror="window.__executed=1">')
            check('malicious-looking search input is never rendered as markup',
                  page.locator('#searchStatus').inner_text() == '0 pages found.' and page.locator('img').count() == 0
                  and page.evaluate('window.__executed !== 1'))
            search.fill('Your first application event')
            check('exact page-title matches rank ahead of incidental full-text matches',
                  page.locator('#searchResults a').first.get_attribute('href') == '#events')
            search.press('Enter')
            page.locator('#events').wait_for(state='visible')
            check('keyboard Enter opens the first search result and focuses content',
                  page.locator('#events h1').evaluate('(el) => el === document.activeElement'))
            page.locator('[data-nav="enrollment"]').click()
            page.locator('#enrollment').wait_for(state='visible')
            check('compile-only composition is not described as an executable onboarding flow',
                  page.locator('#enrollment').get_by_text('COMPILE-ONLY CONTRACT',exact=True).is_visible() and
                  'declare const vault' in page.locator('#enrollment pre').inner_text())
            page.locator('[data-nav="errors"]').click()
            page.locator('#errors').wait_for(state='visible')
            check('error reference documents the limitation and recovery guidance',
                  'not a complete error taxonomy' in page.locator('#errors').inner_text() and
                  'application_enrollment_binding_mismatch' in page.locator('#errors').inner_text())
            page.locator('[data-nav="tokens"]').click()
            page.locator('#tokens').wait_for(state='visible')
            check('tokens guide does not advertise an implemented component package',
                  'nonexistent React, Vue or web-component packages' in page.locator('#tokens').inner_text())
            page.evaluate("location.hash = '#not-a-real-page'")
            page.locator('#start').wait_for(state='visible')
            check('unknown fragments fall back safely without reflecting their text',
                  'not-a-real-page' not in page.locator('#start').inner_text())
            for width in [390, 320]:
                page.set_viewport_size({'width': width, 'height': 844})
                page.locator('[data-nav="ref-nekon-client-runtime-application-enrollment-storage"]').click()
                page.locator('#ref-nekon-client-runtime-application-enrollment-storage').wait_for(state='visible')
                check(f'long API names and code do not overflow the {width}px viewport',
                      page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            page.emulate_media(forced_colors='active', reduced_motion='reduce')
            search.focus()
            check('keyboard focus remains visible in forced colors',
                  search.evaluate('(el) => getComputedStyle(el).outlineStyle !== "none"'))
            page.locator('.skip').focus()
            page.keyboard.press('Enter')
            check('skip link reaches main content',page.locator('#content').evaluate('(el)=>el===document.activeElement'))
            search.fill('credential')
            page.evaluate("window.dispatchEvent(new Event('pagehide'))")
            check('pagehide clears transient search data',search.input_value() == '' and page.locator('#searchResults').is_hidden())
            check('no fetch/socket/storage/eventstream/beacon calls',page.evaluate('window.__docsSideEffects') == [])
            check('no network request or JavaScript error',network == [] and errors == [])
            nojs = browser.new_context(java_script_enabled=False,offline=True)
            nojs.route('**/*', lambda route: (network.append(route.request.url),route.abort()))
            try:
                static = nojs.new_page()
                static.set_content(html)
                check('without JavaScript all 25 pages remain readable',static.locator('[data-page]:visible').count() == 25)
                check('without JavaScript search stays disabled with an explicit fallback hint',
                      static.locator('#searchHelp').is_visible() and static.locator('#search').is_disabled())
            finally:
                nojs.close()
            page.set_viewport_size({'width':1440,'height':1050})
            page.emulate_media(forced_colors='none')
            page.locator('[data-nav="start"]').click()
            page.locator('#start').wait_for(state='visible')
            page.evaluate('window.scrollTo(0, 0); document.querySelector(".sidebar").scrollTop = 0')
            if args.screenshot:
                args.screenshot.parent.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(args.screenshot),full_page=True)
            check('all contexts remain network-free',network == [] and errors == [])
            print(json.dumps({'passed':len(checks),'browser':browser.version,'playwright':version('playwright'),
                              'networkRequests':len(network),'checks':checks,
                              'mode':'in-memory generated HTML; no hosting, file-navigation, or service evidence'},indent=2))
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
