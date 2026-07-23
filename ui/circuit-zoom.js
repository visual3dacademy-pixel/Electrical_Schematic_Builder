// Version 0.3
//
// Viewport zoom control for the IDU/ODU single-canvas screens.
// 0   = the existing full-size, vertically scrollable schematic.
// 100 = fit the top line-voltage rails and bottom low-voltage rails into
//       the visible stage. The control is enabled only after a transformer
//       has created the low-voltage section.
//
// This file changes only the SVG viewport/rendered size. It does not alter
// component coordinates, wires, terminal positions, or electrical state.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const S = window.ESB.State;

  const zoomByCanvas = {
    idu: 0,
    odu: 0
  };

  let root = null;
  let range = null;
  let valueText = null;
  let resizeTimer = null;
  let mutationObserver = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getMode() {
    return window.ESB.Mode ? window.ESB.Mode.getMode() : "idu";
  }

  function getCanvasMode() {
    if (!window.ESB.Mode) return "idu";
    const mode = window.ESB.Mode.getMode();
    if (mode === "idu" || mode === "odu") return mode;
    return window.ESB.Mode.getActiveCanvasMode() || "idu";
  }

  function hasTransformer(canvasId) {
    return S.state.instances.some((instance) => instance.typeId === "transformer" && instance.canvasId === canvasId);
  }

  function isSupportedMode() {
    const mode = getMode();
    return mode === "idu" || mode === "odu" || mode === "check";
  }

  function getFullViewBox(canvasId) {
    const totalHeight = window.ESB.Sections.getTotalHeight(canvasId);
    return { x: 0, y: 0, width: C.VIEW_W, height: totalHeight };
  }

  function getFitViewBox(canvasId) {
    const main = window.ESB.Sections.getById("main", canvasId);
    const low = window.ESB.Sections.getById("lowVoltage", canvasId);

    if (!main || !low) {
      return getFullViewBox(canvasId);
    }

    // Keep a small amount of breathing room above the upper verticals and
    // below the lower verticals while making those two rail limits the
    // defining top and bottom of Zoom 100.
    // Keep the SVG viewBox anchored at y=0 so the reserved schematic
    // header band remains visible at every zoom level. The circuit rails
    // begin at y=140, so this does not cover the ladder content.
    const bottomPadding = 36;
    const top = 0;
    const bottom = low.bottomY + bottomPadding;

    return {
      x: 0,
      y: top,
      width: C.VIEW_W,
      height: bottom - top
    };
  }

  function interpolateBox(from, to, t) {
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      width: from.width + (to.width - from.width) * t,
      height: from.height + (to.height - from.height) * t
    };
  }

  function setSvgNaturalState(svg) {
    const full = getFullViewBox(getCanvasMode());
    svg.setAttribute("viewBox", `${full.x} ${full.y} ${full.width} ${full.height}`);
    svg.style.width = "100%";
    svg.style.height = "auto";
  }

  function applyZoom() {
    const svg = document.getElementById("circuitSvg");
    const scrollArea = document.getElementById("scrollArea");
    if (!svg || !scrollArea) return;

    const canvasMode = getCanvasMode();
    const available = hasTransformer(canvasMode) && !!window.ESB.Sections.getById("lowVoltage", canvasMode);
    let value = clamp(Number(zoomByCanvas[canvasMode]) || 0, 0, 100);

    if (!available || !isSupportedMode()) {
      value = 0;
    }

    if (value === 0) {
      setSvgNaturalState(svg);
      return;
    }

    const t = value / 100;
    const full = getFullViewBox(canvasMode);
    const fit = getFitViewBox(canvasMode);
    const box = interpolateBox(full, fit, t);

    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    svg.style.width = "100%";

    // At Zoom 0 the SVG keeps its original natural height and scrolls.
    // At Zoom 100 it is exactly the visible viewport height. Intermediate
    // values smoothly interpolate between those two rendered heights.
    const naturalHeight = scrollArea.clientWidth * (box.height / box.width);
    const viewportHeight = scrollArea.clientHeight;
    const renderedHeight = naturalHeight + (viewportHeight - naturalHeight) * t;
    svg.style.height = `${Math.max(1, renderedHeight)}px`;

    // The cropped viewBox supplies the vertical focus, so stale scroll
    // offsets from Zoom 0 must not shift the fitted view out of position.
    scrollArea.scrollTop = 0;
  }

  function updateControl() {
    if (!root || !range || !valueText) return;

    const mode = getMode();
    const canvasMode = getCanvasMode();
    const available = hasTransformer(canvasMode) && !!window.ESB.Sections.getById("lowVoltage", canvasMode);
    const visible = mode === "idu" || mode === "odu" || mode === "check";

    root.style.display = visible ? "flex" : "none";

    const value = available ? clamp(Number(zoomByCanvas[canvasMode]) || 0, 0, 100) : 0;
    range.value = String(value);
    range.disabled = !available;
    valueText.textContent = String(value);
    root.classList.toggle("is-disabled", !available);
    root.title = available
      ? "Zoom the line-voltage and low-voltage sections"
      : "Add a transformer to enable zoom";

    applyZoom();
  }

  function setZoom(value) {
    const canvasMode = getCanvasMode();
    zoomByCanvas[canvasMode] = clamp(Math.round(Number(value) || 0), 0, 100);
    updateControl();
  }

  function createControl() {
    const overlays = document.getElementById("overlays");
    if (!overlays || document.getElementById("circuitZoomControl")) return;

    root = document.createElement("div");
    root.id = "circuitZoomControl";
    root.className = "circuit-zoom-control is-disabled";

    const labelRow = document.createElement("div");
    labelRow.className = "circuit-zoom-label-row";

    const label = document.createElement("span");
    label.className = "circuit-zoom-label";
    label.textContent = "Zoom";

    valueText = document.createElement("span");
    valueText.className = "circuit-zoom-value";
    valueText.textContent = "0";

    labelRow.appendChild(label);
    labelRow.appendChild(valueText);

    range = document.createElement("input");
    range.id = "circuitZoomRange";
    range.className = "circuit-zoom-range";
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.value = "0";
    range.setAttribute("aria-label", "Circuit zoom");

    range.addEventListener("pointerdown", (event) => event.stopPropagation());
    range.addEventListener("input", () => setZoom(range.value));

    root.appendChild(labelRow);
    root.appendChild(range);
    overlays.appendChild(root);
  }

  function observeCircuitChanges() {
    const instancesLayer = document.getElementById("instancesLayer");
    if (!instancesLayer || mutationObserver) return;

    mutationObserver = new MutationObserver(() => {
      window.requestAnimationFrame(updateControl);
    });

    mutationObserver.observe(instancesLayer, {
      childList: true,
      subtree: true
    });
  }

  function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applyZoom, 40);
  }

  function init() {
    createControl();
    observeCircuitChanges();
    window.addEventListener("resize", handleResize);
    updateControl();
  }

  function refresh() {
    updateControl();
  }

  function reapply() {
    updateControl();
  }

  window.ESB.CircuitZoom = {
    init,
    refresh,
    reapply,
    setZoom,
    getZoom() {
      return zoomByCanvas[getCanvasMode()] || 0;
    }
  };
})();
