// Version 0.1
//
// Coil and contact symbols. Draw functions render only the glyph in local,
// unrotated coordinates (origin at the symbol's center) — labels are
// rendered separately by the canvas layer so they stay upright regardless
// of the instance's rotation.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  const HALF_W = 75;

  function leads(parent, innerHalf) {
    D.line(-HALF_W, 0, -innerHalf, 0, {}, parent);
    D.line(innerHalf, 0, HALF_W, 0, {}, parent);
  }

  Lib.register({
    id: "coil",
    category: "coil",
    label: "Coil",
    width: 150,
    height: 100,
    isCoil: true,
    terminals: [
      { id: "t1", x: -HALF_W, y: 0 },
      { id: "t2", x: HALF_W, y: 0 }
    ],
    labelAnchor: { x: 0, y: 0 },
    draw(parent) {
      leads(parent, 42);
      D.circle(0, 0, 42, { fill: "#ffffff" }, parent);
    }
  });

  function drawContactGlyph(parent, variant) {
    leads(parent, 18);
    D.line(-18, -30, -18, 30, {}, parent);
    D.line(18, -30, 18, 30, {}, parent);

    if (variant === "NC") {
      D.line(-20, 30, 20, -30, {}, parent);
    }
  }

  Lib.register({
    id: "contact_no",
    category: "contact",
    label: "Contact (NO)",
    width: 150,
    height: 90,
    isSwitchLike: true,
    variants: ["NO"],
    defaultVariant: "NO",
    deviceGroupCapable: true,
    terminals: [
      { id: "t1", x: -HALF_W, y: 0 },
      { id: "t2", x: HALF_W, y: 0 }
    ],
    labelAnchor: { x: 0, y: -48 },
    draw(parent) {
      drawContactGlyph(parent, "NO");
    }
  });

  Lib.register({
    id: "contact_nc",
    category: "contact",
    label: "Contact (NC)",
    width: 150,
    height: 90,
    isSwitchLike: true,
    variants: ["NC"],
    defaultVariant: "NC",
    deviceGroupCapable: true,
    terminals: [
      { id: "t1", x: -HALF_W, y: 0 },
      { id: "t2", x: HALF_W, y: 0 }
    ],
    labelAnchor: { x: 0, y: -48 },
    draw(parent) {
      drawContactGlyph(parent, "NC");
    }
  });

  function drawDelayArc(parent) {
    D.path("M -22,-46 A 22,22 0 0 1 22,-46", {}, parent);
  }

  Lib.register({
    id: "contact_no_delayed",
    category: "contact",
    label: "Timed Contact (NOTC)",
    width: 150,
    height: 100,
    isSwitchLike: true,
    isTimed: true,
    variants: ["NO"],
    defaultVariant: "NO",
    deviceGroupCapable: true,
    terminals: [
      { id: "t1", x: -HALF_W, y: 0 },
      { id: "t2", x: HALF_W, y: 0 }
    ],
    labelAnchor: { x: 0, y: -68 },
    draw(parent) {
      drawContactGlyph(parent, "NO");
      drawDelayArc(parent);
    }
  });

  Lib.register({
    id: "contact_nc_delayed",
    category: "contact",
    label: "Timed Contact (NOTO)",
    width: 150,
    height: 100,
    isSwitchLike: true,
    isTimed: true,
    variants: ["NC"],
    defaultVariant: "NC",
    deviceGroupCapable: true,
    terminals: [
      { id: "t1", x: -HALF_W, y: 0 },
      { id: "t2", x: HALF_W, y: 0 }
    ],
    labelAnchor: { x: 0, y: -68 },
    draw(parent) {
      drawContactGlyph(parent, "NC");
      drawDelayArc(parent);
    }
  });
})();
