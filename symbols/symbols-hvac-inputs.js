// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

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

  const ROW_H = 60;
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

  // Thermoswitch — Assets/SVG/Thermoswitch.svg (viewBox 92.76x42.72), a
  // mechanical temperature-actuated contact (also sometimes called a
  // limit switch). Terminal circle centers there are (7.82,7.81) and
  // (84.94,7.81) — both the *same* y, unlike the connecting line the
  // source draws (a slightly diagonal 15.24,7.83 to 84.12,.42), which
  // stops about 14 units short of the right terminal's actual center.
  // Rather than reproduce that gap, the line here runs terminal-to-
  // terminal exactly, and the reference art's distinctive stepped
  // sensing-bulb stub is shifted down 3.70 (source units) so its
  // attachment point sits on that corrected line — same shape as
  // traced, just re-anchored. scale=150/77.12=1.9451. Defaults to
  // "NC Rise Open" (normally closed, opens as temperature rises), the
  // common default for this device; params.actuation records the
  // rise/fall behavior for the simulation engine.
  Lib.register({
    id: "thermoswitch",
    category: "contact",
    label: "Thermoswitch",
    designatorPrefix: "TS",
    width: 150,
    height: 160,
    isSwitchLike: true,
    variants: ["NO", "NC"],
    defaultVariant: "NC",
    defaultParams: { actuation: "rise" },
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -20 },
    draw(parent, instance) {
      const variant = (instance && instance.variant) || "NC";
      const sw = { width: 3 };

      if (variant === "NC") {
        D.line(-75, 0, 75, 0, sw, parent);
      } else {
        D.line(-75, 0, -20, 0, sw, parent);
        D.line(0, 0, 75, 0, sw, parent);
      }

      D.polyline(
        [
          { x: 6.42, y: 0 },
          { x: 6.42, y: 21.53 },
          { x: 27.95, y: 21.53 },
          { x: 27.95, y: 45.75 },
          { x: 6.42, y: 45.75 },
          { x: 6.42, y: 74.4 }
        ],
        sw,
        parent
      );
    }
  });
})();
