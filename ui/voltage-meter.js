// Version 1.0
// Full electrical-engine voltage readout for Check Circuit mode.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const G = window.ESB.Geometry;
  const S = window.ESB.State;
  const C = window.ESB.Config;

  let displayEl = null;
  let timer = null;

  function getLead(typeId) {
    return S.state.instances.find((instance) => instance.typeId === typeId) || null;
  }

  function terminalRefAtProbe(point, canvasId) {
    if (!point) return null;

    const Lib = window.ESB.SymbolLibrary;
    const candidates = [];
    const targetCanvasId = canvasId || null;

    S.state.instances.forEach((instance) => {
      if (instance.typeId.indexOf("meter_lead_") === 0) return;
      const instanceCanvasId = instance.canvasId || null;
      if (targetCanvasId && instanceCanvasId && instanceCanvasId !== targetCanvasId) return;

      const type = Lib.getType(instance.typeId);
      if (!type || !Array.isArray(type.terminals)) return;

      type.terminals.forEach((terminal) => {
        const terminalPoint = G.terminalWorldPoint(instance, terminal.id);
        if (!terminalPoint) return;
        candidates.push({
          priority: 0,
          ref: { kind: "terminal", instanceId: instance.id, terminalId: terminal.id },
          distance: G.distance(point, terminalPoint)
        });
      });
    });

    const Sections = window.ESB.Sections;
    if (Sections && typeof Sections.getAll === "function") {
      Sections.getAll(targetCanvasId).forEach((section) => {
        [
          { side: "left", railId: section.leftRailId, x: section.leftX },
          { side: "right", railId: section.rightRailId, x: section.rightX }
        ].forEach((rail) => {
          const bounds = Sections.getRailBounds(section, rail.side);
          if (!bounds) return;
          const nearestY = Math.max(bounds.topY, Math.min(bounds.bottomY, point.y));
          const distance = Math.hypot(point.x - rail.x, point.y - nearestY);
          candidates.push({
            priority: 1,
            ref: { kind: "rail", railId: rail.railId, y: nearestY },
            distance
          });
        });
      });
    }

    candidates.sort((a, b) => {
      if (Math.abs(a.distance - b.distance) > 0.001) return a.distance - b.distance;
      return a.priority - b.priority;
    });

    const nearest = candidates[0] || null;
    const hitRadius = Number(C.TERMINAL_HIT_RADIUS) || 28;
    return nearest && nearest.distance <= hitRadius ? nearest.ref : null;
  }

  function normalizeVoltage(value) {
    if (!Number.isFinite(value)) return null;
    const magnitude = Math.abs(value);
    if (magnitude < 0.05) return 0;
    if (Math.abs(magnitude - 24) <= 0.75) return 24;
    if (Math.abs(magnitude - 120) <= 1.5) return 120;
    if (Math.abs(magnitude - 240) <= 2.5) return 240;
    return Math.round(magnitude * 10) / 10;
  }

  function formatMeasurement(measurement) {
    if (!measurement || !measurement.valid) return "— VAC";
    const value = normalizeVoltage(measurement.voltsRms);
    if (value === null) return "— VAC";
    return value === 0 ? "0.0 VAC" : `${value} VAC`;
  }

  function setWaiting() {
    displayEl.textContent = "0.0 VAC";
    displayEl.dataset.state = "waiting";
    displayEl.title = "Place both probes on electrical test points";
  }

  function refresh() {
    if (!displayEl) return;

    const inCheckMode = window.ESB.Mode && window.ESB.Mode.getMode() === "check";
    displayEl.style.display = inCheckMode ? "block" : "none";
    if (!inCheckMode) return;

    const black = getLead("meter_lead_black");
    const red = getLead("meter_lead_red");
    const activeCanvasId = window.ESB.Mode && window.ESB.Mode.getActiveCanvasMode
      ? window.ESB.Mode.getActiveCanvasMode()
      : null;

    const blackRef = black ? terminalRefAtProbe({ x: black.x, y: black.y }, activeCanvasId) : null;
    const redRef = red ? terminalRefAtProbe({ x: red.x, y: red.y }, activeCanvasId) : null;

    if (!blackRef || !redRef) {
      setWaiting();
      return;
    }

    try {
      const solution = window.ESB.VoltageSolver.solve(S.state);
      const measurement = solution.measureVoltage(redRef, blackRef);
      displayEl.textContent = formatMeasurement(measurement);
      displayEl.dataset.state = measurement.valid ? "reading" : "floating";
      displayEl.title = measurement.valid
        ? `${measurement.voltsRms.toFixed(3)} VAC calculated`
        : `Measurement unavailable: ${measurement.reason}`;
    } catch (error) {
      console.error("Voltage calculation failed:", error);
      displayEl.textContent = "ERR";
      displayEl.dataset.state = "error";
      displayEl.title = error.message;
    }
  }

  function init() {
    const overlays = window.ESB.Drawing.getElements().overlays;
    displayEl = document.createElement("div");
    displayEl.id = "voltageReadout";
    displayEl.setAttribute("aria-live", "polite");
    displayEl.textContent = "0.0 VAC";
    overlays.appendChild(displayEl);
    timer = window.setInterval(refresh, 120);
    refresh();
  }

  function destroy() {
    if (timer) window.clearInterval(timer);
    timer = null;
    if (displayEl) displayEl.remove();
    displayEl = null;
  }

  window.ESB.VoltageMeter = {
    init,
    refresh,
    destroy,
    terminalRefAtProbe,
    normalizeVoltage,
    formatMeasurement
  };
})();
