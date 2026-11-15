#!/usr/bin/env python3
"""Decisive viewmodel test: paint the gun emissive red and screenshot."""
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
        page.click("#play")
        page.wait_for_timeout(1200)
        page.evaluate("window.__fps.step(720)")
        page.wait_for_timeout(1200)
        calls_before = page.evaluate("window.__fps.world.renderer.info.render.calls")
        page.evaluate("window.__fps.world.viewmodel.visible = false")
        page.wait_for_timeout(1200)
        calls_hidden = page.evaluate("window.__fps.world.renderer.info.render.calls")
        page.evaluate(
            """(() => {
              const vm = window.__fps.world.viewmodel;
              vm.visible = true;
              for (const part of vm.children) {
                part.material = part.material.clone();
                part.material.emissive.setHex(0xff0000);
                part.material.emissiveIntensity = 3;
              }
            })()"""
        )
        page.wait_for_timeout(1500)
        calls_red = page.evaluate("window.__fps.world.renderer.info.render.calls")
        print(f"render calls: visible={calls_before} hidden={calls_hidden} red={calls_red}")
        page.screenshot(path="/tmp/fps-shots/05-redgun.png")
        browser.close()


if __name__ == "__main__":
    main()
