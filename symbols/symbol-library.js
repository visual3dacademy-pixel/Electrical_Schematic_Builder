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

    type.draw(parent, instance);

    if (type.hideTerminalDots) {
      return;
    }

    type.terminals.forEach((terminal) => {
      D.circle(
        terminal.x,
        terminal.y,
        5.5,
        { fill: "#ffffff", stroke: "#111111", "stroke-width": 2.5 },
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
