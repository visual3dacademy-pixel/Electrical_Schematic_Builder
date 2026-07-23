// Version 2.0
// Phase 1 electrical engine: topology, conductive device states, resistive
// nodal solving, isolated transformer secondary, and floating-island status.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

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
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootA, rootB);
    }

    return { find, union };
  }

  function allRefs(state) {
    const refs = [];
    const Lib = window.ESB.SymbolLibrary;

    state.instances.forEach((instance) => {
      const type = Lib.getType(instance.typeId);
      if (!type || !Array.isArray(type.terminals)) return;
      type.terminals.forEach((terminal) => {
        refs.push({
          kind: "terminal",
          instanceId: instance.id,
          terminalId: terminal.id
        });
      });
    });

    state.junctions.forEach((junction) => {
      refs.push({ kind: "junction", junctionId: junction.id });
    });

    state.wires.forEach((wire) => refs.push(wire.a, wire.b));
    return refs;
  }

  function buildElectricalModel(state) {
    const Netlist = window.ESB.Netlist.buildNetlist(state);
    const DeviceModel = window.ESB.VoltageDeviceModel;
    const unionFind = makeUnionFind();
    const refs = allRefs(state);
    const descriptions = new Map();

    refs.forEach((ref) => unionFind.find(Netlist.netOfRef(ref)));

    state.instances.forEach((instance) => {
      const description = DeviceModel.describe(instance);
      descriptions.set(instance.id, description);
      description.conductors.forEach((edge) => {
        unionFind.union(Netlist.netOfRef(edge.a), Netlist.netOfRef(edge.b));
      });
    });

    function nodeOfRef(ref) {
      return unionFind.find(Netlist.netOfRef(ref));
    }

    const nodes = new Set();
    refs.forEach((ref) => nodes.add(nodeOfRef(ref)));

    const resistors = [];
    descriptions.forEach((description) => {
      description.resistors.forEach((edge) => {
        const a = nodeOfRef(edge.a);
        const b = nodeOfRef(edge.b);
        nodes.add(a);
        nodes.add(b);
        if (a !== b) resistors.push(Object.assign({}, edge, { a, b }));
      });
    });

    return { nodeOfRef, nodes, resistors, descriptions };
  }

  function addFixedVoltage(fixed, diagnostics, node, voltage, sourceId) {
    if (fixed.has(node) && Math.abs(fixed.get(node) - voltage) > 0.001) {
      diagnostics.push({
        type: "source-conflict",
        node,
        firstVoltage: fixed.get(node),
        secondVoltage: voltage,
        sourceId
      });
      return false;
    }
    fixed.set(node, voltage);
    return true;
  }

  function addPrimaryReferences(state, model, fixed, diagnostics) {
    state.instances
      .filter((instance) => instance.typeId === "ground")
      .forEach((ground) => {
        const node = model.nodeOfRef({
          kind: "terminal",
          instanceId: ground.id,
          terminalId: "t1"
        });
        model.nodes.add(node);
        addFixedVoltage(fixed, diagnostics, node, 0, ground.id);
      });

    state.instances
      .filter((instance) => instance.typeId === "breaker")
      .forEach((breaker) => {
        const sourceTerminal = breaker.rotation === 90 ? "t1" : "t2";
        const sourceNode = model.nodeOfRef({
          kind: "terminal",
          instanceId: breaker.id,
          terminalId: sourceTerminal
        });
        const canvasId = breaker.canvasId || "idu";
        const main = window.ESB.Sections.getById("main", canvasId);
        if (!main) return;

        // Signed RMS phasor shorthand for ideal split phase:
        // L1 = +120 V, L2 = -120 V, therefore L1-L2 = 240 V.
        const midpoint = (main.leftX + main.rightX) / 2;
        const voltage = breaker.x <= midpoint ? 120 : -120;
        model.nodes.add(sourceNode);
        addFixedVoltage(fixed, diagnostics, sourceNode, voltage, breaker.id);
      });
  }

  function solvePass(model, fixed, diagnostics) {
    const islands = window.ESB.ElectricalIslands.build(
      model.nodes,
      model.resistors,
      fixed
    );
    const result = window.ESB.MnaSolver.solve(
      model.nodes,
      model.resistors,
      fixed,
      islands
    );
    diagnostics.push.apply(diagnostics, result.diagnostics);
    return { islands, result };
  }

  function addTransformerSecondaries(state, model, fixed, firstPass, diagnostics) {
    state.instances
      .filter((instance) => instance.typeId === "transformer")
      .forEach((transformer) => {
        const h1 = model.nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "h1" });
        const h2 = model.nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "h2" });
        const h1Voltage = firstPass.result.voltages.get(h1);
        const h2Voltage = firstPass.result.voltages.get(h2);
        const h1Status = firstPass.result.statuses.get(h1);
        const h2Status = firstPass.result.statuses.get(h2);

        const primaryIsReferenced = h1Status === "referenced" && h2Status === "referenced";
        const primaryVoltage = primaryIsReferenced && Number.isFinite(h1Voltage) && Number.isFinite(h2Voltage)
          ? Math.abs(h1Voltage - h2Voltage)
          : 0;

        if (primaryVoltage < 216) return;

        const x1 = model.nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "x1" });
        const x2 = model.nodeOfRef({ kind: "terminal", instanceId: transformer.id, terminalId: "x2" });
        model.nodes.add(x1);
        model.nodes.add(x2);

        // The secondary is isolated from the primary. X2 is the local
        // secondary reference, not earth ground unless the user wires it so.
        addFixedVoltage(fixed, diagnostics, x1, 24, `${transformer.id}:x1`);
        addFixedVoltage(fixed, diagnostics, x2, 0, `${transformer.id}:x2`);
      });
  }

  function solveStatic(state) {
    const model = buildElectricalModel(state);
    const fixed = new Map();
    const diagnostics = [];

    addPrimaryReferences(state, model, fixed, diagnostics);
    const firstPass = solvePass(model, fixed, diagnostics);
    addTransformerSecondaries(state, model, fixed, firstPass, diagnostics);
    const finalPass = solvePass(model, fixed, diagnostics);
    const analysis = window.ESB.CircuitAnalysis
      ? window.ESB.CircuitAnalysis.analyze(finalPass.result, model.resistors, model.descriptions)
      : null;

    function statusOfNode(node) {
      return finalPass.result.statuses.get(node) || "floating";
    }

    function islandOfNode(node) {
      return finalPass.islands.islandOfNode(node);
    }

    function voltageOfRef(ref) {
      const node = model.nodeOfRef(ref);
      const value = finalPass.result.voltages.get(node);
      return Number.isFinite(value) ? value : null;
    }

    function measureVoltage(refA, refB) {
      return window.ESB.MeasurementEngine.measureVoltage(api, refA, refB);
    }

    function voltageBetween(refA, refB) {
      const measurement = measureVoltage(refA, refB);
      return measurement.valid ? measurement.voltsRms : null;
    }

    function voltageAcrossInstance(instanceId) {
      const instance = state.instances.find((candidate) => candidate.id === instanceId);
      if (!instance) return null;
      const type = window.ESB.SymbolLibrary.getType(instance.typeId);
      if (!type || !Array.isArray(type.terminals) || type.terminals.length < 2) return null;

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

    const api = {
      nodeOfRef: model.nodeOfRef,
      voltageOfRef,
      voltageBetween,
      voltageAcrossInstance,
      currentThroughInstance(instanceId) {
        const metrics = analysis && analysis.metricsForInstance(instanceId);
        return metrics ? metrics.ampsRms : null;
      },
      powerOfInstance(instanceId) {
        const metrics = analysis && analysis.metricsForInstance(instanceId);
        return metrics ? metrics.powerWatts : null;
      },
      metricsForInstance(instanceId) {
        return analysis ? analysis.metricsForInstance(instanceId) : null;
      },
      branchMetrics: analysis ? analysis.branches : [],
      measureVoltage,
      statusOfNode,
      islandOfNode,
      voltages: finalPass.result.voltages,
      statuses: finalPass.result.statuses,
      fixedVoltages: fixed,
      diagnostics
    };

    return api;
  }

  function solve(state) {
    if (window.ESB.RelayController) {
      return window.ESB.RelayController.solveUntilStable(state, solveStatic);
    }
    return solveStatic(state);
  }

  window.ESB.VoltageSolver = { solve, solveStatic };
})();
