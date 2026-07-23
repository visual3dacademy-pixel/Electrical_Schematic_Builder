// Version 0.5
// Ground and capacitor geometry normalized from the user's 2 mm-grid SVGs.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  // Earth ground — traced from Assets/SVG/Ground.svg (viewBox 53.25x32.13).
  // The source terminal center is (5.67,5.67). It is mapped to (-40,0),
  // an exact application-grid coordinate. The permanent IDU/ODU fixtures
  // rotate this symbol 90 degrees so the terminal is above the earth mark.
  Lib.register({
    id: "ground",
    category: "reference",
    label: "Ground",
    defaultLabel: "",
    width: 100,
    height: 70,
    isGround: true,
    terminals: [{ id: "t1", x: -40, y: 0 }],
    labelAnchor: null,
    draw(parent) {
      const g = D.group({ transform: "translate(-48.505,-8.505) scale(1.5)" }, parent);
      const sw = { width: 0.71 };
      D.polyline([
        { x: 52.89, y: 29.7 },
        { x: 47.5, y: 21.31 },
        { x: 23.2, y: 21.31 },
        { x: 28.29, y: 31.78 }
      ], sw, g);
      D.polyline([
        { x: 40.73, y: 30.68 },
        { x: 23.56, y: 5.67 },
        { x: 10.98, y: 5.67 },
        { x: 5.67, y: 5.67 }
      ], sw, g);
    }
  });

  // Capacitor — Version 0.5
  // Compact three-grid-high symbol. Terminal centers are exactly 60 design
  // pixels apart (three 20-pixel snap intervals). The arc and straight plate
  // are 24 pixels wide, approximately 50% of the previous rendered width.
  // Each lead ends at the visible terminal-circle edge (radius 5.5), so there
  // is no gap between the terminal circle and its vertical lead.
  Lib.register({
    id: "capacitor",
    category: "passive",
    label: "Capacitor",
    defaultLabel: "",
    width: 50,
    height: 72,
    terminals: [
      { id: "t1", x: 0, y: -30 },
      { id: "t2", x: 0, y: 30 }
    ],
    labelAnchor: { x: 28, y: 0 },
    draw(parent) {
      const sw = { width: 2.5 };
      const terminalRadius = 5.5;

      // Upper lead: terminal-circle edge to the center of the curved plate.
      D.line(0, -30 + terminalRadius, 0, -4, sw, parent);

      // Curved plate, reduced to 50% of the previous width.
      D.path("M -12 -8 Q 0 4 12 -8", sw, parent);

      // Straight plate, also reduced to 50% of the previous width.
      D.line(-12, 7, 12, 7, sw, parent);

      // Lower lead: straight plate to the terminal-circle edge.
      D.line(0, 7, 0, 30 - terminalRadius, sw, parent);
    }
  });

})();
