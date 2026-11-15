#!/usr/bin/env python3
"""Final smoke test after the last edits: load, play, buy, live, fire."""
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
        page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
        page.goto("http://localhost:8901/", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)
        page.click("#play")
        t0 = time.time()
        while page.evaluate("!!document.pointerLockElement") and time.time() - t0 < 5:
            page.wait_for_timeout(300)
        page.click(".buy-item[data-item='smoke']")
        page.wait_for_timeout(300)
        print("bought smoke: money=",
              page.evaluate("window.__fps.state.player.money"),
              "smokes=", page.evaluate("window.__fps.state.player.grenades.smoke"))
        page.keyboard.press("KeyB")
        page.wait_for_timeout(800)
        page.evaluate("window.__fps.step(720)")
        page.wait_for_timeout(1000)
        st = page.evaluate(
            "({phase: window.__fps.state.phase, paused: window.__fps.state.paused,"
            " locked: !!document.pointerLockElement,"
            " overlayHidden: document.getElementById('overlay').hidden})"
        )
        print("after FF to live:", st)
        # If the buy phase expired while the menu was open, the game pauses
        # by design (auto-close, no gesture for a re-lock). Resume via the
        # overlay button, which carries the gesture the re-lock needs.
        if st["paused"]:
            page.click("#play")
            page.wait_for_timeout(1000)
            st2 = page.evaluate(
                "({phase: window.__fps.state.phase, paused: window.__fps.state.paused,"
                " locked: !!document.pointerLockElement})"
            )
            print("after Resume click:", st2)
        ammo0 = page.evaluate("window.__fps.state.player.mag")
        page.mouse.down()
        page.wait_for_timeout(800)
        page.mouse.up()
        page.wait_for_timeout(600)
        ammo1 = page.evaluate("window.__fps.state.player.mag")
        print(f"fired: ammo {ammo0}->{ammo1}")
        print("page/console errors:", len(errors))
        for e in errors[:5]:
            print("  ", e)
        browser.close()


if __name__ == "__main__":
    main()
