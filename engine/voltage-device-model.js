// Version 0.1
//
// Device-level electrical behavior for the voltage simulator. This file
// deliberately contains no graph solving or UI code. It answers only:
// "What electrical relationship exists between this component's terminals?"

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const DEFAULT_LOAD_OHMS = 100;

  function terminalRef(instance, terminalId) {
    return { kind: "terminal", instanceId: instance.id, terminalId };
  }

  function isClosedSwitch(instance, type) {
    if (!type || !type.isSwitchLike) {
      return false;
    }

    // A future thermostat/diagnostics controller may set params.closed
    // explicitly. Until then, the authored NO/NC variant is authoritative.
    if (instance.params && typeof instance.params.closed === "boolean") {
      return instance.params.closed;
    }

    return (instance.variant || type.defaultVariant || "NO") === "NC";
  }

  function twoTerminalIds(type) {
    if (!type || !Array.isArray(type.terminals) || type.terminals.length !== 2) {
      return null;
    }
    return [type.terminals[0].id, type.terminals[1].id];
  }

  function describe(instance) {
    const type = window.ESB.SymbolLibrary.getType(instance.typeId);
    const pair = twoTerminalIds(type);

    if (!type) {
      return { conductors: [], resistors: [], sources: [] };
    }

    const conductors = [];
    const resistors = [];
    const sources = [];

    if (instance.typeId === "breaker" && pair) {
      if (!(instance.params && instance.params.open)) {
        conductors.push({ a: terminalRef(instance, pair[0]), b: terminalRef(instance, pair[1]) });
      }
      return { conductors, resistors, sources };
    }

    if (instance.typeId === "fuse" && pair) {
      const blown = !!(instance.params && instance.params.blown);
      if (!blown) {
        conductors.push({ a: terminalRef(instance, pair[0]), b: terminalRef(instance, pair[1]) });
      }
      return { conductors, resistors, sources };
    }

    if (type.isSwitchLike && pair) {
      if (isClosedSwitch(instance, type)) {
        conductors.push({ a: terminalRef(instance, pair[0]), b: terminalRef(instance, pair[1]) });
      }
      return { conductors, resistors, sources };
    }

    if (instance.typeId === "transformer") {
      resistors.push({
        a: terminalRef(instance, "h1"),
        b: terminalRef(instance, "h2"),
        ohms: DEFAULT_LOAD_OHMS,
        role: "transformer-primary",
        instanceId: instance.id
      });
      return { conductors, resistors, sources };
    }

    // Loads consume power and therefore must not be collapsed into a wire.
    // The same coil symbol can operate at 240 V or 24 V; the solver decides
    // its actual terminal-to-terminal voltage from the connected source.
    if (pair && (type.isLoad || type.isCoil || instance.typeId === "indicator_light")) {
      resistors.push({
        a: terminalRef(instance, pair[0]),
        b: terminalRef(instance, pair[1]),
        ohms: Number(instance.params && instance.params.resistanceOhms) || DEFAULT_LOAD_OHMS,
        role: "load",
        instanceId: instance.id
      });
    }

    return { conductors, resistors, sources };
  }

  window.ESB.VoltageDeviceModel = {
    describe,
    isClosedSwitch
  };
})();
