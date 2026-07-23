// Version 1.0
// Resistive modified-nodal foundation with fixed RMS voltage references.
// Floating islands are intentionally not forced to 0 V.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const EPSILON = 1e-10;

  function gaussianSolve(matrix, vector) {
    const n = vector.length;
    if (!n) return [];
    const a = matrix.map((row, index) => row.slice().concat(vector[index]));

    for (let column = 0; column < n; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < n; row += 1) {
        if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
      }

      if (Math.abs(a[pivot][column]) < EPSILON) {
        throw new Error("Singular referenced electrical island");
      }

      if (pivot !== column) [a[pivot], a[column]] = [a[column], a[pivot]];

      const divisor = a[column][column];
      for (let j = column; j <= n; j += 1) a[column][j] /= divisor;

      for (let row = 0; row < n; row += 1) {
        if (row === column) continue;
        const factor = a[row][column];
        if (Math.abs(factor) < EPSILON) continue;
        for (let j = column; j <= n; j += 1) {
          a[row][j] -= factor * a[column][j];
        }
      }
    }

    return a.map((row) => row[n]);
  }

  function solveReferencedIsland(island, resistors, fixedVoltages) {
    const islandSet = new Set(island.nodes);
    const islandEdges = resistors.filter(
      (edge) => islandSet.has(edge.a) && islandSet.has(edge.b)
    );
    const unknown = island.nodes.filter((node) => !fixedVoltages.has(node));
    const index = new Map(unknown.map((node, i) => [node, i]));
    const matrix = unknown.map(() => unknown.map(() => 0));
    const vector = unknown.map(() => 0);

    islandEdges.forEach((edge) => {
      const resistance = Math.max(EPSILON, Number(edge.ohms) || 100);
      const conductance = 1 / resistance;
      const aKnown = fixedVoltages.has(edge.a);
      const bKnown = fixedVoltages.has(edge.b);

      if (!aKnown) {
        const ai = index.get(edge.a);
        matrix[ai][ai] += conductance;
        if (bKnown) vector[ai] += conductance * fixedVoltages.get(edge.b);
        else matrix[ai][index.get(edge.b)] -= conductance;
      }

      if (!bKnown) {
        const bi = index.get(edge.b);
        matrix[bi][bi] += conductance;
        if (aKnown) vector[bi] += conductance * fixedVoltages.get(edge.a);
        else matrix[bi][index.get(edge.a)] -= conductance;
      }
    });

    const solved = gaussianSolve(matrix, vector);
    const values = new Map();
    island.references.forEach((reference) => values.set(reference.node, reference.voltage));
    unknown.forEach((node, i) => values.set(node, solved[i]));
    return values;
  }

  function solve(nodes, resistors, fixedVoltages, islandsResult) {
    const voltages = new Map();
    const statuses = new Map();
    const diagnostics = [];

    islandsResult.islands.forEach((island) => {
      island.nodes.forEach((node) => statuses.set(node, island.status));

      if (island.status === "floating") {
        island.nodes.forEach((node) => voltages.set(node, null));
        return;
      }

      try {
        const islandVoltages = solveReferencedIsland(island, resistors, fixedVoltages);
        islandVoltages.forEach((value, node) => voltages.set(node, value));
      } catch (error) {
        island.nodes.forEach((node) => {
          voltages.set(node, null);
          statuses.set(node, "invalid");
        });
        diagnostics.push({
          type: "solver-error",
          islandId: island.id,
          message: error.message
        });
      }
    });

    return { voltages, statuses, diagnostics };
  }

  window.ESB.MnaSolver = { solve };
})();
