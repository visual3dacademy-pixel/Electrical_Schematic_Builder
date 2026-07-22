// Version 0.1
//
// Nodal voltage solver for the schematic builder. Wires and closed devices
// are collapsed into common electrical nodes. Loads remain resistive edges.
// The 240-V source is established at the line side of the built-in breakers.
// An energized transformer primary creates an isolated 24-V secondary source.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const EPSILON = 1e-8;

  function makeUnionFind() {
    const parent = new Map();

    function find(key) {
      if (!parent.has(key)) parent.set(key, key);
      let root = key;
      while (parent.get(root) !== root) root = parent.get(root);
      let cursor = key;
      while (parent.get(cursor) !== root) {
        const next = parent.get(cursor);
        parent.set(cursor, root);
        cursor = next;
      }
      return root;
    }

    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }

    return { parent, find, union };
  }

  function allRefs(state) {
    const refs = [];
    const Lib = window.ESB.SymbolLibrary;

    state.instances.forEach((instance) => {
      const type = Lib.getType(instance.typeId);
      if (!type) return;
      type.terminals.forEach((terminal) => {
        refs.push({ kind: "terminal", instanceId: instance.id, terminalId: terminal.id });
      });
    });

    state.junctions.forEach((junction) => {
      refs.push({ kind: "junction", junctionId: junction.id });
    });

    state.wires.forEach((wire) => {
      refs.push(wire.a, wire.b);
    });

    return refs;
  }

  function gaussianSolve(matrix, vector) {
    const n = vector.length;
    const a = matrix.map((row, i) => row.slice().concat(vector[i]));

    for (let col = 0; col < n; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < n; row += 1) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      }

      if (Math.abs(a[pivot][col]) < EPSILON) continue;
      if (pivot !== col) [a[pivot], a[col]] = [a[col], a[pivot]];

      const divisor = a[col][col];
      for (let j = col; j <= n; j += 1) a[col][j] /= divisor;

      for (let row = 0; row < n; row += 1) {
        if (row === col) continue;
        const factor = a[row][col];
        if (Math.abs(factor) < EPSILON) continue;
        for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
      }
    }

    return a.map((row, i) => (Math.abs(row[i]) < EPSILON ? 0 : row[n]));
  }

  function solveNetwork(nodes, resistors, fixedVoltages) {
    const unknown = nodes.filter((node) => !fixedVoltages.has(node));
    const index = new Map(unknown.map((node, i) => [node, i]));
    const matrix = unknown.map(() => unknown.map(() => 0));
    const vector = unknown.map(() => 0);

    resistors.forEach((edge) => {
      const g = 1 / Math.max(EPSILON, edge.ohms || 100);
      const aKnown = fixedVoltages.has(edge.a);
      const bKnown = fixedVoltages.has(edge.b);

      if (!aKnown) {
        const ai = index.get(edge.a);
        matrix[ai][ai] += g;
        if (!bKnown) matrix[ai][index.get(edge.b)] -= g;
        else vector[ai] += g * fixedVoltages.get(edge.b);
      }

      if (!bKnown) {
        const bi = index.get(edge.b);
        matrix[bi][bi] += g;
        if (!aKnown) matrix[bi][index.get(edge.a)] -= g;
        else vector[bi] += g * fixedVoltages.get(edge.a);
      }
    });

    // Floating islands have no absolute reference. Add a tiny conductance
    // to 0 V so the matrix remains solvable while preserving practical
    // readings on powered portions of the circuit.
    unknown.forEach((node, i) => {
      matrix[i][i] += 1e-9;
    });

    const solution = gaussianSolve(matrix, vector);
    const result = new Map(fixedVoltages);
    unknown.forEach((node, i) => result.set(node, solution[i] || 0));
    return result;
  }

  function solve(state) {
    const Netlist = window.ESB.Netlist.buildNetlist(state);
    const Model = window.ESB.VoltageDeviceModel;
    const UF = makeUnionFind();
    const refs = allRefs(state);

    refs.forEach((ref) => UF.find(Netlist.netOfRef(ref)));

    const componentDescriptions = new Map();
    state.instances.forEach((instance) => {
      const description = Model.describe(instance);
      componentDescriptions.set(instance.id, description);
      description.conductors.forEach((edge) => {
        UF.union(Netlist.netOfRef(edge.a), Netlist.netOfRef(edge.b));
      });
    });

    function nodeOfRef(ref) {
      return UF.find(Netlist.netOfRef(ref));
    }

    const nodes = new Set();
    refs.forEach((ref) => nodes.add(nodeOfRef(ref)));

    const resistors = [];
    componentDescriptions.forEach((description) => {
      description.resistors.forEach((edge) => {
        const a = nodeOfRef(edge.a);
        const b = nodeOfRef(edge.b);
        if (a !== b) resistors.push(Object.assign({}, edge, { a, b }));
      });
    });

    const fixed = new Map();
    const breakers = state.instances.filter((instance) => instance.typeId === "breaker");
    const main = window.ESB.Sections.getById("main");

    breakers.forEach((breaker) => {
      const sourceTerminal = breaker.rotation === 90 ? "t1" : "t2";
      const sourceNode = nodeOfRef({ kind: "terminal", instanceId: breaker.id, terminalId: sourceTerminal });
      const voltage = breaker.x <= (main.leftX + main.rightX) / 2 ? 120 : -120;
      fixed.set(sourceNode, voltage);
      nodes.add(sourceNode);
    });

    let voltages = solveNetwork(Array.from(nodes), resistors, fixed);

    // Energized transformer primary creates a separate 24-V source. The
    // secondary is intentionally isolated from the primary except through
    // this controlled source relationship.
    state.instances
      .filter((instance) => instance.typeId === "transformer")
      .forEach((transformer) => {
        const h1 = nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "h1" });
        const h2 = nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "h2" });
        const primaryVoltage = Math.abs((voltages.get(h1) || 0) - (voltages.get(h2) || 0));

        if (primaryVoltage >= 216) {
          const x1 = nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "x1" });
          const x2 = nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "x2" });
          fixed.set(x1, 24);
          fixed.set(x2, 0);
          nodes.add(x1);
          nodes.add(x2);
        }
      });

    voltages = solveNetwork(Array.from(nodes), resistors, fixed);

    function voltageOfRef(ref) {
      return voltages.get(nodeOfRef(ref)) || 0;
    }

    function voltageBetween(refA, refB) {
      return Math.abs(voltageOfRef(refA) - voltageOfRef(refB));
    }

    function voltageAcrossInstance(instanceId) {
      const instance = state.instances.find((candidate) => candidate.id === instanceId);
      if (!instance) return null;
      const type = window.ESB.SymbolLibrary.getType(instance.typeId);
      if (!type || type.terminals.length < 2) return null;

      if (instance.typeId === "transformer") {
        return {
          primary: voltageBetween(
            { kind: "terminal", instanceId, terminalId: "h1" },
            { kind: "terminal", instanceId, terminalId: "h2" }
          ),
          secondary: voltageBetween(
            { kind: "terminal", instanceId, terminalId: "x1" },
            { kind: "terminal", instanceId, terminalId: "x2" }
          )
        };
      }

      return voltageBetween(
        { kind: "terminal", instanceId, terminalId: type.terminals[0].id },
        { kind: "terminal", instanceId, terminalId: type.terminals[1].id }
      );
    }

    return { voltageOfRef, voltageBetween, voltageAcrossInstance, nodeOfRef, voltages };
  }

  window.ESB.VoltageSolver = { solve };
})();
