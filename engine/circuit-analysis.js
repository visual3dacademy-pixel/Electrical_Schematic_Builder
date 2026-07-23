// Version 1.0
// Phase 2 branch analysis: current, voltage drop, power, and device state.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const EPSILON = 1e-9;

  function finiteVoltage(solution, node) {
    const value = solution.voltages.get(node);
    return Number.isFinite(value) ? value : null;
  }

  function analyze(solution, resistors, descriptions) {
    const branches = [];
    const byInstance = new Map();

    (resistors || []).forEach((edge, index) => {
      const voltageA = finiteVoltage(solution, edge.a);
      const voltageB = finiteVoltage(solution, edge.b);
      const resistance = Math.max(EPSILON, Number(edge.ohms) || 100);
      const referenced = voltageA !== null && voltageB !== null;
      const voltageDrop = referenced ? voltageA - voltageB : null;
      const currentAmps = referenced ? voltageDrop / resistance : null;
      const powerWatts = referenced ? currentAmps * currentAmps * resistance : null;

      const branch = {
        id: `branch${index}`,
        instanceId: edge.instanceId || null,
        role: edge.role || "resistor",
        nodeA: edge.a,
        nodeB: edge.b,
        resistanceOhms: resistance,
        voltageDrop,
        voltsRms: voltageDrop === null ? null : Math.abs(voltageDrop),
        currentAmps,
        ampsRms: currentAmps === null ? null : Math.abs(currentAmps),
        powerWatts,
        referenced
      };

      branches.push(branch);
      if (branch.instanceId) {
        if (!byInstance.has(branch.instanceId)) byInstance.set(branch.instanceId, []);
        byInstance.get(branch.instanceId).push(branch);
      }
    });

    function metricsForInstance(instanceId) {
      const list = byInstance.get(instanceId) || [];
      if (!list.length) return null;

      return {
        instanceId,
        branches: list.slice(),
        voltsRms: Math.max.apply(null, list.map((branch) => branch.voltsRms || 0)),
        ampsRms: list.reduce((sum, branch) => sum + (branch.ampsRms || 0), 0),
        powerWatts: list.reduce((sum, branch) => sum + (branch.powerWatts || 0), 0),
        energized: list.some((branch) => (branch.voltsRms || 0) > 0.5),
        conducting: list.some((branch) => (branch.ampsRms || 0) > 0.0001)
      };
    }

    return {
      branches,
      byInstance,
      metricsForInstance,
      descriptions: descriptions || new Map()
    };
  }

  window.ESB.CircuitAnalysis = { analyze };
})();
