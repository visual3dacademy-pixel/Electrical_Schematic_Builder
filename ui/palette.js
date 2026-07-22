// Version 0.5
//
// Static palette panel occupying the left Config.PALETTE_W strip of the
// stage. Text-only rows (no glyph preview) — canvas-interactions.js reads
// the data-palette-type attribute to start a placement drag. Rows are
// sorted alphabetically by label (case-insensitive), "SPST Relay"/
// "SPDT Relay" included — those two are placement recipes rather than
// real SymbolTypes (see RELAY_PRESETS in canvas-interactions.js), but
// they sort into the list the same as everything else.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const Lib = window.ESB.SymbolLibrary;

  const MENU_CLEARANCE_H = 72;
  const HEADER_H = 40;
  const ROW_H = 46;

  const SPECIAL_ENTRIES = [
    { paletteType: "thermoswitch_picker", label: "Thermoswitch" },
    { paletteType: "relay_spst", label: "SPST Relay" },
    { paletteType: "relay_spdt", label: "SPDT Relay" }
  ];

  // Only one TSTAT Terminals block is ever allowed on the canvas (it's the
  // single bridge onto the 24V rail) — once one exists, its palette row is
  // greyed out and stops accepting drags rather than letting a second one
  // compete for the same rail. Same idea for the transformer: only one
  // ever bridges the main ladder to the (single, shared) low-voltage
  // section, so a second one has nothing valid left to bridge to.
  const SINGLE_USE_TYPE_IDS = ["thermostat_block", "transformer"];

  // Both of these rely on bridging recipes (canvas-interactions.js) that
  // are skipped in split mode, since Sections are global rather than
  // per-panel — dropping either one on a split panel would otherwise
  // create a disconnected instance instead of applying its real rule.
  // Greyed out for the whole time split mode is active (not just once one
  // exists) so that first drop is blocked rather than silently broken.
  // Place them in Build/IDU/ODU mode instead, then switch to Split.
  const SPLIT_DISABLED_TYPE_IDS = ["thermostat_block", "transformer"];

  function isSingleUseAndPlaced(typeId) {
    if (!SINGLE_USE_TYPE_IDS.includes(typeId)) {
      return false;
    }

    return window.ESB.State.state.instances.some((instance) => instance.typeId === typeId);
  }

  function isDisabledInSplitMode(typeId) {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : null;
    return mode === "split" && SPLIT_DISABLED_TYPE_IDS.includes(typeId);
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

    return specialRows
      .concat(typeRows)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((row) => ({
        ...row,
        disabled: isSingleUseAndPlaced(row.paletteType) || isDisabledInSplitMode(row.paletteType)
      }));
  }

  function render() {
    const layer = document.getElementById("paletteLayer");
    D.clearGroup(layer);

    D.rect(0, 0, C.PALETTE_W, C.VIEW_H, { fill: "#f5f7fa", stroke: "none" }, layer);
    D.line(C.PALETTE_W, 0, C.PALETTE_W, C.VIEW_H, { stroke: "#c7cfd9", width: 2 }, layer);
    D.text(C.PALETTE_W / 2, MENU_CLEARANCE_H + 24, "Palette", 18, 800, "#2a3340", {}, layer);

    buildRows().forEach((row, index) => {
      const rowY = MENU_CLEARANCE_H + HEADER_H + index * ROW_H + ROW_H / 2;

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
