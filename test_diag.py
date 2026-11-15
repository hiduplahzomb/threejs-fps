#!/usr/bin/env python3
"""Diagnose the buy->live transition: poll phase/phaseTime/paused each second."""
import time

from playwright.sync_api import sync_playwright

errors = []


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto("http://localhost:8901/", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)
        page.click("#play")
        for i in range(20):
            page.wait_for_timeout(1000)
            st = page.evaluate(
                "({phase: window.__fps.state.phase,"
                " phaseTime: +window.__fps.state.phaseTime.toFixed(2),"
                " paused: window.__fps.state.paused,"
                " time: +window.__fps.state.time.toFixed(1),"
                " locked: !!document.pointerLockElement,"
                " buyOpen: window.__fps.hud ? undefined : undefined})"
            )
            print(f"t+{i+1}s {st} errors={len(errors)}")
        print("first errors:", errors[:3])
        browser.close()


if __name__ == "__main__":
    main()
