// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  Lib.register({
    id: "motor_load",
    category: "load",
    label: "Blower Motor",
    hiddenFromPalette: true,
    designatorPrefix: "M",
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
    designatorPrefix: "HTR",
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

  // 2-speed PSC blower motor — Assets/SVG/Blower Motor.svg (viewBox
  // 278.61x192.86). Run (R) and Start (S) windings converge at a common
  // junction, with a Low-speed tap partway along the Run winding and the
  // High-speed/Common lead exiting the junction itself. Terminal circle
  // centers there: R(6.52,18.75) S(7.29,174.68) LOW(272.10,43.10)
  // HIGH(272.10,96.03); the group is centered on the motor body circle
  // (125.57,96.43) at scale 1 (the source is already close to this
  // library's usual component size, so no normalization needed). R/S/
  // LOW/HIGH/C are fixed terminal identities traced from the source
  // text positions, so they're baked into draw() rather than the
  // generic (single, editable) designator label.
  Lib.register({
    id: "blower_2speed",
    category: "load",
    label: "2 Speed Blower",
    designatorPrefix: "BM",
    width: 300,
    height: 210,
    isLoad: true,
    terminals: [
      { id: "r", x: -119.05, y: -77.68 },
      { id: "s", x: -118.28, y: 78.25 },
      { id: "low", x: 146.53, y: -53.33 },
      { id: "high", x: 146.53, y: -0.4 }
    ],
    labelAnchor: { x: 0, y: -110 },
    draw(parent) {
      const g = D.group({ transform: "translate(-125.57,-96.43)" }, parent);
      const sw = { width: 3 };

      D.circle(125.57, 96.43, 96.07, { fill: "#ffffff", "stroke-width": 3 }, g);

      D.path("M95.47,148.97c-8.71-2.92-15.5-2.53-17.52.99-2.02,3.52,1.08,9.57,8,15.62", sw, g);
      D.path("M104.98,132.36c-8.71-2.92-15.5-2.53-17.52.99s1.08,9.57,8,15.62", sw, g);
      D.path("M114.49,115.78c-8.71-2.92-15.5-2.53-17.52.99s1.08,9.57,8,15.62", sw, g);
      D.polyline([{ x: 114.49, y: 115.79 }, { x: 125.81, y: 96.03 }, { x: 114.2, y: 76.44 }], sw, g);
      D.line(221.64, 96.03, 125.81, 96.03, sw, g);
      D.path("M85.96,165.55c-6.8-2.28-12.54-2.57-15.65-.81s-3.3,5.41-.49,9.94", sw, g);
      // HIGH/R/LOW/S leads below are extended to the exact terminal
      // centers R(6.52,18.75) S(7.29,174.68) LOW(272.10,43.10)
      // HIGH(272.10,96.03) — the source art's lines stop at the terminal
      // circle's edge, leaving a radius-sized gap to the auto-rendered dot.
      D.line(221.64, 96.03, 272.1, 96.03, sw, g);
      D.line(69.04, 18.76, 6.52, 18.75, sw, g);
      D.path("M85.96,26.5c-6.92,6.04-10.02,12.09-8,15.62,2.02,3.52,8.81,3.9,17.52.99", sw, g);
      D.path("M95.46,43.09c-6.92,6.04-10.02,12.09-8,15.62,2.02,3.52,8.81,3.9,17.52.99", sw, g);
      D.path("M104.97,59.67c-6.92,6.04-10.02,12.09-8,15.62,2.02,3.52,8.81,3.9,17.52.99", sw, g);
      D.path("M69.05,18.76c-2.09,4.15-1.45,7.35,1.76,8.82s8.72,1.09,15.15-1.06", sw, g);
      D.line(272.1, 43.1, 95.45, 43.11, sw, g);
      D.line(69.82, 174.68, 7.29, 174.68, sw, g);

      // Text drawn directly on `parent` (not inside `g`) — these
      // positions are already final local coordinates, not source-space
      // ones, so they must skip the group's translate.
      D.text(117, -8, "HIGH", 13, 700, "#1a2230", {}, parent);
      D.text(110, -59, "LOW", 13, 700, "#1a2230", {}, parent);
      D.text(82, -8, "C", 13, 700, "#1a2230", {}, parent);
      D.text(-32, -76, "R", 13, 700, "#1a2230", {}, parent);
      D.text(-33, 84, "S", 13, 700, "#1a2230", {}, parent);
    }
  });

  Lib.register({
    id: "indicator_light",
    category: "load",
    label: "Indicator Light",
    designatorPrefix: "PL",
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

})();
