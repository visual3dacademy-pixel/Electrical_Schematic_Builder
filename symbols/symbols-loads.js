// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  Lib.register({
    id: "motor_load",
    category: "load",
    label: "Motor",
    width: 150,
    height: 120,
    isLoad: true,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: 0 },
    draw(parent) {
      D.line(-75, 0, -50, 0, {}, parent);
      D.line(50, 0, 75, 0, {}, parent);
      D.circle(0, 0, 50, { fill: "#ffffff" }, parent);

      // Stylized winding, evoking a fan/compressor motor's coil.
      D.path("M 0,-32 Q 24,-16 0,0 Q -24,16 0,32", {}, parent);
    }
  });

  Lib.register({
    id: "resistor_heater",
    category: "load",
    label: "Heating Element",
    width: 150,
    height: 70,
    isLoad: true,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -38 },
    draw(parent) {
      D.line(-75, 0, -50, 0, {}, parent);
      D.line(50, 0, 75, 0, {}, parent);
      D.polyline(
        [
          { x: -50, y: 0 },
          { x: -37.5, y: -20 },
          { x: -12.5, y: 20 },
          { x: 12.5, y: -20 },
          { x: 37.5, y: 20 },
          { x: 50, y: 0 }
        ],
        {},
        parent
      );
    }
  });

  Lib.register({
    id: "indicator_light",
    category: "load",
    label: "Indicator Light",
    width: 150,
    height: 100,
    isLoad: true,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -56 },
    draw(parent) {
      D.line(-75, 0, -40, 0, {}, parent);
      D.line(40, 0, 75, 0, {}, parent);
      D.circle(0, 0, 40, { fill: "#ffffff" }, parent);

      const r = 40 * Math.SQRT1_2 * 0.72;
      D.line(-r, -r, r, r, {}, parent);
      D.line(-r, r, r, -r, {}, parent);
    }
  });

  // A pure geometric tap/label point (e.g. "1", "T4") with no electrical
  // effect of its own — useful for labeling wire runs on the printed diagram.
  Lib.register({
    id: "terminal_marker",
    category: "marker",
    label: "Terminal Marker",
    width: 40,
    height: 60,
    terminals: [{ id: "t1", x: 0, y: 0 }],
    labelAnchor: { x: 0, y: -22 },
    draw(parent) {
      D.circle(0, 0, 8, { fill: "#111111" }, parent);
    }
  });
})();
