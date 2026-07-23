// Version 1.0
(function () {
  "use strict";
  window.ESB = window.ESB || {};
  function refresh() {
    const root = document.getElementById("canvasActionControls");
    if (!root || !window.ESB.Mode) return;
    const mode = window.ESB.Mode.getMode();
    root.style.display = mode === "idu" || mode === "odu" || mode === "check" ? "flex" : "none";
    if (window.ESB.History) window.ESB.History.refresh();
  }
  function init() {
    const overlays = document.getElementById("overlays");
    const root = document.createElement("div");
    root.id = "canvasActionControls";
    root.className = "canvas-action-controls";
    const undo = document.createElement("button");
    undo.id = "undoCanvasButton"; undo.type = "button"; undo.textContent = "Undo";
    undo.addEventListener("pointerdown", (e) => e.stopPropagation());
    undo.addEventListener("click", () => window.ESB.History.undo());
    const clear = document.createElement("button");
    clear.type = "button"; clear.textContent = "Clear";
    clear.addEventListener("pointerdown", (e) => e.stopPropagation());
    clear.addEventListener("click", () => window.ESB.History.clearCanvas());
    root.append(undo, clear); overlays.appendChild(root); refresh();
  }
  window.ESB.CanvasControls = { init, refresh };
})();
