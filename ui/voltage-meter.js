// Version 0.3
//
// Temporary voltage readout for Check Circuit mode. The meter only measures
// when BOTH probe tips are on visible component terminal nodes (open circles).
// Wires, rails, and junction dots are not valid probe targets in this version.
// The future layered SVG meter can replace this UI without changing the
// voltage solver.

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

    S.state.instances.forEach((instance) => {
      if (instance.typeId.indexOf("meter_lead_") === 0) return;

      // Meter leads are shared overlay objects and normally have no canvasId.
      // In Check Circuit mode the probe target must instead be scoped to the
      // currently selected IDU/ODU circuit. Shared items (such as the built-in
      // breakers) remain valid on either screen.
      const targetCanvasId = canvasId || null;
      const instanceCanvasId = instance.canvasId || null;
      if (targetCanvasId && instanceCanvasId && instanceCanvasId !== targetCanvasId) return;

      const type = Lib.getType(instance.typeId);
      if (!type || !Array.isArray(type.terminals)) return;

      type.terminals.forEach((terminal) => {
        const terminalPoint = G.terminalWorldPoint(instance, terminal.id);
        candidates.push({
          ref: {
            kind: "terminal",
            instanceId: instance.id,
            terminalId: terminal.id
          },
          distance: G.distance(point, terminalPoint)
        });
      });
    });

    candidates.sort((a, b) => a.distance - b.distance);

    const nearest = candidates[0] || null;
    const hitRadius = Number(C.TERMINAL_HIT_RADIUS) || 28;

    return nearest && nearest.distance <= hitRadius ? nearest.ref : null;
  }

  function normalizeVoltage(value) {
    if (!Number.isFinite(value)) return 0;

    const magnitude = Math.abs(value);

    if (Math.abs(magnitude - 240) <= 30) return 240;
    if (Math.abs(magnitude - 24) <= 6) return 24;
    return 0;
  }

  function formatVoltage(value) {
    const normalized = normalizeVoltage(value);
    return normalized === 0 ? "0.0 VAC" : `${normalized} VAC`;
  }

  function setZeroReading() {
    displayEl.textContent = "0.0 VAC";
    displayEl.dataset.state = "waiting";
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

    const blackRef = black
      ? terminalRefAtProbe({ x: black.x, y: black.y }, activeCanvasId)
      : null;

    const redRef = red
      ? terminalRefAtProbe({ x: red.x, y: red.y }, activeCanvasId)
      : null;

    // Both probes must be on open-circle component terminals. A floating
    // probe, a probe on a wire, or a probe on a rail intentionally reads 0.0.
    if (!blackRef || !redRef) {
      setZeroReading();
      return;
    }

    try {
      const result = window.ESB.VoltageSolver.solve(S.state);
      const measured = result.voltageBetween(redRef, blackRef);
      displayEl.textContent = formatVoltage(measured);
      displayEl.dataset.state = "reading";
    } catch (error) {
      console.error("Voltage calculation failed:", error);
      setZeroReading();
      displayEl.dataset.state = "error";
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
    normalizeVoltage
  };
})();
