// Version 0.8

(function () {
  "use strict";

  const Drawing = window.ESB.Drawing;
  const C = window.ESB.Config;

  function ensureLayer(id, parentEl) {
    let layer = document.getElementById(id);
    if (!layer) {
      layer = document.createElementNS(C.SVG_NS, "g");
      layer.id = id;
      parentEl.appendChild(layer);
    }
    return layer;
  }

  // Redraws the background + every section's rails at the circuit's
  // current total height, and resizes circuitSvg's viewBox to match.
  // Called on init and again whenever a section is added (transformer
  // placement) so the taller canvas and its rails stay in sync.
  function relayout() {
    const svg = Drawing.getElements().svg;
    const totalHeight = window.ESB.Sections.getTotalHeight();

    svg.setAttribute("viewBox", `0 0 ${C.VIEW_W} ${totalHeight}`);

    const staticLayer = document.getElementById("staticLayer");
    Drawing.clearGroup(staticLayer);
    Drawing.drawBackground(totalHeight, staticLayer);
    window.ESB.Sections.renderAll(staticLayer);
  }

  // A plain HTML label in #overlays (position:fixed relative to #stage,
  // z-index above the schematic) rather than an SVG element drawn into
  // circuitSvg — the previous approach lived in the SVG's own coordinate
  // space, which grows taller as sections are added and scrolls out of
  // view, plus it was added before the background layer and got painted
  // over immediately. This one is always visible, regardless of circuit
  // size, scroll position, or mode — a quick, unambiguous way to confirm
  // which build is actually loaded (helps rule out a stale browser cache).
  function renderVersionLabel() {
    const overlays = Drawing.getElements().overlays;
    if (!overlays || document.getElementById("versionLabel")) {
      return;
    }

    const label = document.createElement("div");
    label.id = "versionLabel";
    label.style.cssText =
      "position:absolute;right:10px;bottom:6px;z-index:30;" +
      "font:700 13px Arial, Helvetica, sans-serif;color:#9aa4b2;" +
      "pointer-events:none;user-select:none;";
    label.textContent = `v${C.VERSION || ""}`;
    overlays.appendChild(label);
  }

  function render() {
    Drawing.drawDefs();
    renderVersionLabel();

    const svg = Drawing.getElements().svg;
    const paletteSvg = document.getElementById("paletteSvg");

    // Created in this order so later layers paint on top of earlier ones:
    // background/rails, wires, placed instances (so terminals/bodies sit
    // visually above the wires touching them), selection UI, then any
    // active wire-draw preview (always topmost). The palette lives in its
    // own separate SVG entirely (see styles.css), so it stays fixed while
    // #scrollArea scrolls.
    ensureLayer("staticLayer", svg);
    ensureLayer("wireLayer", svg);
    ensureLayer("instancesLayer", svg);
    ensureLayer("selectionLayer", svg);
    ensureLayer("wirePreviewLayer", svg);
    ensureLayer("dragPreviewLayer", svg);
    ensureLayer("breakerControlLayer", svg);
    // Dedicated topmost layer for meter probes. Keeping probe artwork and
    // hit targets outside instancesLayer prevents later-added components
    // from painting over a lead or intercepting its pointer events.
    ensureLayer("meterLeadsLayer", svg);
    ensureLayer("paletteLayer", paletteSvg);

    relayout();
  }

  function init() {
    render();
    window.ESB.Palette.render();
    window.ESB.CanvasInteractions.init();
    window.ESB.WireTool.init();
    window.ESB.LabelEditor.init();
    window.ESB.BreakerControl.render();
    window.ESB.Mode.init();
    window.ESB.Menu.init();
    window.ESB.VoltageMeter.init();
  }

  window.ESB.relayout = relayout;

  window.addEventListener("DOMContentLoaded", init);
})();
