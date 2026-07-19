// Version 0.1
//
// Static palette panel occupying the left Config.PALETTE_W strip of the
// stage. Each row is a real (small-scaled) render of the symbol via
// SymbolLibrary.drawInstance, so the palette icon can never drift out of
// sync with the actual glyph. canvas-interactions.js reads the
// data-palette-type attribute to start a placement drag.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const Lib = window.ESB.SymbolLibrary;

  const HEADER_H = 40;
  const ROW_H = 54;
  const ICON_CX = 55;
  const ICON_SCALE = 0.3;
  const LABEL_X = 96;

  function render() {
    const layer = document.getElementById("paletteLayer");
    D.clearGroup(layer);

    D.rect(0, 0, C.PALETTE_W, C.VIEW_H, { fill: "#f5f7fa", stroke: "none" }, layer);
    D.line(C.PALETTE_W, 0, C.PALETTE_W, C.VIEW_H, { stroke: "#c7cfd9", width: 2 }, layer);
    D.text(C.PALETTE_W / 2, 24, "Palette", 18, 800, "#2a3340", {}, layer);

    Lib.getAllTypes().forEach((type, index) => {
      const rowY = HEADER_H + index * ROW_H + ROW_H / 2;

      const row = D.group({ "data-palette-type": type.id, style: "cursor:grab;" }, layer);

      D.rect(
        4,
        rowY - ROW_H / 2 + 3,
        C.PALETTE_W - 8,
        ROW_H - 6,
        { fill: "#ffffff", stroke: "#e2e6ec", "stroke-width": 1, rx: 8 },
        row
      );

      const iconGroup = D.group(
        { transform: `translate(${ICON_CX},${rowY}) scale(${ICON_SCALE})` },
        row
      );

      Lib.drawInstance(iconGroup, type, { variant: type.defaultVariant, rotation: 0 });

      D.text(
        LABEL_X,
        rowY,
        type.label,
        14,
        700,
        "#2a3340",
        { "text-anchor": "start" },
        row
      );
    });
  }

  window.ESB.Palette = { render };
})();
