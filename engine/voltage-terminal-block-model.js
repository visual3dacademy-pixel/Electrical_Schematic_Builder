// Version 1.0
// Passive TSTAT terminal rows plus temporary thermostat R-to-G/Y/W1 calls.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function terminalRef(instance, terminalId) {
    return { kind: "terminal", instanceId: instance.id, terminalId };
  }

  function thermostatConductors(instance) {
    const rows = ["r", "g", "y", "w1", "ob", "c"];
    const conductors = rows.map((rowId) => ({
      a: terminalRef(instance, `${rowId}_l`),
      b: terminalRef(instance, `${rowId}_r`),
      role: "terminal-block-row",
      instanceId: instance.id,
      rowId
    }));

    const canvasId = instance.canvasId || "idu";
    const thermostat = window.ESB.ThermostatControl;
    if (thermostat) {
      [
        { call: "fan", row: "g" },
        { call: "cool", row: "y" },
        { call: "heat", row: "w1" }
      ].forEach((mapping) => {
        if (thermostat.isActive(canvasId, mapping.call)) {
          conductors.push({
            a: terminalRef(instance, "r_l"),
            b: terminalRef(instance, `${mapping.row}_l`),
            role: "thermostat-call",
            instanceId: instance.id,
            call: mapping.call
          });
        }
      });
    }

    return conductors;
  }

  function describe(instance) {
    if (!instance) return null;
    if (instance.typeId === "thermostat_block") {
      return { conductors: thermostatConductors(instance), resistors: [], sources: [] };
    }
    return null;
  }

  window.ESB.VoltageTerminalBlockModel = { describe };
})();
