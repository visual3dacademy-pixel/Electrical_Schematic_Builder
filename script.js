// Version 0.5

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

  function render() {
    Drawing.drawDefs();
    Drawing.drawVersion();

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
    ensureLayer("paletteLayer", paletteSvg);

    relayout();
  }

  function init() {
    render();
    window.ESB.Palette.render();
    window.ESB.CanvasInteractions.init();
    window.ESB.WireTool.init();
    window.ESB.LabelEditor.init();
  }

  window.ESB.relayout = relayout;

  window.addEventListener("DOMContentLoaded", init);
})();
