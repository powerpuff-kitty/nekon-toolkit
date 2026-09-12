"""Offline Chromium regression gate; no server, navigation, downloads or policy changes."""
from __future__ import annotations

import argparse
import json
import subprocess
from importlib.metadata import version
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PLAYWRIGHT_VERSION = "1.57.0"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", type=Path, help="Use an already installed Chromium executable")
    args = parser.parse_args()
    if version("playwright") != PLAYWRIGHT_VERSION:
        raise SystemExit(f"Install scripts/browser-requirements.txt; expected Playwright {PLAYWRIGHT_VERSION}")
    from playwright.sync_api import sync_playwright

    subprocess.run(["node", "packages/tokens/scripts/build.mjs"], cwd=ROOT, check=True, timeout=30)
    scoped = (ROOT / "packages/tokens/dist/scoped.css").read_text(encoding="utf-8")
    global_css = (ROOT / "packages/tokens/dist/tokens.css").read_text(encoding="utf-8")
    example = (ROOT / "examples/tokens/index.html").read_text(encoding="utf-8")
    link = '<link rel="stylesheet" href="../../packages/tokens/dist/scoped.css">'
    if example.count(link) != 1:
        raise AssertionError("Update this explicit offline stylesheet replacement after example changes")
    example = example.replace(link, "<style>" + scoped + "</style>")
    checks: list[str] = []
    requests: list[str] = []
    errors: list[str] = []

    with sync_playwright() as playwright:
        options: dict[str, Any] = {"headless": True}
        if args.chromium is not None:
            options["executable_path"] = str(args.chromium.resolve(strict=True))
        browser = playwright.chromium.launch(**options)
        context = browser.new_context(offline=True, viewport={"width": 1440, "height": 1000})
        context.route("**/*", lambda route: route.abort())
        page = context.new_page()
        page.on("request", lambda request: requests.append(request.url))
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.set_content('<button id="host">Host control</button>')
            def host_style() -> dict[str, str]:
                return page.locator("#host").evaluate("""el => {
                  const style = getComputedStyle(el);
                  return Object.fromEntries(['fontFamily', 'backgroundColor', 'color', 'outlineStyle', 'colorScheme']
                    .map(name => [name, style[name]]));
                }""")
            before = host_style()
            page.add_style_tag(content=scoped)
            assert host_style() == before, "Scoped tokens changed host control styles"
            assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--nk-color-text')") == ""
            checks.append("scoped stylesheet leaves root tokens and host controls untouched")

            page.set_content('<style>' + scoped + '''
              .probe { color: var(--nk-color-text); background: var(--nk-color-surface); }
              </style>
              <section data-nk-theme="dark" id="outer">
                <p class="probe" id="dark">Dark</p>
                <section data-nk-theme="light" id="inner">
                  <p class="probe" id="light">Light</p>
                  <section class="nk-theme-dark"><p class="probe" id="deep">Dark again</p></section>
                </section>
              </section>''')
            def color(selector: str) -> str:
                return page.locator(selector).evaluate("el => getComputedStyle(el).color")
            def background(selector: str) -> list[int]:
                return page.locator(selector).evaluate("""el => {
                  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
                  const ctx = canvas.getContext('2d');
                  ctx.fillStyle = getComputedStyle(el).backgroundColor; ctx.fillRect(0, 0, 1, 1);
                  return Array.from(ctx.getImageData(0, 0, 1, 1).data);
                }""")
            assert color("#dark") == "rgb(240, 244, 241)"
            assert background("#dark") == [19, 23, 22, 255]
            checks.append("dark semantic text and derived surface resolve in Chromium")
            assert color("#light") == "rgb(16, 20, 20)"
            assert background("#light") == [240, 240, 237, 255]
            checks.append("nested light scope resets both direct and derived tokens")
            assert color("#deep") == "rgb(240, 244, 241)"
            assert background("#deep") == [19, 23, 22, 255]
            checks.append("nested class-alias dark scope resets light inheritance")
            page.locator("#outer").evaluate("el => el.dataset.nkTheme = 'light'")
            assert color("#dark") == "rgb(16, 20, 20)"
            assert color("#deep") == "rgb(240, 244, 241)"
            checks.append("runtime theme switching preserves explicit descendant scopes")
            page.locator("#outer").evaluate("el => el.style.setProperty('--nk-seed-background', '#000000')")
            assert background("#dark") == [0, 1, 1, 255]
            assert background("#light") == [240, 240, 237, 255]
            checks.append("seed override on a theme boundary recomputes derived values without leaking")

            page.set_content('<style>' + global_css + '</style><p id="root" class="probe" style="color:var(--nk-color-text)">Root</p>')
            assert color("#root") == "rgb(16, 20, 20)"
            page.evaluate("document.documentElement.className = 'nk-theme-dark'")
            assert color("#root") == "rgb(240, 244, 241)"
            page.evaluate("document.documentElement.className = ''")
            checks.append("root defaults support an explicit dark override")

            for width in [320, 390, 1440]:
                page.set_viewport_size({"width": width, "height": 1000})
                page.set_content(example)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}px"
                columns = page.locator(".samples").evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').length")
                assert columns == (1 if width < 768 else 2)
                checks.append(f"actual example fits {width}px viewport and uses expected grid")
            page.keyboard.press("Tab")
            assert page.locator("#light-input").evaluate("el => el === document.activeElement")
            page.keyboard.press("Tab")
            assert page.locator("button").evaluate("el => el === document.activeElement")
            outline = page.locator("button").evaluate("el => ({style:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth})")
            assert outline == {"style": "solid", "width": "3px"}
            checks.append("example input and button have keyboard order and visible focus")
            page.emulate_media(forced_colors="active", reduced_motion="reduce")
            assert page.evaluate("matchMedia('(forced-colors: active)').matches && matchMedia('(prefers-reduced-motion: reduce)').matches")
            assert page.locator("button").evaluate("el => getComputedStyle(el).outlineStyle") != "none"
            checks.append("example retains focus outline in forced colors with reduced motion")
            page.set_viewport_size({"width": 320, "height": 1000})
            page.evaluate("document.documentElement.dir = 'rtl'")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            checks.append("example RTL smoke test fits 320px")
            assert requests == [], "Unexpected network requests; browser context was offline"
            assert errors == [], "Browser console errors"
            checks.append("all fixtures render without network requests or page errors")
            print(json.dumps({"passed": len(checks), "browser": browser.version,
                              "playwright": PLAYWRIGHT_VERSION, "mode": "offline in-memory DOM",
                              "checks": checks}, indent=2))
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
