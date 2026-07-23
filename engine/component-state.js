// Version 1.0
// Phase 2 authoritative state API for breakers, fuses, and switch-like devices.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function getInstance(instanceId) {
    return window.ESB.State.getInstance(instanceId);
  }

  function isSwitchLike(instance) {
    if (!instance) return false;
    const type = window.ESB.SymbolLibrary.getType(instance.typeId);
    return !!(type && type.isSwitchLike);
  }

  function getClosed(instanceId) {
    const instance = getInstance(instanceId);
    if (!instance) return null;

    if (instance.typeId === "breaker") {
      return !(instance.params && instance.params.open);
    }

    if (instance.typeId === "fuse") {
      return !(instance.params && instance.params.blown);
    }

    if (isSwitchLike(instance)) {
      return window.ESB.VoltageDeviceModel.isClosedSwitch(
        instance,
        window.ESB.SymbolLibrary.getType(instance.typeId)
      );
    }

    return null;
  }

  function setClosed(instanceId, closed) {
    const instance = getInstance(instanceId);
    if (!instance) return false;
    instance.params = instance.params || {};

    if (instance.typeId === "breaker") {
      instance.params.open = !closed;
    } else if (instance.typeId === "fuse") {
      instance.params.blown = !closed;
    } else if (isSwitchLike(instance)) {
      instance.params.closed = !!closed;
    } else {
      return false;
    }

    if (window.ESB.CanvasInteractions) {
      window.ESB.CanvasInteractions.renderInstances();
      window.ESB.CanvasInteractions.renderSelection();
    }
    if (window.ESB.WireTool) window.ESB.WireTool.renderWires();
    if (window.ESB.VoltageMeter) window.ESB.VoltageMeter.refresh();
    window.dispatchEvent(new CustomEvent("esb-electrical-state-change", {
      detail: { instanceId, closed: !!closed }
    }));
    return true;
  }

  function toggle(instanceId) {
    const current = getClosed(instanceId);
    return current === null ? false : setClosed(instanceId, !current);
  }

  window.ESB.ComponentState = { getClosed, setClosed, toggle };
})();
