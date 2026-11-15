#!/usr/bin/env python3
"""Diagnose the missing viewmodel: inspect the gun's scene-graph state."""
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
        page.evaluate("window.__fps.step(720)")  # to live
        page.wait_for_timeout(1500)
        info = page.evaluate(
            """(() => {
              const w = window.__fps.world;
              const vm = w.viewmodel;
              const v = new (Object.getPrototypeOf(w.camera.position).constructor)();
              const out = {
                vmVisible: vm.visible,
                vmPos: [vm.position.x, vm.position.y, vm.position.z].map(n => +n.toFixed(3)),
                vmChildren: vm.children.length,
                cameraChildren: w.camera.children.length,
                cameraInScene: w.scene.children.includes(w.camera),
                scoped: window.__fps.state.player.scoped,
                phase: window.__fps.state.phase,
              };
              vm.getWorldPosition(v);
              out.vmWorld = [v.x, v.y, v.z].map(n => +n.toFixed(2));
              const camPos = w.camera.position;
              out.camPos = [camPos.x, camPos.y, camPos.z].map(n => +n.toFixed(2));
              out.parts = vm.children.map(c => ({
                vis: c.visible,
                pos: [c.position.x, c.position.y, c.position.z].map(n => +n.toFixed(2)),
                scale: [c.scale.x, c.scale.y, c.scale.z].map(n => +n.toFixed(2)),
                mat: c.material.color ? '#' + c.material.color.getHexString() : '?',
                metal: c.material.metalness,
                frustumCulled: c.frustumCulled,
              }));
              out.renderCalls = w.renderer.info.render.calls;
              out.renderTris = w.renderer.info.render.triangles;
              return out;
            })()"""
        )
        import json
        print(json.dumps(info, indent=1))
        browser.close()


if __name__ == "__main__":
    main()
