// Version 0.4
//
// Temporary voltage readout for Check Circuit mode. The meter measures when
// BOTH probe tips are on valid electrical test points: visible component
// terminals (open circles) or the vertical line-voltage / low-voltage rails.
// Earth Ground is a normal terminal fixed at 0 V by the voltage solver.
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
    const targetCanvasId = canvasId || null;

    // Component terminals are checked first. This includes the built-in
    // breaker circles, load terminals, transformer terminals, TSTAT rows,
    // and the permanent Earth Ground terminal.
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
          ref: {
            kind: "terminal",
            instanceId: instance.id,
            terminalId: terminal.id
          },
          distance: G.distance(point, terminalPoint)
        });
      });
    });

    // Every vertical rail is an electrical bus. A probe can touch anywhere
    // along its rendered span, and every point on the same rail resolves to
    // the same net because engine/netlist.js intentionally ignores rail Y.
    const Sections = window.ESB.Sections;
    if (Sections && typeof Sections.getAll === "function") {
      Sections.getAll().forEach((section) => {
        [
          { side: "left", railId: section.leftRailId, x: section.leftX },
          { side: "right", railId: section.rightRailId, x: section.rightX }
        ].forEach((rail) => {
          const bounds = Sections.getRailBounds(section, rail.side);
          if (!bounds) return;

          const nearestY = Math.max(bounds.topY, Math.min(bounds.bottomY, point.y));
          const dx = point.x - rail.x;
          const dy = point.y - nearestY;
          const distance = Math.sqrt(dx * dx + dy * dy);

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
    if (!Number.isFinite(value)) return 0;

    const magnitude = Math.abs(value);

    if (Math.abs(magnitude - 240) <= 30) return 240;
    if (Math.abs(magnitude - 120) <= 20) return 120;
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

    // Both probes must be on valid test points. Valid points are component
    // terminals/open circles or any point along a rendered voltage rail.
    // A floating probe still reads 0.0 VAC.
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
