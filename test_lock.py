#!/usr/bin/env python3
"""Trace the lock/pause state every 200ms around the buy-menu close."""
import time

from playwright.sync_api import sync_playwright


def sample(page):
    return page.evaluate(
        "({phase: window.__fps.state.phase, paused: window.__fps.state.paused,"
        " buyOpen: window.__fps.state._buyShown !== undefined && !document.getElementById('buy-menu').hidden,"
        " ple: !!document.pointerLockElement,"
        " pleIsCanvas: document.pointerLockElement === window.__fps.world.renderer.domElement,"
        " inputLocked: window.__fps.input.locked,"
        " overlayHidden: document.getElementById('overlay').hidden})"
    )


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto("http://localhost:8901/", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)
        page.click("#play")
        t0 = time.time()
        while page.evaluate("!!document.pointerLockElement") and time.time() - t0 < 5:
            page.wait_for_timeout(200)
        print("menu open, lock released:", sample(page))
        page.click(".buy-item[data-item='smoke']")
        page.wait_for_timeout(200)
        print("after buy click:", sample(page))
        page.keyboard.press("KeyB")
        for i in range(15):
            page.wait_for_timeout(200)
            print(f"+{(i+1)*200}ms:", sample(page))
        browser.close()


if __name__ == "__main__":
    main()
