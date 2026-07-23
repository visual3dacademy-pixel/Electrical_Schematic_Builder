// Version 0.3
// Canvas-scoped breaker control and dynamic schematic header.
//
// The header is drawn inside the SVG's reserved top band (y = 0..110),
// while the circuit rails begin at y = 140. Because the zoom viewBox is
// always anchored at y = 0, the header remains visible at every zoom level
// without floating over the ladder or drifting away from the rail geometry.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const S = window.ESB.State;

  const HEADER = {
    buttonWidth: 180,
    buttonHeight: 58,
    buttonY: 20,
    titleY: 45,
    subtitleY: 82
  };

  function activeCanvasId() {
    if (!window.ESB.Mode) return "idu";
    const mode = window.ESB.Mode.getMode();
    if (mode === "idu" || mode === "odu") return mode;
    return window.ESB.Mode.getActiveCanvasMode() || "idu";
  }

  function breakers(canvasId) {
    return S.state.instances.filter(
      (instance) => instance.typeId === "breaker" && instance.canvasId === canvasId
    );
  }

  function isOpen(canvasId) {
    const first = breakers(canvasId)[0];
    return !!(first && first.params && first.params.open);
  }

  function updateBreakerArcs(canvasId, open) {
    breakers(canvasId).forEach((instance) => {
      instance.params = instance.params || {};
      instance.params.open = open;

      document
        .querySelectorAll(`[data-breaker-arc="${instance.id}"]`)
        .forEach((arcGroup) => {
          arcGroup.style.transform = `translate(0px,${open ? "-10px" : "0px"})`;
        });
    });
  }

  function toggle(canvasId) {
    const id = canvasId || activeCanvasId();
    updateBreakerArcs(id, !isOpen(id));
    render();

    if (window.ESB.Mode && window.ESB.Mode.getMode() === "split") {
      window.ESB.Mode.refreshSplitCanvases();
    }
  }

  function drawHeader(parent, canvasId, options) {
    if (!parent) return;

    const opts = options || {};
    const main = window.ESB.Sections.getById("main", canvasId);
    if (!main) return;

    D.clearGroup(parent);

    const centerX = (main.leftX + main.rightX) / 2;
    const open = isOpen(canvasId);
    const unitTitle = canvasId === "odu" ? "Outdoor Unit" : "Indoor Unit";

    // The group is entirely contained in the reserved top band. Nothing
    // extends below y=100, leaving clear separation before rails at y=140.
    const headerGroup = D.group(
      {
        "data-circuit-header": canvasId,
        style: "user-select:none;"
      },
      parent
    );

    const buttonX = main.leftX - HEADER.buttonWidth / 2;
    const button = D.group(
      {
        role: "button",
        tabindex: "0",
        "aria-label": `${unitTitle} circuit breaker ${open ? "open" : "closed"}. Activate to toggle.`,
        style: "cursor:pointer;"
      },
      headerGroup
    );

    D.rect(
      buttonX,
      HEADER.buttonY,
      HEADER.buttonWidth,
      HEADER.buttonHeight,
      {
        rx: 12,
        ry: 12,
        fill: open ? "#c0392b" : "#2f9e44",
        stroke: "none",
        style: "filter:drop-shadow(0 3px 5px rgba(0,0,0,.20));"
      },
      button
    );

    D.text(
      main.leftX,
      HEADER.buttonY + HEADER.buttonHeight / 2 + 1,
      open ? "OPEN" : "CLOSED",
      23,
      900,
      "#ffffff",
      { "pointer-events": "none" },
      button
    );

    const activate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle(canvasId);
    };

    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", activate);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });

    D.text(centerX, HEADER.titleY, unitTitle, 34, 900, "#111111", {
      "pointer-events": "none"
    }, headerGroup);

    D.text(centerX, HEADER.subtitleY, "Earth Ground", 21, 800, "#2a3340", {
      "pointer-events": "none"
    }, headerGroup);

    // In split mode the panel already has an external title bar. The SVG
    // header is still used for the breaker and ground relationship, but a
    // caller may hide the duplicate unit title if desired.
    if (opts.hideTitle) {
      const titleNode = headerGroup.querySelector("text:nth-of-type(2)");
      if (titleNode) titleNode.setAttribute("visibility", "hidden");
    }
  }

  function render() {
    // Remove the old fixed HTML overlay from v2.8 if it is still present.
    const oldOverlay = document.getElementById("fixedCircuitHeader");
    if (oldOverlay) oldOverlay.remove();

    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "idu";
    const layer = document.getElementById("breakerControlLayer");

    if (layer) {
      if (mode === "idu" || mode === "odu" || mode === "check") {
        drawHeader(layer, activeCanvasId());
      } else {
        D.clearGroup(layer);
      }
    }
  }

  window.ESB.BreakerControl = {
    render,
    toggle,
    drawHeader,
    isOpen
  };
})();
