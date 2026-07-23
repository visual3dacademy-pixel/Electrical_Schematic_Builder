// Version 1.2
// Electrical measurements are based on solved node state, not display rules.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function measureVoltage(solution, refA, refB) {
    const nodeA = solution.nodeOfRef(refA);
    const nodeB = solution.nodeOfRef(refB);
    const statusA = solution.statusOfNode(nodeA);
    const statusB = solution.statusOfNode(nodeB);
    const islandA = solution.islandOfNode(nodeA);
    const islandB = solution.islandOfNode(nodeB);

    if (nodeA === nodeB) {
      return {
        valid: true,
        voltsRms: 0,
        nodeA,
        nodeB,
        statusA,
        statusB,
        reason: "same-node"
      };
    }

    if (statusA === "invalid" || statusB === "invalid") {
      return {
        valid: false,
        voltsRms: null,
        nodeA,
        nodeB,
        statusA,
        statusB,
        reason: "invalid-network"
      };
    }

    if (statusA === "floating" || statusB === "floating") {
      // Ideal training model: an isolated conductor has no source-imposed
      // potential. Without modeled capacitive coupling/ghost voltage, the
      // tester displays a valid 0.0 VAC rather than an undefined dash.
      return {
        valid: true,
        voltsRms: 0,
        nodeA,
        nodeB,
        statusA,
        statusB,
        reason: islandA && islandB && islandA.id === islandB.id
          ? "same-floating-island"
          : "ideal-floating-zero"
      };
    }

    const voltageA = solution.voltages.get(nodeA);
    const voltageB = solution.voltages.get(nodeB);
    if (!Number.isFinite(voltageA) || !Number.isFinite(voltageB)) {
      return {
        valid: false,
        voltsRms: null,
        nodeA,
        nodeB,
        statusA,
        statusB,
        reason: "unsolved-node"
      };
    }

    return {
      valid: true,
      voltsRms: Math.abs(voltageA - voltageB),
      voltageA,
      voltageB,
      nodeA,
      nodeB,
      statusA,
      statusB,
      reason: "solved"
    };
  }

  window.ESB.MeasurementEngine = { measureVoltage };
})();
