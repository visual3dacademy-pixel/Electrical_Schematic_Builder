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

  // Vertical, polarized-style capacitor — traced from Assets/SVG/Capacitor.svg
  // (updated viewBox 38.96x84.69). Terminal centers there are (19.48,8.23)
  // and (19.48,76.46). Scaled down close to half the library's usual size
  // (terminal span 80, not exactly-half 75) — scale=80/68.23=1.1725. 80,
  // not 75, deliberately: it's a multiple of Config.PLACEMENT_GRID (20),
  // so a placed instance's terminals always land exactly on the grid
  // instead of at a fractional Y. Terminal dots themselves stay the
  // standard 5.5px (drawn generically by symbol-library.js).
  Lib.register({
    id: "capacitor",
    category: "passive",
    label: "Capacitor",
    defaultLabel: "",
    width: 70,
    height: 100,
    terminals: [
      { id: "t1", x: 0, y: -40 },
      { id: "t2", x: 0, y: 40 }
    ],
    labelAnchor: { x: 22, y: 0 },
    draw(parent) {
      const g = D.group({ transform: "translate(-22.84,-49.65) scale(1.1725)" }, parent);
      const sw = { width: 0.73 };

      // Leads extended to the exact terminal centers (19.48,8.23) and
      // (19.48,76.46) — the source art's own lines stop at the terminal
      // circle's edge, leaving a radius-sized gap to the auto-rendered
      // terminal dot (which is drawn at the center).
      D.line(19.48, 76.46, 19.47, 49.98, sw, g);
      D.line(19.47, 36.42, 19.48, 8.23, sw, g);
      D.path("M.37,27.68c4.81,5.53,11.79,8.71,19.12,8.71s14.31-3.18,19.12-8.71", sw, g);
      D.line(38.58, 49.98, .36, 49.98, sw, g);
    }
  });
})();
