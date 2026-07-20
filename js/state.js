// Version 0.2

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  let nextId = 1;

  function generateId(prefix) {
    const id = `${prefix}${nextId}`;
    nextId += 1;
    return id;
  }

  // The single source of truth for the circuit currently on the canvas.
  // Instances/wires/junctions together form the free-form graph described
  // in the project plan; electrical nets are never stored here, only
  // computed on demand by engine/netlist.js.
  const state = {
    instances: [],
    wires: [],
    junctions: [],
    selectedId: null,
    selectedWireId: null,
    designatorCounters: {}
  };

  // Returns the next auto-incrementing designator for a prefix (e.g. "LIM1",
  // then "LIM2", ...). A shared counter (e.g. "R" for relay coils and their
  // contacts) is what lets a compound placement label every piece to match.
  function nextDesignator(prefix) {
    const current = state.designatorCounters[prefix] || 0;
    const next = current + 1;
    state.designatorCounters[prefix] = next;
    return `${prefix}${next}`;
  }

  function createInstance(typeId, x, y, overrides) {
    const type = window.ESB.SymbolLibrary.getType(typeId);
    const opts = overrides || {};

    // type.label is the palette's display name; type.defaultLabel (when
    // present) is what a fresh instance shows on-canvas instead of it —
    // e.g. the capacitor's palette row still reads "Capacitor" but a
    // placed instance starts with no designator text at all.
    const label = opts.label !== undefined
      ? opts.label
      : (type.designatorPrefix
        ? nextDesignator(type.designatorPrefix)
        : (type.defaultLabel !== undefined ? type.defaultLabel : type.label));

    const instance = {
      id: generateId("inst"),
      typeId,
      x,
      y,
      rotation: 0,
      mirrored: false,
      label,
      variant: type.defaultVariant || null,
      deviceGroup: opts.deviceGroup !== undefined ? opts.deviceGroup : null,
      params: Object.assign({}, type.defaultParams),
      locked: false,
      // Distinct from `locked` (which also blocks deletion) — an instance
      // placed by an automatic bridging recipe (e.g. TSTAT Terminals to
      // the 24V rail) that must stay exactly where it was placed, but can
      // still be selected and deleted normally.
      fixedPosition: !!opts.fixedPosition
    };

    state.instances.push(instance);
    return instance;
  }

  function getInstance(id) {
    return state.instances.find((instance) => instance.id === id) || null;
  }

  function removeInstance(id) {
    const instance = getInstance(id);

    if (!instance || instance.locked) {
      return;
    }

    state.instances = state.instances.filter((candidate) => candidate.id !== id);

    // Any wire touching this instance's terminals is no longer valid.
    const removedWires = state.wires.filter((wire) => {
      return refTouchesInstance(wire.a, id) || refTouchesInstance(wire.b, id);
    });
    state.wires = state.wires.filter((wire) => removedWires.indexOf(wire) === -1);

    if (state.selectedId === id) {
      state.selectedId = null;
    }

    pruneOrphanedJunctions(removedWires);
  }

  // A junction only exists to join wires together — once the last wire
  // touching one is gone (deleted directly, or because it was attached to
  // an instance that just got removed), the junction's dot has nothing
  // left to represent and should disappear along with it.
  function pruneOrphanedJunctions(removedWires) {
    const candidateJunctionIds = [];

    removedWires.forEach((wire) => {
      [wire.a, wire.b].forEach((ref) => {
        if (ref && ref.kind === "junction" && candidateJunctionIds.indexOf(ref.junctionId) === -1) {
          candidateJunctionIds.push(ref.junctionId);
        }
      });
    });

    candidateJunctionIds.forEach((junctionId) => {
      const stillInUse = state.wires.some((wire) => {
        return refTouchesJunction(wire.a, junctionId) || refTouchesJunction(wire.b, junctionId);
      });

      if (!stillInUse) {
        state.junctions = state.junctions.filter((junction) => junction.id !== junctionId);
      }
    });
  }

  function createJunction(x, y) {
    const junction = { id: generateId("junc"), x, y };
    state.junctions.push(junction);
    return junction;
  }

  function getJunction(id) {
    return state.junctions.find((junction) => junction.id === id) || null;
  }

  function refTouchesInstance(ref, instanceId) {
    return ref.kind === "terminal" && ref.instanceId === instanceId;
  }

  function refTouchesJunction(ref, junctionId) {
    return ref.kind === "junction" && ref.junctionId === junctionId;
  }

  function removeJunction(id) {
    state.junctions = state.junctions.filter((candidate) => candidate.id !== id);

    state.wires = state.wires.filter((wire) => {
      return !refTouchesJunction(wire.a, id) && !refTouchesJunction(wire.b, id);
    });
  }

  function sameRef(a, b) {
    if (!a || !b || a.kind !== b.kind) {
      return false;
    }

    return a.kind === "terminal"
      ? a.instanceId === b.instanceId && a.terminalId === b.terminalId
      : a.junctionId === b.junctionId;
  }

  function createWire(a, b) {
    const wire = { id: generateId("wire"), a, b };
    state.wires.push(wire);
    return wire;
  }

  function getWire(id) {
    return state.wires.find((wire) => wire.id === id) || null;
  }

  function removeWire(id) {
    const wire = getWire(id);
    state.wires = state.wires.filter((candidate) => candidate.id !== id);

    if (state.selectedWireId === id) {
      state.selectedWireId = null;
    }

    if (wire) {
      pruneOrphanedJunctions([wire]);
    }
  }

  function rotateInstance(id, deltaDegrees) {
    const instance = getInstance(id);

    if (!instance || instance.locked) {
      return;
    }

    instance.rotation = ((instance.rotation + deltaDegrees) % 360 + 360) % 360;
  }

  function moveInstance(id, x, y) {
    const instance = getInstance(id);

    if (!instance || instance.locked) {
      return;
    }

    instance.x = x;
    instance.y = y;
  }

  // Selecting an instance and selecting a wire are mutually exclusive.
  function select(id) {
    state.selectedId = id;
    state.selectedWireId = null;
  }

  function getSelected() {
    return state.selectedId ? getInstance(state.selectedId) : null;
  }

  function selectWire(id) {
    state.selectedWireId = id;
    state.selectedId = null;
  }

  function getSelectedWire() {
    return state.selectedWireId ? getWire(state.selectedWireId) : null;
  }

  window.ESB.State = {
    state,
    generateId,
    nextDesignator,
    createInstance,
    getInstance,
    removeInstance,
    rotateInstance,
    moveInstance,
    select,
    getSelected,
    createJunction,
    getJunction,
    removeJunction,
    createWire,
    getWire,
    removeWire,
    selectWire,
    getSelectedWire,
    sameRef
  };
})();
