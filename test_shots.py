#!/usr/bin/env python3
"""Capture the 4 submission screenshots for BLACKWATER.

01-cover: live gameplay, bots in frame, gun visible.
02-buy: the buy menu.
03-combat: aiming at an enemy bot, firing.
04-overview: the dam at night from the menu orbit camera.
Saves PNGs to /tmp/fps-shots/final/.
"""
import os

from playwright.sync_api import sync_playwright

OUT = "/tmp/fps-shots/final"
os.makedirs(OUT, exist_ok=True)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto("http://localhost:8901/", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2500)
        # Overview: hide the menu overlay, let the orbit camera frame the dam.
        page.evaluate("document.getElementById('overlay').style.display = 'none'")
        page.wait_for_timeout(2500)
        page.screenshot(path=f"{OUT}/04-overview.png")
        print("04-overview done")

        # Fresh match for the rest.
        page.goto("http://localhost:8901/", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)
        page.click("#play")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/02-buy.png")
        print("02-buy done")
        page.keyboard.press("KeyB")
        page.wait_for_timeout(800)
        page.evaluate("window.__fps.step(720)")  # buy phase -> live
        # Let the bots advance while the player waits at spawn (safe), THEN
        # move to the vantage — teleporting into mid first gets the player
        # killed during the fast-forward.
        page.evaluate("window.__fps.step(600)")  # 10s: bots push toward mid
        page.evaluate("window.__fps.teleport(-25, 12, 0); window.__fps.aimAt(20, 1.4, -10)")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/01-cover.png")
        print("01-cover done")

        # Combat: find a living enemy, get close, aim, fire a burst.
        fighters = page.evaluate("window.__fps.fighters()")
        me = page.evaluate("window.__fps.state.player.team")
        enemies = [f for f in fighters if f["team"] != me and f["alive"]]
        print(f"enemies alive: {len(enemies)}")
        if enemies:
            e = enemies[0]
            # 18 m out, and no long wait: at close range the bots' reaction
            # time is short, and a 1.2 s pause is enough for them to drop the
            # player before the shutter fires.
            page.evaluate(
                f"window.__fps.teleport({e['x'] - 18}, {e['z'] + 3}, 0);"
                f"window.__fps.aimAt({e['x']}, 1.3, {e['z']})"
            )
            page.wait_for_timeout(400)
            page.mouse.down()
            page.wait_for_timeout(250)
            page.screenshot(path=f"{OUT}/03-combat.png")
            page.mouse.up()
            print(f"03-combat done (enemy {e['name']} at {e['x']},{e['z']})")
        browser.close()


if __name__ == "__main__":
    main()
