// Version 0.1
//
// Electrical behavior for passive terminal blocks. These components provide
// multiple visible wire-attachment points, but do not consume power and do
// not create a voltage drop. Each declared terminal pair is therefore a
// direct conductor in the voltage network.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function terminalRef(instance, terminalId) {
    return {
      kind: "terminal",
      instanceId: instance.id,
      terminalId
    };
  }

  function thermostatConductors(instance) {
    const rows = ["r", "g", "y", "w1", "ob", "c"];

    return rows.map((rowId) => ({
      a: terminalRef(instance, `${rowId}_l`),
      b: terminalRef(instance, `${rowId}_r`),
      role: "terminal-block-row",
      instanceId: instance.id,
      rowId
    }));
  }

  function describe(instance) {
    if (!instance) {
      return null;
    }

    if (instance.typeId === "thermostat_block") {
      return {
        conductors: thermostatConductors(instance),
        resistors: [],
        sources: []
      };
    }

    return null;
  }

  window.ESB.VoltageTerminalBlockModel = {
    describe
  };
})();
