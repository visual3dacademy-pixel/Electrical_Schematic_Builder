// Version 0.1
//
// Open/Closed toggle for the built-in L1/L2 circuit breakers (see
// canvas-interactions.js's createBuiltInBreakers). A real 2-pole breaker
// trips both legs together, so one button drives both instances' shared
// open/closed state — there's no reason to model them independently.
//
// Toggling updates the two breaker arc elements' style directly (see
// symbols-power.js's data-breaker-arc groups) instead of going through a
// full renderInstances() — a full re-render would replace those elements
// outright, and a CSS transition can't animate an element that didn't
// exist a moment ago. The underlying data (instance.params.open) is still
// updated first, so any *other*, unrelated re-render later on renders the
// correct (already-toggled) position, just without its own animation.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const S = window.ESB.State;

  const BUTTON_W = 110;
  const BUTTON_H = 40;
  const BUTTON_Y = 55;

  function breakers() {
    return S.state.instances.filter((instance) => instance.typeId === "breaker");
  }

  function isOpen() {
    const first = breakers()[0];
    return !!(first && first.params && first.params.open);
  }

  function render() {
    const layer = document.getElementById("breakerControlLayer");
    if (!layer) {
      return;
    }

    D.clearGroup(layer);

    const main = window.ESB.Sections.getById("main");
    if (!main) {
      return;
    }

    const open = isOpen();
    const centerX = main.leftX;

    const btn = D.group(
      { "data-breaker-toggle": "true", style: "cursor:pointer;" },
      layer
    );

    D.rect(
      centerX - BUTTON_W / 2,
      BUTTON_Y - BUTTON_H / 2,
      BUTTON_W,
      BUTTON_H,
      {
        rx: 8,
        fill: open ? "#c0392b" : "#2f9e44",
        stroke: "none"
      },
      btn
    );

    D.text(
      centerX,
      BUTTON_Y,
      open ? "OPEN" : "CLOSED",
      15,
      800,
      "#ffffff",
      { "pointer-events": "none" },
      btn
    );
  }

  // Flips the shared state and animates both breakers' arcs to match,
  // without disturbing anything else on the canvas.
  function toggle() {
    const nextOpen = !isOpen();

    breakers().forEach((instance) => {
      instance.params = instance.params || {};
      instance.params.open = nextOpen;

      const arcGroup = document.querySelector(`[data-breaker-arc="${instance.id}"]`);
      if (arcGroup) {
        arcGroup.style.transform = `translate(0px,${nextOpen ? "-10px" : "0px"})`;
      }
    });

    render();
  }

  window.ESB.BreakerControl = { render, toggle };
})();
