// Version 1.0
// Five-step, canvas-scoped undo history. Split screen intentionally has no controls.
(function () {
  "use strict";
  window.ESB = window.ESB || {};
  const stacks = { idu: [], odu: [] };
  const MAX = 5;
  let last = { idu: null, odu: null };
  let timer = null;
  let restoring = false;

  function modeCanvas() {
    if (!window.ESB.Mode) return "idu";
    const mode = window.ESB.Mode.getMode();
    if (mode === "idu" || mode === "odu") return mode;
    return window.ESB.Mode.getActiveCanvasMode ? window.ESB.Mode.getActiveCanvasMode() : "idu";
  }
  function snapshot(id) {
    return { state: window.ESB.State.exportCanvas(id), sections: window.ESB.Sections.exportCanvas(id) };
  }
  function signature(v) { return JSON.stringify(v); }
  function seed() {
    ["idu", "odu"].forEach((id) => { last[id] = snapshot(id); });
    refresh();
    window.setInterval(observe, 900);
  }
  function observe() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (restoring) return;
      ["idu", "odu"].forEach((id) => {
        const now = snapshot(id);
        if (last[id] && signature(now) !== signature(last[id])) {
          stacks[id].push(last[id]);
          if (stacks[id].length > MAX) stacks[id].shift();
          last[id] = now;
        }
      });
      refresh();
    }, 420);
  }
  function undo() {
    const id = modeCanvas();
    const previous = stacks[id].pop();
    if (!previous) return;
    restoring = true;
    window.ESB.State.importCanvas(id, previous.state);
    window.ESB.Sections.importCanvas(id, previous.sections);
    last[id] = snapshot(id);
    window.ESB.relayout();
    window.ESB.CanvasInteractions.renderInstances();
    window.ESB.CanvasInteractions.renderSelection();
    window.ESB.WireTool.renderWires();
    window.ESB.Palette.render();
    setTimeout(() => { restoring = false; refresh(); }, 0);
  }
  function clearCanvas() {
    const id = modeCanvas();
    const name = id === "idu" ? "Indoor Unit" : "Outdoor Unit";
    if (!window.confirm(`Clear the ${name} schematic?`)) return;
    const before = snapshot(id);
    stacks[id].push(before);
    if (stacks[id].length > MAX) stacks[id].shift();
    const mainOnly = window.ESB.Sections.exportCanvas(id).filter((section) => section.id === "main");
    window.ESB.State.importCanvas(id, { instances: [], wires: [], junctions: [] });
    window.ESB.Sections.importCanvas(id, mainOnly);
    last[id] = snapshot(id);
    window.ESB.relayout();
    window.ESB.CanvasInteractions.renderInstances();
    window.ESB.CanvasInteractions.renderSelection();
    window.ESB.WireTool.renderWires();
    window.ESB.Palette.render();
    refresh();
  }
  function refresh() {
    const button = document.getElementById("undoCanvasButton");
    if (button) button.disabled = stacks[modeCanvas()].length === 0;
  }
  window.ESB.History = { seed, observe, undo, clearCanvas, refresh };
})();
