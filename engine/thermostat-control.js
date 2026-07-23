// Version 1.0
// Phase 3 temporary thermostat-call controls for Fan (G), Cool (Y), Heat (W1).

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const callsByCanvas = {
    idu: { fan: false, cool: false, heat: false },
    odu: { fan: false, cool: false, heat: false }
  };

  function normalizeCanvasId(canvasId) {
    return canvasId === "odu" ? "odu" : "idu";
  }

  function getCalls(canvasId) {
    const key = normalizeCanvasId(canvasId);
    return Object.assign({}, callsByCanvas[key]);
  }

  function isActive(canvasId, callName) {
    const key = normalizeCanvasId(canvasId);
    return !!callsByCanvas[key][callName];
  }

  function setCall(canvasId, callName, active) {
    const key = normalizeCanvasId(canvasId);
    if (!Object.prototype.hasOwnProperty.call(callsByCanvas[key], callName)) {
      return false;
    }

    callsByCanvas[key][callName] = !!active;
    window.dispatchEvent(new CustomEvent("esb-thermostat-call-change", {
      detail: { canvasId: key, callName, active: !!active }
    }));

    if (window.ESB.ThermostatButtons) window.ESB.ThermostatButtons.refresh();
    if (window.ESB.VoltageMeter) window.ESB.VoltageMeter.refresh();
    if (window.ESB.RelayController) window.ESB.RelayController.refresh();
    return true;
  }

  function toggleCall(canvasId, callName) {
    return setCall(canvasId, callName, !isActive(canvasId, callName));
  }

  function reset(canvasId) {
    const key = normalizeCanvasId(canvasId);
    callsByCanvas[key].fan = false;
    callsByCanvas[key].cool = false;
    callsByCanvas[key].heat = false;
    window.dispatchEvent(new CustomEvent("esb-thermostat-call-change", {
      detail: { canvasId: key, reset: true }
    }));
    if (window.ESB.ThermostatButtons) window.ESB.ThermostatButtons.refresh();
    if (window.ESB.VoltageMeter) window.ESB.VoltageMeter.refresh();
  }

  window.ESB.ThermostatControl = {
    getCalls,
    isActive,
    setCall,
    toggleCall,
    reset
  };
})();
