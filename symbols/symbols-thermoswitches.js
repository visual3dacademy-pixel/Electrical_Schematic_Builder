// Version 0.3
//
// Four thermoswitch symbols normalized from the user's 2 mm-grid SVG
// source drawings. The source millimeter grid is used only as a geometry
// reference; the builder uses a 20-design-pixel terminal grid. Every
// thermoswitch terminal center is exactly 160 px apart, so both terminals
// remain on-grid at every 0/90/180/270 degree rotation.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  const TERMINAL_HALF_SPAN = 80;
  const SOURCE_TERMINAL_SPAN = 43.37;
  const SOURCE_SCALE = (TERMINAL_HALF_SPAN * 2) / SOURCE_TERMINAL_SPAN;
  const STROKE = { width: 3, "stroke-linecap": "round", "stroke-linejoin": "round" };

  function sx(sourceX) {
    return -TERMINAL_HALF_SPAN + (sourceX - 5.63) * SOURCE_SCALE;
  }

  function sy(sourceY, terminalY) {
    return (sourceY - terminalY) * SOURCE_SCALE;
  }

  function drawLine(parent, terminalY, x1, y1, x2, y2) {
    D.line(sx(x1), sy(y1, terminalY), sx(x2), sy(y2, terminalY), STROKE, parent);
  }

  function drawBulb(parent, terminalY, points) {
    D.polyline(
      points.map((point) => ({ x: sx(point[0]), y: sy(point[1], terminalY) })),
      STROKE,
      parent
    );
  }

  function registerThermoswitch(definition) {
    Lib.register({
      id: definition.id,
      category: "contact",
      label: definition.label,
      defaultLabel: "",
      designatorPrefix: "TS",
      width: 190,
      height: 180,
      hiddenFromPalette: true,
      isSwitchLike: true,
      variants: [definition.defaultVariant],
      defaultVariant: definition.defaultVariant,
      defaultParams: {
        pivotTerminalId: "t1",
        pivotX: -TERMINAL_HALF_SPAN,
        pivotY: 0,
        actuation: definition.actuation,
        thermoswitchAction: definition.action
      },
      terminals: [
        { id: "t1", x: -TERMINAL_HALF_SPAN, y: 0 },
        { id: "t2", x: TERMINAL_HALF_SPAN, y: 0 }
      ],
      labelAnchor: { x: 0, y: -34 },
      draw(parent) {
        if (definition.closedContactPoint) {
          // NC thermoswitches are visibly closed in their normal state.
          // The lever starts at the exact center of t1 (future animation
          // pivot) and ends on the top/bottom edge of the t2 terminal dot.
          D.line(
            -TERMINAL_HALF_SPAN,
            0,
            definition.closedContactPoint.x,
            definition.closedContactPoint.y,
            STROKE,
            parent
          );
        } else {
          drawLine(parent, definition.terminalY, ...definition.contactLine);
        }
        drawBulb(parent, definition.terminalY, definition.bulbPoints);
      }
    });
  }

  registerThermoswitch({
    id: "thermoswitch_close_fall",
    label: "Close on Fall",
    action: "close",
    actuation: "fall",
    defaultVariant: "NO",
    terminalY: 15.37,
    contactLine: [5.63, 15.37, 45.83, 0.35],
    bulbPoints: [
      [28.37, 7.86], [28.37, 15.68], [36.18, 15.68],
      [36.18, 24.47], [28.37, 24.47], [28.37, 34.88]
    ]
  });

  registerThermoswitch({
    id: "thermoswitch_close_rise",
    label: "Close on Rise",
    action: "close",
    actuation: "rise",
    defaultVariant: "NO",
    terminalY: 5.63,
    contactLine: [5.63, 5.63, 45.77, 20.75],
    bulbPoints: [
      [28.33, 13.19], [28.33, 21.01], [36.14, 21.01],
      [36.14, 29.79], [28.33, 29.79], [28.33, 40.2]
    ]
  });

  registerThermoswitch({
    id: "thermoswitch_open_rise",
    label: "Open on Rise",
    action: "open",
    actuation: "rise",
    defaultVariant: "NC",
    terminalY: 5.63,
    // Touch the TOP edge of the right open-circle terminal (r = 5.5).
    closedContactPoint: { x: TERMINAL_HALF_SPAN, y: -5.5 },
    contactLine: [5.63, 5.63, 48.56, 0.38],
    bulbPoints: [
      [29.73, 3.01], [29.73, 10.83], [37.55, 10.83],
      [37.55, 19.61], [29.73, 19.61], [29.73, 30.02]
    ]
  });

  registerThermoswitch({
    id: "thermoswitch_open_fall",
    label: "Open on Fall",
    action: "open",
    actuation: "fall",
    defaultVariant: "NC",
    terminalY: 5.63,
    // Touch the BOTTOM edge of the right open-circle terminal (r = 5.5).
    closedContactPoint: { x: TERMINAL_HALF_SPAN, y: 5.5 },
    contactLine: [5.63, 5.63, 48.53, 10.93],
    bulbPoints: [
      [29.71, 8.28], [29.71, 16.1], [37.53, 16.1],
      [37.53, 24.89], [29.71, 24.89], [29.71, 35.29]
    ]
  });
})();
