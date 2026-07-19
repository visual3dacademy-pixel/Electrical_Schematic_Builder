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
    selectedWireId: null
  };

  function createInstance(typeId, x, y) {
    const type = window.ESB.SymbolLibrary.getType(typeId);

    const instance = {
      id: generateId("inst"),
      typeId,
      x,
      y,
      rotation: 0,
      mirrored: false,
      label: type.label,
      variant: type.defaultVariant || null,
      deviceGroup: null,
      params: {},
      locked: false
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
    state.wires = state.wires.filter((wire) => {
      return !refTouchesInstance(wire.a, id) && !refTouchesInstance(wire.b, id);
    });

    if (state.selectedId === id) {
      state.selectedId = null;
    }
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
    state.wires = state.wires.filter((wire) => wire.id !== id);

    if (state.selectedWireId === id) {
      state.selectedWireId = null;
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
