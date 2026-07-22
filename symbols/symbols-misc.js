// Version 0.2
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

  // Capacitor — traced from Capacitor(1).svg (viewBox 26.46x43.86).
  // Source terminal centers are (13.23,5.67) and (13.23,38.20).
  // Uniform scale 2.45927 maps the 32.53-unit source span to 80 pixels,
  // placing both terminal centers exactly at y=-40 and y=+40.
  Lib.register({
    id: "capacitor",
    category: "passive",
    label: "Capacitor",
    defaultLabel: "",
    width: 80,
    height: 110,
    terminals: [
      { id: "t1", x: 0, y: -40 },
      { id: "t2", x: 0, y: 40 }
    ],
    labelAnchor: { x: 28, y: 0 },
    draw(parent) {
      const g = D.group({ transform: "translate(-32.536,-53.943) scale(2.45927)" }, parent);
      const sw = { width: 0.71 };
      D.line(13.23, 38.2, 13.23, 24.63, sw, g);
      D.line(13.23, 21.19, 13.23, 5.67, sw, g);
      D.path("M.35,15.33c6.18,7.11,16.96,7.86,24.07,1.68.6-.52,1.16-1.08,1.68-1.68", sw, g);
      D.line(26.11, 24.63, 0.35, 24.63, sw, g);
    }
  });
})();
