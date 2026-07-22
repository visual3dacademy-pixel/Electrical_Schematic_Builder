// Version 0.7

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

  // Heating element — redrawn from the user's Heater.svg. The source
  // terminal centers are 86.74 units apart and are normalized to a
  // 160-design-pixel span so both open circles land exactly on the
  // builder's 20-pixel terminal grid.
  Lib.register({
    id: "resistor_heater",
    category: "load",
    label: "Heating Element",
    designatorPrefix: "HTR",
    width: 180,
    height: 80,
    isLoad: true,
    terminals: [
      { id: "t1", x: -80, y: 0 },
      { id: "t2", x: 80, y: 0 }
    ],
    labelAnchor: { x: 0, y: -34 },
    draw(parent) {
      const scale = 160 / 86.74;
      const sourceCenterX = (5.67 + 92.41) / 2;
      const sourceCenterY = 12.55;
      const g = D.group({
        transform: `translate(${-sourceCenterX * scale},${-sourceCenterY * scale}) scale(${scale})`
      }, parent);

      D.polyline([
        { x: 5.67, y: 12.55 },
        { x: 10.98, y: 12.55 },
        { x: 15.49, y: 12.55 },
        { x: 21.59, y: 0.35 },
        { x: 27.69, y: 24.75 },
        { x: 33.79, y: 0.35 },
        { x: 39.89, y: 24.75 },
        { x: 45.99, y: 0.35 },
        { x: 52.09, y: 24.75 },
        { x: 58.19, y: 0.35 },
        { x: 64.29, y: 24.75 },
        { x: 70.39, y: 0.35 },
        { x: 76.49, y: 24.75 },
        { x: 82.59, y: 12.55 },
        { x: 87.1, y: 12.55 },
        { x: 92.41, y: 12.55 }
      ], { width: 0.71 }, g);
    }
  });

  // Blower motor — proportionally normalized from the supplied Blower.svg.
  // The source symbol was authored on the user's 2 mm reference grid. The
  // complete motor geometry is enlarged 4/3 so the R and S terminal centers
  // land exactly three main-row intervals above/below the motor center
  // (±80 px). Their visible leads and open-circle metadata therefore sit on
  // the same horizontal snap rows used by wires and component placement.
  Lib.register({
    id: "blower_2speed",
    category: "load",
    label: "Blower Motor",
    designatorPrefix: "BM",
    width: 320,
    height: 250,
    isLoad: true,
    terminals: [
      { id: "r", x: -140, y: -80 },
      { id: "s", x: -140, y: 80 },
      { id: "c", x: 140, y: 0 }
    ],
    labelAnchor: { x: 0, y: -124 },
    draw(parent) {
      const sw = { width: 0.71 };
      const bodyScale = 4 / 3;
      const radius = 76.22 * bodyScale;
      const terminalY = 80;
      const leftLeadEdgeX = -Math.sqrt((radius * radius) - (terminalY * terminalY));

      // All three external leads are perfectly horizontal. R and S terminal
      // circles are at y=-80/+80, exact application row coordinates, and the
      // inner ends meet the motor-circle perimeter mathematically.
      D.circle(0, 0, radius, { fill: "#ffffff", width: 0.71 }, parent);
      D.line(-140, -terminalY, leftLeadEdgeX, -terminalY, sw, parent);
      D.line(-140, terminalY, leftLeadEdgeX, terminalY, sw, parent);
      D.line(radius, 0, 140, 0, sw, parent);

      // Scale the supplied winding geometry with the motor body so its
      // proportions remain faithful to the original SVG.
      const g = D.group({
        transform: `scale(${bodyScale}) translate(-103.08,-76.57)`
      }, parent);
      D.path("M70.07,109.54c-8.56-5.69-14.96-5.11-14.3,1.3.26,2.54,1.63,5.75,3.9,9.13", sw, g);
      D.path("M80.47,99.11c-8.56-5.69-14.96-5.11-14.3,1.3.26,2.54,1.63,5.75,3.9,9.13", sw, g);
      D.path("M90.87,88.68c-8.56-5.69-14.96-5.11-14.3,1.3.26,2.54,1.63,5.75,3.9,9.13", sw, g);
      D.line(90.87, 88.68, 103.26, 76.26, sw, g);
      D.line(176.57, 76.26, 103.26, 76.26, sw, g);
      D.path("M59.67,119.97c-8.56-5.69-14.96-5.11-14.3,1.3.27,2.56,1.65,5.8,3.95,9.21", sw, g);
      D.path("M70.07,42.98c-3.39,2.26-6.61,3.62-9.15,3.87-6.41.65-6.97-5.76-1.26-14.3", sw, g);
      D.path("M80.47,53.41c-3.39,2.26-6.61,3.62-9.15,3.87-6.41.65-6.97-5.76-1.26-14.3", sw, g);
      D.path("M90.87,63.84c-3.39,2.26-6.61,3.62-9.15,3.87-6.41.65-6.97-5.76-1.26-14.3", sw, g);
      D.line(90.87, 63.84, 103.26, 76.26, sw, g);
      D.path("M59.67,32.55c-2.93,1.95-5.74,3.23-8.09,3.71-6.88,1.39-8.3-4.34-3.17-12.8", sw, g);

      D.text(-78, -80, "R", 11, 400, "#111111", {}, parent);
      D.text(-79, 84, "S", 11, 400, "#111111", {}, parent);
      D.text(84, -5, "C", 11, 400, "#111111", {}, parent);
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
