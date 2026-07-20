// Version 0.3
//
// Static palette panel occupying the left Config.PALETTE_W strip of the
// stage. Text-only rows (no glyph preview) — canvas-interactions.js reads
// the data-palette-type attribute to start a placement drag.
//
// "SPST Relay"/"SPDT Relay" are placement recipes rather than real
// SymbolTypes (see RELAY_PRESETS in canvas-interactions.js) — they're
// listed here first, since that's the piece the learner is really
// picking up.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const Lib = window.ESB.SymbolLibrary;

  const HEADER_H = 40;
  const ROW_H = 46;

  const SPECIAL_ENTRIES = [
    { paletteType: "relay_spst", label: "SPST Relay" },
    { paletteType: "relay_spdt", label: "SPDT Relay" }
  ];

  // Only one TSTAT Terminals block is ever allowed on the canvas (it's the
  // single bridge onto the 24V rail) — once one exists, its palette row is
  // greyed out and stops accepting drags rather than letting a second one
  // compete for the same rail.
  function isSingleUseAndPlaced(typeId) {
    if (typeId !== "thermostat_block") {
      return false;
    }

    return window.ESB.State.state.instances.some((instance) => instance.typeId === "thermostat_block");
  }

  function buildRows() {
    const specialRows = SPECIAL_ENTRIES.map((entry) => ({
      paletteType: entry.paletteType,
      label: entry.label
    }));

    const typeRows = Lib.getAllTypes()
      .filter((type) => !type.hiddenFromPalette)
      .map((type) => ({
        paletteType: type.id,
        label: type.label
      }));

    return specialRows.concat(typeRows).map((row) => ({
      ...row,
      disabled: isSingleUseAndPlaced(row.paletteType)
    }));
  }

  function render() {
    const layer = document.getElementById("paletteLayer");
    D.clearGroup(layer);

    D.rect(0, 0, C.PALETTE_W, C.VIEW_H, { fill: "#f5f7fa", stroke: "none" }, layer);
    D.line(C.PALETTE_W, 0, C.PALETTE_W, C.VIEW_H, { stroke: "#c7cfd9", width: 2 }, layer);
    D.text(C.PALETTE_W / 2, 24, "Palette", 18, 800, "#2a3340", {}, layer);

    buildRows().forEach((row, index) => {
      const rowY = HEADER_H + index * ROW_H + ROW_H / 2;

      // Disabled rows skip data-palette-type entirely — canvas-
      // interactions.js's drag-start check only recognizes that
      // attribute, so a disabled row simply can't be picked up.
      const rowGroup = D.group(
        row.disabled
          ? { style: "cursor:not-allowed;" }
          : { "data-palette-type": row.paletteType, style: "cursor:grab;" },
        layer
      );

      D.rect(
        4,
        rowY - ROW_H / 2 + 3,
        C.PALETTE_W - 8,
        ROW_H - 6,
        {
          fill: row.disabled ? "#eceef1" : "#ffffff",
          stroke: "#e2e6ec",
          "stroke-width": 1,
          rx: 8
        },
        rowGroup
      );

      D.text(
        C.PALETTE_W / 2,
        rowY,
        row.label,
        14,
        700,
        row.disabled ? "#a7adb8" : "#2a3340",
        {},
        rowGroup
      );
    });
  }

  window.ESB.Palette = { render };
})();
