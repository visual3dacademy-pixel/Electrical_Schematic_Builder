// Version 1.0
// Phase 3 relay-coil pickup/dropout and linked NO/NC contact state control.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const MAX_PASSES = 8;

  function groups(state) {
    const result = new Map();
    state.instances.forEach((instance) => {
      if (!instance.relayGroup) return;
      if (!result.has(instance.relayGroup)) {
        result.set(instance.relayGroup, { coil: null, contacts: [] });
      }
      const group = result.get(instance.relayGroup);
      if (instance.typeId === "coil") group.coil = instance;
      if (instance.typeId === "contact_no" || instance.typeId === "contact_nc") {
        group.contacts.push(instance);
      }
    });
    return result;
  }

  function ratedVoltage(coil) {
    const configured = Number(coil && coil.params && coil.params.ratedVoltage);
    return Number.isFinite(configured) && configured > 0 ? configured : 24;
  }

  function desiredEnergized(coil, solution) {
    if (!coil || !solution) return false;
    const volts = solution.voltageAcrossInstance(coil.id);
    const magnitude = Number.isFinite(volts) ? Math.abs(volts) : 0;
    const rated = ratedVoltage(coil);
    const currently = !!(coil.params && coil.params.energized);
    const pickup = rated * 0.8;
    const dropout = rated * 0.2;
    return currently ? magnitude > dropout : magnitude >= pickup;
  }

  function applyFromSolution(state, solution) {
    let changed = false;
    groups(state).forEach((group) => {
      if (!group.coil) return;
      group.coil.params = group.coil.params || {};
      const energized = desiredEnergized(group.coil, solution);
      if (!!group.coil.params.energized !== energized) {
        group.coil.params.energized = energized;
        changed = true;
      }

      group.contacts.forEach((contact) => {
        contact.params = contact.params || {};
        const closed = contact.typeId === "contact_nc" ? !energized : energized;
        if (contact.params.closed !== closed) {
          contact.params.closed = closed;
          changed = true;
        }
      });
    });
    return changed;
  }

  function solveUntilStable(state, solveStatic) {
    let solution = null;
    let pass = 0;
    let changed = false;
    let changedAny = false;

    for (pass = 0; pass < MAX_PASSES; pass += 1) {
      solution = solveStatic(state);
      changed = applyFromSolution(state, solution);
      changedAny = changedAny || changed;
      if (!changed) break;
    }

    if (solution) {
      solution.relayPasses = pass + 1;
      solution.relayStateChanged = changedAny;
      solution.relayStable = !changed;
      if (changed) {
        solution.diagnostics.push({
          type: "relay-not-stable",
          message: `Relay network did not stabilize within ${MAX_PASSES} passes.`
        });
      }
    }

    if (changedAny && !solveUntilStable.renderQueued) {
      solveUntilStable.renderQueued = true;
      window.requestAnimationFrame(() => {
        solveUntilStable.renderQueued = false;
        if (window.ESB.CanvasInteractions) {
          window.ESB.CanvasInteractions.renderInstances();
          window.ESB.CanvasInteractions.renderSelection();
        }
      });
    }
    return solution;
  }

  function refresh() {
    try {
      if (!window.ESB.VoltageSolver) return;
      window.ESB.VoltageSolver.solve(window.ESB.State.state);
      if (window.ESB.CanvasInteractions) {
        window.ESB.CanvasInteractions.renderInstances();
        window.ESB.CanvasInteractions.renderSelection();
      }
      if (window.ESB.VoltageMeter) window.ESB.VoltageMeter.refresh();
    } catch (error) {
      console.error("Relay refresh failed:", error);
    }
  }

  window.ESB.RelayController = {
    solveUntilStable,
    applyFromSolution,
    refresh,
    ratedVoltage
  };
})();
