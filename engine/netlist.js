// Version 0.2
//
// Builds the electrical netlist from the current graph: every terminal and
// junction connected (directly or via a chain of wires) ends up sharing the
// same net id. Nets are never authored or stored — they're recomputed from
// the instances/wires/junctions graph whenever needed (rendering, the
// simulation engine, correctness checking, the multimeter).

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function refKey(ref) {
    if (ref.kind === "terminal") {
      return `t:${ref.instanceId}:${ref.terminalId}`;
    }

    if (ref.kind === "rail") {
      // A rail's y is deliberately ignored — the whole rail, from topY to
      // bottomY, is one continuous bus, so every point on it shares a key.
      return `r:${ref.railId}`;
    }

    return `j:${ref.junctionId}`;
  }

  function buildNetlist(state) {
    const Lib = window.ESB.SymbolLibrary;
    const parent = new Map();

    function find(key) {
      if (!parent.has(key)) {
        parent.set(key, key);
      }

      let root = key;
      while (parent.get(root) !== root) {
        root = parent.get(root);
      }

      let cursor = key;
      while (parent.get(cursor) !== root) {
        const next = parent.get(cursor);
        parent.set(cursor, root);
        cursor = next;
      }

      return root;
    }

    function union(keyA, keyB) {
      const rootA = find(keyA);
      const rootB = find(keyB);

      if (rootA !== rootB) {
        parent.set(rootA, rootB);
      }
    }

    // Every terminal gets an entry up front, so an unconnected terminal
    // still resolves to its own (single-member) net rather than null.
    state.instances.forEach((instance) => {
      const type = Lib.getType(instance.typeId);
      type.terminals.forEach((terminal) => {
        find(refKey({ kind: "terminal", instanceId: instance.id, terminalId: terminal.id }));
      });
    });

    state.junctions.forEach((junction) => {
      find(refKey({ kind: "junction", junctionId: junction.id }));
    });

    state.wires.forEach((wire) => {
      union(refKey(wire.a), refKey(wire.b));
    });

    // Stable, human-readable net ids assigned in first-seen order, rather
    // than exposing the raw union-find root keys.
    const rootToNetId = new Map();
    let nextIndex = 0;

    function netIdForKey(key) {
      const root = find(key);

      if (!rootToNetId.has(root)) {
        rootToNetId.set(root, `net${nextIndex}`);
        nextIndex += 1;
      }

      return rootToNetId.get(root);
    }

    function netOfRef(ref) {
      return netIdForKey(refKey(ref));
    }

    function netOfTerminal(instanceId, terminalId) {
      return netOfRef({ kind: "terminal", instanceId, terminalId });
    }

    function netOfJunction(junctionId) {
      return netOfRef({ kind: "junction", junctionId });
    }

    function sameNet(refA, refB) {
      return netOfRef(refA) === netOfRef(refB);
    }

    return { netOfRef, netOfTerminal, netOfJunction, sameNet };
  }

  window.ESB.Netlist = { buildNetlist, refKey };
})();
