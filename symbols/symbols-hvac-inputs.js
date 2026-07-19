// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  // Thermostat sub-base call terminal. This is a source point, not a
  // switch: whether it is energized is driven externally by the Start
  // Cooling / Start Heating controls, not by conduction logic. Color
  // matches standard thermostat wire coding so the terminal is
  // identifiable at a glance, same as on a real sub-base.
  const THERMOSTAT_COLORS = {
    R: "#e8352b",
    G: "#39b54a",
    Y: "#f5d811",
    W1: "#f2f2f2",
    "O/B": "#f0902a",
    C: "#1a1a1a"
  };

  Lib.register({
    id: "thermostat_terminal",
    category: "source",
    label: "Thermostat Terminal",
    width: 170,
    height: 60,
    isSource: true,
    variants: ["R", "G", "Y", "W1", "O/B", "C"],
    defaultVariant: "R",
    terminals: [{ id: "t1", x: 60, y: 0 }],
    labelAnchor: { x: 92, y: 0 },
    draw(parent, instance) {
      const variant = (instance && instance.variant) || "R";
      const color = THERMOSTAT_COLORS[variant] || "#cccccc";

      D.line(15, 0, 60, 0, {}, parent);
      D.rect(-45, -25, 60, 50, { rx: 6, fill: color, stroke: "#111111", "stroke-width": 2 }, parent);
    }
  });

  function drawSwitchGlyph(parent, variant) {
    D.line(-75, 0, -18, 0, {}, parent);
    D.line(18, 0, 75, 0, {}, parent);
    D.line(-18, -30, -18, 30, {}, parent);
    D.line(18, -30, 18, 30, {}, parent);

    if (variant === "NC") {
      D.line(-20, 30, 20, -30, {}, parent);
    }
  }

  // Pressure switch (high or low). params.kind ("high"/"low") drives the
  // default label; variant is NO/NC exactly like a control contact, plus
  // params.actuation ("rise"/"fall") records which way the pressure trend
  // closes the contact for the simulation engine.
  Lib.register({
    id: "pressure_switch",
    category: "contact",
    label: "Pressure Switch",
    width: 150,
    height: 130,
    isSwitchLike: true,
    variants: ["NO", "NC"],
    defaultVariant: "NC",
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -48 },
    draw(parent, instance) {
      const variant = (instance && instance.variant) || "NC";
      drawSwitchGlyph(parent, variant);

      // Diaphragm/bellows glyph beneath the contact, denoting pressure actuation.
      D.line(0, 30, 0, 42, {}, parent);
      D.path("M -16,42 L 16,42 L 0,60 Z", { fill: "#ffffff" }, parent);
    }
  });

  // Airflow proving switch: a flexible sail/sensing element (drawn as a
  // small coil) in place of the straight contact bars, but electrically
  // identical to any other NO/NC contact.
  Lib.register({
    id: "flow_switch",
    category: "contact",
    label: "Flow Switch",
    width: 150,
    height: 90,
    isSwitchLike: true,
    variants: ["NO", "NC"],
    defaultVariant: "NC",
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -40 },
    draw(parent) {
      D.line(-75, 0, -32, 0, {}, parent);
      D.line(32, 0, 75, 0, {}, parent);
      D.path("M -32,0 Q -21,-24 -10,0 Q 1,24 12,0 Q 23,-24 32,0", {}, parent);
    }
  });

  // Mechanical limit switch: a lever arm actuator above a standard
  // break-contact, electrically identical to a contact_no/contact_nc.
  Lib.register({
    id: "limit_switch",
    category: "contact",
    label: "Limit Switch",
    width: 150,
    height: 110,
    isSwitchLike: true,
    variants: ["NO", "NC"],
    defaultVariant: "NO",
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -56 },
    draw(parent, instance) {
      const variant = (instance && instance.variant) || "NO";
      drawSwitchGlyph(parent, variant);

      // Lever arm actuator above the contact.
      D.line(-18, -30, -18, -48, {}, parent);
      D.line(-18, -48, 14, -48, {}, parent);
    }
  });
})();
