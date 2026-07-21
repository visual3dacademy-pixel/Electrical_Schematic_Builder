// Version 0.3
//
// Build Circuit / Check Circuit mode toggle. Build is everything that
// already existed (palette, placing/wiring components). Check swaps the
// palette out for a fixed Fieldpiece SC480 meter graphic and hands control
// to two draggable/rotatable meter lead instances — the rest of the built
// circuit stays visible but read-only (see canvas-interactions.js's and
// wire-tool.js's mode gating).

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const S = window.ESB.State;

  let mode = "build";

  function getMode() {
    return mode;
  }

  // Meter graphic is opaque reference art (like the leads — see
  // symbols/symbols-meter.js), not traced into path data. Scaled to the
  // palette strip's width (the more constraining dimension here) and
  // centered in the taller space that leaves.
  function renderMeterPanel() {
    const layer = document.getElementById("paletteLayer");
    D.clearGroup(layer);

    D.rect(0, 0, C.PALETTE_W, C.VIEW_H, { fill: "#f5f7fa", stroke: "none" }, layer);
    D.line(C.PALETTE_W, 0, C.PALETTE_W, C.VIEW_H, { stroke: "#c7cfd9", width: 2 }, layer);
    D.text(C.PALETTE_W / 2, 24, "Check Circuit", 16, 800, "#2a3340", {}, layer);

    const METER_NATIVE_W = 364.42;
    const METER_NATIVE_H = 1247.82;
    const width = C.PALETTE_W - 20;
    const height = width * (METER_NATIVE_H / METER_NATIVE_W);
    const x = (C.PALETTE_W - width) / 2;
    const y = Math.max(40, (C.VIEW_H - height) / 2);

    D.image(
      "SVG/Fieldpiece%20SC480.svg",
      x,
      y,
      width,
      height,
      { preserveAspectRatio: "xMidYMid meet", style: "pointer-events:none;" },
      layer
    );

    renderMeterReadout(layer, x, y, width / METER_NATIVE_W);
  }

  // Placeholder digital-style reading overlaid on the meter's LCD screen.
  // Screen position (SCREEN_NATIVE) was measured by sampling the rendered
  // SC480 art's actual pixel colors for the LCD's grey-green fill (~rgb
  // (116,125,117)) and finding its dense contiguous bounding box — the
  // source SVG has no labeled screen element to query, and the meter
  // graphic itself is opaque reference art, not path data (see
  // symbols/symbols-meter.js). Not wired to any real measurement yet (that's
  // the deferred voltage-simulation work) — this just proves out the
  // position and digital-LCD font styling against SVG/Fieldpiece_screen.png.
  const SCREEN_NATIVE = { x: 103, y: 808, w: 170, h: 113 };

  function renderMeterReadout(layer, meterX, meterY, scale) {
    const screenX = meterX + SCREEN_NATIVE.x * scale;
    const screenY = meterY + SCREEN_NATIVE.y * scale;
    const screenW = SCREEN_NATIVE.w * scale;
    const screenH = SCREEN_NATIVE.h * scale;
    const centerX = screenX + screenW / 2;
    const centerY = screenY + screenH * 0.52;

    const digitFont = "'Consolas','Lucida Console','Courier New',monospace";
    const inkColor = "#1c2b4a";

    D.text(
      centerX - screenW * 0.09,
      centerY,
      "0.0",
      screenH * 0.46,
      700,
      inkColor,
      {
        "text-anchor": "end",
        "font-family": digitFont,
        "font-style": "italic",
        "pointer-events": "none"
      },
      layer
    );

    D.text(
      centerX + screenW * 0.22,
      centerY,
      "V",
      screenH * 0.24,
      700,
      inkColor,
      {
        "text-anchor": "start",
        "font-family": digitFont,
        "font-style": "italic",
        "pointer-events": "none"
      },
      layer
    );
  }

  // The two probe leads are created once, the first time Check Circuit is
  // entered, then just persist (hidden, inert) across later mode switches
  // — same "auto-created once" pattern as the built-in circuit breakers.
  function ensureLeads() {
    const hasLeads = S.state.instances.some((instance) => instance.typeId === "meter_lead_black");
    if (hasLeads) {
      return;
    }

    const startX = C.PALETTE_W + 140;

    const black = S.createInstance("meter_lead_black", startX, 260, { label: "" });
    black.rotation = 0;

    const red = S.createInstance("meter_lead_red", startX + 90, 260, { label: "" });
    red.rotation = 0;
  }

  function applyMode() {
    const paletteSvg = document.getElementById("paletteSvg");

    if (mode === "check") {
      ensureLeads();
      renderMeterPanel();
    } else {
      window.ESB.Palette.render();
    }

    // Neither an instance nor a wire selected from the other mode should
    // stay "selected" (e.g. a lead's rotate-drag has no delete button, a
    // build-mode component's toolbar shouldn't linger into check mode).
    S.select(null);
    S.selectWire(null);

    window.ESB.CanvasInteractions.renderInstances();
    window.ESB.CanvasInteractions.renderSelection();

    if (paletteSvg) {
      paletteSvg.setAttribute("data-mode", mode);
    }
  }

  function setMode(nextMode) {
    if (nextMode !== "build" && nextMode !== "check") {
      return;
    }

    mode = nextMode;
    applyMode();

    const button = document.getElementById("modeToggleButton");
    if (button) {
      button.textContent = mode === "build" ? "Check Circuit" : "Build Circuit";
    }
  }

  function toggle() {
    setMode(mode === "build" ? "check" : "build");
  }

  function init() {
    const overlays = D.getElements().overlays;

    const button = document.createElement("button");
    button.id = "modeToggleButton";
    button.type = "button";
    button.className = "mode-toggle-btn";
    button.textContent = "Check Circuit";

    button.addEventListener("pointerdown", (event) => {
      // Otherwise this bubbles up to #stage's own pointerdown listener
      // (canvas-interactions.js), which would read it as "clicked blank
      // canvas" and clear the current selection right as the mode switch
      // is also doing exactly that itself.
      event.stopPropagation();
    });

    button.addEventListener("click", () => {
      toggle();
    });

    overlays.appendChild(button);

    applyMode();
  }

  window.ESB.Mode = { init, getMode, setMode, toggle };
})();
