#!/usr/bin/env python3
"""Full playtest of BLACKWATER in headed Chromium under Xvfb.

SwiftShader on this VM renders ~2 fps, so the sim is fast-forwarded with the
__fps.step() test hook; real input (clicks, keys, mouse) is still used for
the interactions that need it. Saves screenshots to /tmp/fps-shots/.
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

OUT = "/tmp/fps-shots"
os.makedirs(OUT, exist_ok=True)

errors = []
consoles = []


def st(page):
    return page.evaluate(
        "({phase: window.__fps.state.phase, round: window.__fps.state.round,"
        " phaseTime: +window.__fps.state.phaseTime.toFixed(1),"
        " score: window.__fps.state.score, kills: window.__fps.state.kills.length,"
        " alive: window.__fps.state.fighters.filter(f=>f.alive).length,"
        " playerAlive: window.__fps.state.player.alive,"
        " playerHp: window.__fps.state.player.hp,"
        " money: window.__fps.state.player.money,"
        " bomb: window.__fps.state.bomb.state,"
        " team: window.__fps.state.player.team})"
    )


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.on("console", lambda m: consoles.append(f"{m.type}: {m.text}") if m.type == "error" else None)

        page.goto("http://localhost:8901/", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2500)
        webgl2 = page.evaluate("window.__fps.world.renderer.capabilities.isWebGL2")
        print(f"webgl2={webgl2} phase={page.evaluate('window.__fps.state.phase')}")
        page.screenshot(path=f"{OUT}/00-menu.png")

        # Start the match; buy menu auto-opens on round 1. Wait for the
        # pointer lock to drop (the menu needs a free cursor) before clicking.
        page.click("#play")
        page.wait_for_timeout(1500)
        t0 = time.time()
        while page.evaluate("!!document.pointerLockElement") and time.time() - t0 < 5:
            page.wait_for_timeout(300)
        print(f"after play: locked={page.evaluate('!!document.pointerLockElement')} "
              f"buyOpen={page.evaluate('!document.getElementById(\"buy-menu\").hidden')}")
        page.screenshot(path=f"{OUT}/01-buy.png")
        page.click(".buy-item[data-item='frag']")
        page.wait_for_timeout(300)
        print(f"after buying frag: money={page.evaluate('window.__fps.state.player.money')} "
              f"frags={page.evaluate('window.__fps.state.player.grenades.frag')}")
        page.keyboard.press("KeyB")
        page.wait_for_timeout(500)
        print(f"after closing menu: locked={page.evaluate('!!document.pointerLockElement')}")

        # Fast-forward the buy phase (12s = 720 ticks).
        page.evaluate("window.__fps.step(720)")
        page.wait_for_timeout(1200)
        print(f"after buy FF: {json.dumps(st(page))}")

        # Real input: move, look, fire.
        page.keyboard.down("KeyW")
        page.wait_for_timeout(1500)
        page.mouse.move(760, 340)
        page.keyboard.up("KeyW")
        page.wait_for_timeout(800)
        pos = page.evaluate("({x: +window.__fps.state.player.x.toFixed(1), z: +window.__fps.state.player.z.toFixed(1)})")
        print(f"player after W: {pos}")
        ammo0 = page.evaluate("window.__fps.state.player.mag")
        page.mouse.down()
        page.wait_for_timeout(900)
        page.mouse.up()
        page.wait_for_timeout(800)
        ammo1 = page.evaluate("window.__fps.state.player.mag")
        print(f"fired: ammo {ammo0}->{ammo1}")
        page.screenshot(path=f"{OUT}/02-gameplay.png")

        # Plant the charge: teleport to site A, hold E.
        site_a = page.evaluate("window.__fps.state.bomb.sites || null")
        print(f"bomb sites in state: {site_a}")
        page.evaluate("window.__fps.teleport(-30, -20, 0)")
        page.wait_for_timeout(600)
        page.keyboard.down("KeyE")
        page.evaluate("window.__fps.step(300)")  # 5s > 3.5s plant time
        page.keyboard.up("KeyE")
        page.wait_for_timeout(800)
        print(f"after plant attempt: bomb={page.evaluate('window.__fps.state.bomb.state')} "
              f"site={page.evaluate('window.__fps.state.bomb.site')} "
              f"fuse={page.evaluate('+window.__fps.state.bomb.fuse.toFixed(1)')}")

        # Let the round play out (fuse 40s + end 5s), then check the outcome.
        page.evaluate("window.__fps.step(3000)")
        page.wait_for_timeout(1200)
        print(f"after round 1 plays out: {json.dumps(st(page))}")
        page.screenshot(path=f"{OUT}/03-combat.png")

        # Play the rest of the match in chunks; log each round.
        t0 = time.time()
        last_round = st(page)["round"]
        while time.time() - t0 < 240:
            cur = st(page)
            if cur["phase"] == "matchEnd":
                print(f"MATCH END: {json.dumps(cur)}")
                break
            page.evaluate("window.__fps.step(6000)")
            page.wait_for_timeout(600)
            cur = st(page)
            if cur["round"] != last_round or cur["phase"] == "matchEnd":
                print(f"round {last_round} done -> {json.dumps(cur)}")
                last_round = cur["round"]
        else:
            print(f"match not finished in 240s: {json.dumps(st(page))}")

        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/04-late.png")

        print(f"\npage errors: {len(errors)}")
        for e in errors[:10]:
            print("  ", e)
        print(f"console errors: {len(consoles)}")
        for c in consoles[:10]:
            print("  ", c)
        browser.close()


if __name__ == "__main__":
    main()
