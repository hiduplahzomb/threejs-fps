#!/usr/bin/env python3
"""Log raw pointerlockchange events + paused state around the menu close."""
import time

from playwright.sync_api import sync_playwright


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto("http://localhost:8901/", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)
        page.evaluate(
            """window.__lockLog = [];
            const t0 = performance.now();
            document.addEventListener('pointerlockchange', () => {
              window.__lockLog.push([Math.round(performance.now() - t0), !!document.pointerLockElement]);
            });"""
        )
        page.click("#play")
        t0 = time.time()
        while page.evaluate("!!document.pointerLockElement") and time.time() - t0 < 5:
            page.wait_for_timeout(200)
        page.click(".buy-item[data-item='smoke']")
        page.wait_for_timeout(200)
        page.evaluate("window.__lockLog.push(['B-pressed', Math.round(performance.now())])")
        page.keyboard.press("KeyB")
        for i in range(10):
            page.wait_for_timeout(200)
            s = page.evaluate(
                "({paused: window.__fps.state.paused, ple: !!document.pointerLockElement,"
                " inputLocked: window.__fps.input.locked})"
            )
            print(f"+{(i+1)*200}ms:", s)
        print("lock log (ms since page hook, locked?):", page.evaluate("window.__lockLog"))
        browser.close()


if __name__ == "__main__":
    main()
