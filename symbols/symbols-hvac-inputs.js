// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;
  const C = window.ESB.Config;

  // Thermostat sub-base: one block, six wireable terminals (one per wire
  // color), not six separate palette pieces. Each row is a source point,
  // not a switch — whether it's energized is driven externally by the
  // Start Cooling / Start Heating controls, not by conduction logic.
  // Row identity (letter + color) is fixed, so it's drawn directly here
  // rather than through the generic (single, editable) label system.
  const THERMOSTAT_ROWS = [
    { id: "r", letter: "R", color: "#e8352b", textColor: "#ffffff" },
    { id: "g", letter: "G", color: "#39b54a", textColor: "#ffffff" },
    { id: "y", letter: "Y", color: "#f5d811", textColor: "#1a2230" },
    { id: "w1", letter: "W1", color: "#f2f2f2", textColor: "#1a2230" },
    { id: "ob", letter: "O/B", color: "#f0902a", textColor: "#1a2230" },
    { id: "c", letter: "C", color: "#1a1a1a", textColor: "#ffffff" }
  ];

  // Every other line of the low-voltage section's own 30-row snap grid
  // (see Sections.getLowVoltageRowSpacing) — close to the old fixed 60,
  // but an exact multiple of the grid so each of the six rows below lands
  // squarely on one of its lines instead of drifting between them. One
  // grid interval alone (~28.7) would be too tight for the existing
  // 50-tall color rects to fit without overlapping.
  const ROW_H = window.ESB.Sections.getLowVoltageRowSpacing() * 2;
  const BLOCK_TOP = -((THERMOSTAT_ROWS.length - 1) * ROW_H) / 2;

  Lib.register({
    id: "thermostat_block",
    category: "source",
    label: "TSTAT Terminals",
    defaultLabel: "",
    width: 230,
    height: THERMOSTAT_ROWS.length * ROW_H,
    isSource: true,
    // Two terminals per row (left and right), so a row can be wired
    // through from either side — e.g. a jumper continuing on to another
    // device without doubling back.
    terminals: THERMOSTAT_ROWS.reduce((all, row, index) => {
      const rowY = BLOCK_TOP + index * ROW_H;
      return all.concat([
        { id: `${row.id}_l`, x: -95, y: rowY },
        { id: `${row.id}_r`, x: 95, y: rowY }
      ]);
    }, []),
    draw(parent) {
      THERMOSTAT_ROWS.forEach((row, index) => {
        const rowY = BLOCK_TOP + index * ROW_H;

        D.line(-95, rowY, -45, rowY, {}, parent);
        D.line(45, rowY, 95, rowY, {}, parent);
        D.rect(
          -45,
          rowY - 25,
          90,
          50,
          { rx: 6, fill: row.color, stroke: "#111111", "stroke-width": 2 },
          parent
        );
        D.text(0, rowY, row.letter, 16, 700, row.textColor, {}, parent);
      });
    }
  });

})();
