// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  // Chassis ground. A single terminal hangs off whatever it's wired to;
  // in the simulation engine this bonds directly to the Common/L2 net.
  Lib.register({
    id: "ground",
    category: "reference",
    label: "Ground",
    width: 60,
    height: 60,
    isGround: true,
    terminals: [{ id: "t1", x: 0, y: -30 }],
    labelAnchor: { x: 22, y: -10 },
    draw(parent) {
      D.line(0, -30, 0, -12, {}, parent);
      D.line(-15, -12, 15, -12, {}, parent);
      [-10, 0, 10].forEach((x) => {
        D.line(x, -12, x - 8, 2, {}, parent);
      });
    }
  });

  Lib.register({
    id: "capacitor",
    category: "passive",
    label: "Capacitor",
    width: 150,
    height: 70,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -38 },
    draw(parent) {
      D.line(-75, 0, -8, 0, {}, parent);
      D.line(8, 0, 75, 0, {}, parent);
      D.line(-8, -25, -8, 25, {}, parent);
      D.line(8, -25, 8, 25, {}, parent);
    }
  });
})();
