// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  function coilStack(parent, x) {
    D.line(x, -40, x, 40, {}, parent);
    [-26, 0, 26].forEach((cy) => {
      D.circle(x, cy, 13, { fill: "#ffffff" }, parent);
    });
  }

  Lib.register({
    id: "transformer",
    category: "power",
    label: "Transformer",
    width: 220,
    height: 120,
    terminals: [
      { id: "h1", x: -100, y: -40 },
      { id: "h2", x: -100, y: 40 },
      { id: "x1", x: 100, y: -40 },
      { id: "x2", x: 100, y: 40 }
    ],
    labelAnchor: { x: 0, y: -62 },
    draw(parent) {
      D.line(-100, -40, -45, -40, {}, parent);
      D.line(-100, 40, -45, 40, {}, parent);
      D.line(100, -40, 45, -40, {}, parent);
      D.line(100, 40, 45, 40, {}, parent);

      coilStack(parent, -45);
      coilStack(parent, 45);

      D.line(-8, -50, -8, 50, {}, parent);
      D.line(8, -50, 8, 50, {}, parent);
    }
  });

  Lib.register({
    id: "fuse",
    category: "protective",
    label: "Fuse",
    width: 150,
    height: 60,
    canFault: true,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -36 },
    draw(parent) {
      D.line(-75, 0, -20, 0, {}, parent);
      D.line(20, 0, 75, 0, {}, parent);
      D.rect(-20, -13, 40, 26, { rx: 13, fill: "#ffffff" }, parent);
    }
  });

  Lib.register({
    id: "breaker",
    category: "protective",
    label: "Circuit Breaker",
    width: 150,
    height: 80,
    canFault: true,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -46 },
    draw(parent) {
      D.line(-75, 0, -30, 0, {}, parent);
      D.line(30, 0, 75, 0, {}, parent);
      D.rect(-30, -22, 60, 44, { fill: "#ffffff" }, parent);
      D.line(-22, 15, 22, -15, {}, parent);
    }
  });
})();
