// Version 1.0
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
    designatorPrefix: "R",
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

  function drawContactGlyph(parent, normallyClosed, closed) {
    leads(parent, 18);
    D.line(-18, -30, -18, 30, {}, parent);
    D.line(18, -30, 18, 30, {}, parent);

    // Contact blade rotates between the authored open and closed positions.
    // The electrical state is held in instance.params.closed by RelayController.
    if (closed) {
      D.line(-20, 0, 20, 0, {}, parent);
    } else {
      D.line(-20, 0, 18, -28, {}, parent);
    }
  }

  // Hidden from the palette (learners can't drag a bare one), but still
  // registered — SPST/SPDT Relay compound placement (RELAY_PRESETS in
  // ui/canvas-interactions.js) creates instances of these directly.
  Lib.register({
    id: "contact_no",
    category: "contact",
    label: "Contact (NO)",
    designatorPrefix: "CR",
    hiddenFromPalette: true,
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
    draw(parent, instance) {
      const closed = !!(instance && instance.params && instance.params.closed);
      drawContactGlyph(parent, false, closed);
    }
  });

  Lib.register({
    id: "contact_nc",
    category: "contact",
    label: "Contact (NC)",
    designatorPrefix: "CR",
    hiddenFromPalette: true,
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
    draw(parent, instance) {
      const explicit = instance && instance.params && typeof instance.params.closed === "boolean";
      const closed = explicit ? instance.params.closed : true;
      drawContactGlyph(parent, true, closed);
    }
  });
})();
