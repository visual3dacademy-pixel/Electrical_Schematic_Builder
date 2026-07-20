// Version 0.1
//
// Double-click an instance's glyph to rename its on-canvas label inline.
// Uses the (otherwise-unused) #overlays HTML div: since the stage's CSS
// aspect-ratio matches the SVG viewBox's aspect-ratio exactly, a
// percentage-based left/top lines up pixel-for-pixel with design
// coordinates, so no separate coordinate-conversion math is needed here.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const S = window.ESB.State;

  let activeCleanup = null;

  function closeEditor() {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
  }

  function openEditor(instance) {
    closeEditor();

    const overlays = document.getElementById("overlays");

    const input = document.createElement("input");
    input.type = "text";
    input.value = instance.label || "";
    input.style.position = "absolute";
    input.style.left = `${(instance.x / C.VIEW_W) * 100}%`;
    input.style.top = `${(instance.y / C.VIEW_H) * 100}%`;
    input.style.transform = "translate(-50%, -50%)";
    input.style.width = "100px";
    input.style.font = "700 15px Arial, Helvetica, sans-serif";
    input.style.textAlign = "center";
    input.style.border = "2px solid #2377e8";
    input.style.borderRadius = "4px";
    input.style.padding = "3px 4px";
    input.style.zIndex = "50";

    function cleanup() {
      input.removeEventListener("blur", commit);
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    }

    function commit() {
      instance.label = input.value;
      cleanup();
      window.ESB.CanvasInteractions.renderInstances();
      window.ESB.CanvasInteractions.renderSelection();
    }

    function cancel() {
      cleanup();
    }

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        commit();
        event.preventDefault();
      }

      if (event.key === "Escape") {
        cancel();
        event.preventDefault();
      }
    });

    input.addEventListener("blur", commit);

    overlays.appendChild(input);
    input.focus();
    input.select();

    activeCleanup = cleanup;
  }

  function onDoubleClick(event) {
    const instanceEl = event.target.closest("[data-instance-id]");
    if (!instanceEl) {
      return;
    }

    const instance = S.getInstance(instanceEl.dataset.instanceId);
    if (instance) {
      openEditor(instance);
    }
  }

  function init() {
    const svg = window.ESB.Drawing.getElements().svg;
    svg.addEventListener("dblclick", onDoubleClick);
  }

  window.ESB.LabelEditor = { init };
})();
