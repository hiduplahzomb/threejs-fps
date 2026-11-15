// input.js — keyboard, mouse and pointer lock, reduced to intents the
// simulation reads each tick. Keys held are a live set; single presses
// (reload, jump, buy keys) go into a queue the sim drains once per tick, so
// no press is lost between frames. Mouse deltas accumulate while locked and
// are consumed by the player controller.

export function createInput(canvas, onLockChange) {
  const input = {
    keys: new Set(),
    pressed: [], // codes pressed since the last drain
    lookDX: 0,
    lookDY: 0,
    fireHeld: false,
    adsHeld: false,
    locked: false,
    // Single-press actions the UI layer also reads (buy menu keys, Tab).
    uiPressed: [],
  };

  const GAME_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'KeyC',
    'ShiftLeft', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
    'KeyB', 'KeyE', 'KeyG', 'Tab', 'KeyM', 'Escape',
  ]);

  function onKeyDown(e) {
    if (e.code === 'Tab') e.preventDefault();
    if (!GAME_KEYS.has(e.code)) return;
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.push(e.code);
    input.uiPressed.push(e.code);
  }

  function onKeyUp(e) {
    input.keys.delete(e.code);
  }

  function onMouseMove(e) {
    if (!input.locked) return;
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  }

  function onMouseDown(e) {
    if (!input.locked) return;
    if (e.button === 0) input.fireHeld = true;
    if (e.button === 2) input.adsHeld = true;
  }

  function onMouseUp(e) {
    if (e.button === 0) input.fireHeld = false;
    if (e.button === 2) input.adsHeld = false;
  }

  function onLock() {
    input.locked = document.pointerLockElement === canvas;
    input.fireHeld = false;
    input.adsHeld = false;
    if (onLockChange) onLockChange(input.locked);
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContextMenu);

  input.requestLock = () => {
    // Browsers refuse a re-lock for ~1.2 s after Esc; the click handler
    // retries, so a rejection here is never fatal.
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => canvas.requestPointerLock());
  };
  input.exitLock = () => document.exitPointerLock();
  input.drainPressed = () => {
    const out = input.pressed;
    input.pressed = [];
    return out;
  };
  input.drainUiPressed = () => {
    const out = input.uiPressed;
    input.uiPressed = [];
    return out;
  };
  input.consumeLook = () => {
    const dx = input.lookDX;
    const dy = input.lookDY;
    input.lookDX = 0;
    input.lookDY = 0;
    return { dx, dy };
  };
  input.dispose = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('pointerlockchange', onLock);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
  return input;
}

// Movement intent from the held keys: forward/strafe in -1..1.
export function moveAxes(input) {
  let f = 0;
  let s = 0;
  if (input.keys.has('KeyW')) f += 1;
  if (input.keys.has('KeyS')) f -= 1;
  if (input.keys.has('KeyD')) s += 1;
  if (input.keys.has('KeyA')) s -= 1;
  return { f, s };
}
