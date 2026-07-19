// Version 0.3

(function () {
  "use strict";

  const Drawing = window.ESB.Drawing;

  function ensureLayer(id) {
    let layer = document.getElementById(id);
    if (!layer) {
      layer = Drawing.group({ id });
    }
    return layer;
  }

  function render() {
    Drawing.drawDefs();
    Drawing.drawBackground();
    Drawing.drawRails();
    Drawing.drawVersion();

    // Created in this order so later layers paint on top of earlier ones:
    // wires, then placed instances (so terminals/bodies sit visually above
    // the wires touching them), selection UI, the fixed palette panel,
    // then any active drag/wire-draw preview (always topmost).
    ensureLayer("wireLayer");
    ensureLayer("instancesLayer");
    ensureLayer("selectionLayer");
    ensureLayer("paletteLayer");
    ensureLayer("wirePreviewLayer");
    ensureLayer("dragPreviewLayer");
  }

  function init() {
    render();
    window.ESB.Palette.render();
    window.ESB.CanvasInteractions.init();
    window.ESB.WireTool.init();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
