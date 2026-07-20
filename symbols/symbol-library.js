// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const types = {};

  function register(symbolType) {
    types[symbolType.id] = symbolType;
  }

  function getType(typeId) {
    return types[typeId];
  }

  function getAllTypes() {
    return Object.values(types);
  }

  // Draws a symbol type's glyph, then a small connection dot on every
  // terminal — every lead ends visibly at a connection point, so learners
  // can see exactly where a wire may attach.
  function drawInstance(parent, type, instance) {
    const D = window.ESB.Drawing;
    const C = window.ESB.Config;

    type.draw(parent, instance);

    if (type.hideTerminalDots) {
      return;
    }

    type.terminals.forEach((terminal) => {
      // Invisible zone matching the wire-tool's actual hit radius, shown
      // with a crosshair cursor — hovering anywhere a click would really
      // register as "start a wire" looks different from hovering the rest
      // of the component (a "grab" cursor, set on the instance group),
      // so the two interactions are distinguishable before clicking.
      D.circle(
        terminal.x,
        terminal.y,
        (C && C.TERMINAL_HIT_RADIUS) || 16,
        { fill: "transparent", stroke: "none", style: "cursor:crosshair;" },
        parent
      );

      D.circle(
        terminal.x,
        terminal.y,
        5.5,
        { fill: "#ffffff", stroke: "#111111", "stroke-width": 2.5, style: "cursor:crosshair;" },
        parent
      );
    });
  }

  window.ESB.SymbolLibrary = {
    register,
    getType,
    getAllTypes,
    drawInstance
  };
})();
