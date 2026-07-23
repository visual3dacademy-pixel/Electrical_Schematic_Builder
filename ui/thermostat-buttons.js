// Version 1.0
// Temporary Heat/Cool/Fan controls used until the full thermostat is added.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const definitions = [
    { key: "fan", label: "Fan", terminal: "G", color: "#35b94b", faint: "rgba(53,185,75,0.18)" },
    { key: "cool", label: "Cool", terminal: "Y", color: "#f4d21f", faint: "rgba(244,210,31,0.22)" },
    { key: "heat", label: "Heat", terminal: "W1", color: "#f4f4f4", faint: "rgba(255,255,255,0.72)", border: "#aeb7c3" }
  ];

  let root = null;

  function activeCanvasId() {
    return window.ESB.Mode && window.ESB.Mode.getActiveCanvasMode
      ? window.ESB.Mode.getActiveCanvasMode()
      : "idu";
  }

  function hasThermostatBlock(canvasId) {
    return window.ESB.State.state.instances.some((instance) => {
      return instance.typeId === "thermostat_block" && (instance.canvasId || "idu") === canvasId;
    });
  }

  function refresh() {
    if (!root) return;
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "idu";
    const canvasId = activeCanvasId();
    const available = hasThermostatBlock(canvasId);

    root.style.display = mode === "check" ? "flex" : "none";
    if (mode !== "check") return;

    definitions.forEach((definition) => {
      const button = root.querySelector(`[data-call="${definition.key}"]`);
      if (!button) return;
      const active = window.ESB.ThermostatControl.isActive(canvasId, definition.key);
      button.disabled = !available;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.style.background = active ? definition.color : definition.faint;
      button.style.borderColor = definition.border || definition.color;
      button.style.color = definition.key === "cool" && active ? "#111111" : "#1c2733";
      button.style.opacity = available ? "1" : "0.42";
      button.title = available
        ? `${definition.label} call (${definition.terminal})`
        : "Add TSTAT Terminals to this unit before using thermostat calls";
    });
  }

  function init() {
    const overlays = window.ESB.Drawing.getElements().overlays;
    root = document.createElement("div");
    root.id = "thermostatCallButtons";
    root.setAttribute("aria-label", "Thermostat calls");
    root.style.cssText =
      "position:absolute;left:50%;bottom:16px;transform:translateX(-50%);" +
      "z-index:26;display:none;gap:10px;align-items:center;" +
      "padding:8px 10px;border-radius:12px;background:rgba(245,247,250,0.92);" +
      "box-shadow:0 2px 9px rgba(31,45,61,0.14);";

    definitions.forEach((definition) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.call = definition.key;
      button.className = "thermostat-call-btn";
      button.innerHTML = `<span>${definition.label}</span><small>${definition.terminal}</small>`;
      button.style.cssText =
        "min-width:86px;height:48px;border:2px solid;border-radius:9px;" +
        "font:700 15px Arial,Helvetica,sans-serif;cursor:pointer;" +
        "display:flex;gap:7px;align-items:center;justify-content:center;" +
        "box-shadow:0 1px 3px rgba(0,0,0,0.09);touch-action:manipulation;";
      button.querySelector("small").style.cssText = "font-size:11px;font-weight:800;opacity:.75;";
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", () => {
        if (button.disabled) return;
        window.ESB.ThermostatControl.toggleCall(activeCanvasId(), definition.key);
      });
      root.appendChild(button);
    });

    overlays.appendChild(root);
    window.addEventListener("esb-thermostat-call-change", refresh);
    window.addEventListener("esb-mode-change", refresh);
    refresh();
  }

  window.ESB.ThermostatButtons = { init, refresh };
})();
