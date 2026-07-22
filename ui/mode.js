// Version 0.8
//
// Mode system: build, check, idu, odu, split
// - build: Full circuit builder (default)
// - check: Fieldpiece meter in left panel, probes on canvas (read-only circuit)
// - idu: Indoor Unit single screen
// - odu: Outdoor Unit single screen
// - split: Both IDU and ODU side-by-side, drag components between them

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const S = window.ESB.State;

  // Indoor Unit is the opening screen — not "build" (the original
  // unrestricted single-canvas editor, still reachable internally but no
  // longer a normal entry point now that IDU/ODU/Split are the primary
  // flow).
  let mode = "idu";
  let activeCanvasMode = "idu";

  function getMode() {
    return mode;
  }

  function getActiveCanvasMode() {
    return activeCanvasMode;
  }

  // Meter graphic is opaque reference art (like the leads — see
  // symbols/symbols-meter.js), not traced into path data. Scaled to the
  // palette strip's width (the more constraining dimension here) and
  // centered in the taller space that leaves.
  function renderMeterPanel() {
    const layer = document.getElementById("paletteLayer");
    D.clearGroup(layer);

    D.rect(0, 0, C.PALETTE_W, C.VIEW_H, { fill: "#f5f7fa", stroke: "none" }, layer);
    D.line(C.PALETTE_W, 0, C.PALETTE_W, C.VIEW_H, { stroke: "#c7cfd9", width: 2 }, layer);
    D.text(C.PALETTE_W / 2, 24, "Check Circuit", 16, 800, "#2a3340", {}, layer);

    const METER_NATIVE_W = 364.42;
    const METER_NATIVE_H = 1247.82;
    const width = C.PALETTE_W - 20;
    const height = width * (METER_NATIVE_H / METER_NATIVE_W);
    const x = (C.PALETTE_W - width) / 2;
    const y = Math.max(40, (C.VIEW_H - height) / 2);

    D.image(
      "SVG/Fieldpiece%20SC480.svg",
      x,
      y,
      width,
      height,
      { preserveAspectRatio: "xMidYMid meet", style: "pointer-events:none;" },
      layer
    );
  }

  // The two probe leads are created once, the first time Check Circuit is
  // entered, then just persist (hidden, inert) across later mode switches
  // — same "auto-created once" pattern as the built-in circuit breakers.
  function ensureLeads() {
    const hasLeads = S.state.instances.some((instance) => instance.typeId === "meter_lead_black");
    if (hasLeads) {
      return;
    }

    const startX = C.PALETTE_W + 140;

    const black = S.createInstance("meter_lead_black", startX, 260, { label: "" });
    black.rotation = 0;

    const red = S.createInstance("meter_lead_red", startX + 90, 260, { label: "" });
    red.rotation = 0;
  }

  function applyMode() {
    const paletteSvg = document.getElementById("paletteSvg");
    const circuitSvg = document.getElementById("circuitSvg");
    const scrollArea = document.getElementById("scrollArea");
    const splitContainer = document.getElementById("splitCanvasContainer");

    // Clear selection when switching modes
    S.select(null);
    S.selectWire(null);

    // Adjust scrollArea for split mode
    if (scrollArea) {
      if (mode === "split") {
        scrollArea.style.overflow = "hidden";
        scrollArea.style.display = "flex";
        scrollArea.style.flexDirection = "column";
      } else {
        scrollArea.style.overflow = "auto";
        scrollArea.style.display = "block";
        scrollArea.style.flexDirection = "";
      }
    }

    // Hide split container when not in split mode
    if (splitContainer) {
      splitContainer.style.display = mode === "split" ? "flex" : "none";
    }

    // Show/hide main canvas based on mode
    if (circuitSvg) {
      circuitSvg.style.display = mode === "split" ? "none" : "block";
    }

    if (mode === "check") {
      if (paletteSvg) paletteSvg.style.display = "block";
      ensureLeads();
      renderMeterPanel();
      renderModeLabel(activeCanvasMode === "idu" ? "Indoor Unit" : "Outdoor Unit");
      window.ESB.CanvasInteractions.renderInstances();
      window.ESB.CanvasInteractions.renderSelection();
    } else if (mode === "idu" || mode === "odu") {
      // Single canvas mode (IDU or ODU)
      if (paletteSvg) paletteSvg.style.display = "block";
      renderSingleCanvasMode(mode);
      window.ESB.Palette.render();
      window.ESB.CanvasInteractions.renderInstances();
      window.ESB.CanvasInteractions.renderSelection();
    } else if (mode === "split") {
      // Palette stays visible in split mode too — it's the only way to
      // add new components to either panel, since neither IDU nor ODU
      // canvas carries its own palette strip. No title text here — split
      // mode intentionally shows neither panel's name.
      clearModeLabel();
      if (paletteSvg) paletteSvg.style.display = "block";
      window.ESB.Palette.render();
      renderSplitCanvasMode();
    } else {
      // Build mode (default)
      clearModeLabel();
      if (paletteSvg) paletteSvg.style.display = "block";
      window.ESB.Palette.render();
      window.ESB.CanvasInteractions.renderInstances();
      window.ESB.CanvasInteractions.renderSelection();
    }

    if (paletteSvg) {
      paletteSvg.setAttribute("data-mode", mode);
    }

    if (window.ESB.CircuitZoom) {
      window.ESB.CircuitZoom.refresh();
    }
  }

  // "Indoor Unit"/"Outdoor Unit", drawn directly into the main circuitSvg
  // at top-center between L1 and L2 — not a separate HTML overlay, so it
  // scrolls/scales with the rest of the ladder exactly like the "L1"/"L2"
  // rail labels do. Split mode intentionally shows neither this nor any
  // other title (see renderSplitCanvasMode) — only the two single-canvas
  // modes need to say which unit they are.
  function ensureModeLabelLayer() {
    const svg = document.getElementById("circuitSvg");
    return document.getElementById("modeLabelLayer") || D.group({ id: "modeLabelLayer" }, svg);
  }

  function renderModeLabel(text) {
    const layer = ensureModeLabelLayer();
    D.clearGroup(layer);

    const main = window.ESB.Sections.getById("main");
    if (!main || !text) {
      return;
    }

    const centerX = (main.leftX + main.rightX) / 2;
    D.text(centerX, 40, text, 24, 800, "#111111", {}, layer);
    D.text(centerX, 72, "Earth Ground", 16, 700, "#2a3340", {}, layer);
  }

  function clearModeLabel() {
    const layer = document.getElementById("modeLabelLayer");
    if (layer) {
      D.clearGroup(layer);
    }
  }

  function renderSingleCanvasMode(canvasMode) {
    renderModeLabel(canvasMode === "idu" ? "Indoor Unit" : "Outdoor Unit");
  }

  // Split screen always reserves the SAME height a low-voltage section
  // would need — matching Sections.getTotalHeight()'s own formula, just
  // computed from fixed Config values instead of the live section list —
  // so the two panels never resize themselves the moment a transformer
  // gets added; the space is already there either way.
  function splitFixedHeight() {
    const mainRailLength = C.BOTTOM_RAIL_Y - C.TOP_RAIL_Y;
    return C.BOTTOM_RAIL_Y + C.SECTION_GAP + mainRailLength + 80;
  }

  // Shifts the viewBox's own min-x so the rails (which sit at 360/1860,
  // not symmetric within the full 1920 width) render with equal left/
  // right margins — otherwise the ladder reads as pushed off-center
  // within the (now much narrower, since split into two columns) panel.
  function splitViewBoxMinX() {
    const main = window.ESB.Sections.getById("main");
    if (!main) {
      return 0;
    }
    const railSpan = main.rightX - main.leftX;
    const margin = (C.VIEW_W - railSpan) / 2;
    return main.leftX - margin;
  }

  function createSplitPanel(id, title) {
    const container = document.createElement("div");
    container.id = `${id}CanvasContainer`;
    container.style.cssText =
      "flex:1;position:relative;overflow:hidden;background:#ffffff;display:flex;flex-direction:column;min-width:0;";

    const header = document.createElement("div");
    header.textContent = title;
    header.style.cssText =
      "flex-shrink:0;padding:10px;text-align:center;font:800 18px Arial, Helvetica, sans-serif;color:#111111;background:#ffffff;";

    const svgWrapper = document.createElement("div");
    svgWrapper.style.cssText = "flex:1;position:relative;overflow:hidden;";

    const svg = document.createElementNS(C.SVG_NS, "svg");
    svg.setAttribute("id", `${id}CircuitSvg`);
    svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    // pinch-zoom (not none): see the matching #circuitSvg comment in
    // styles.css — keeps single-finger drag under our own pointer-event
    // logic while still letting the browser handle two-finger pinch-zoom.
    svg.style.cssText =
      "display:block;width:100%;height:100%;touch-action:pinch-zoom;user-select:none;background:#ffffff;";

    svgWrapper.appendChild(svg);
    container.appendChild(header);
    container.appendChild(svgWrapper);

    return container;
  }

  function renderSplitCanvasMode() {
    const scrollArea = document.getElementById("scrollArea");
    const paletteSvg = document.getElementById("paletteSvg");

    if (paletteSvg) paletteSvg.style.display = "block";

    // Create split container if it doesn't exist
    let splitContainer = document.getElementById("splitCanvasContainer");
    if (!splitContainer) {
      splitContainer = document.createElement("div");
      splitContainer.id = "splitCanvasContainer";
      // Starts to the right of the palette strip (same width the palette
      // itself uses — see #paletteSvg in styles.css) rather than at inset:0,
      // since the palette stays visible/usable in split mode too. Column
      // layout: the two panels on top, a fixed instruction box below them.
      const paletteLeftPct = (C.PALETTE_W / C.VIEW_W) * 100;
      splitContainer.style.cssText =
        `position:absolute;top:0;left:${paletteLeftPct}%;right:0;bottom:0;display:flex;flex-direction:column;background:#ffffff;overflow:hidden;`;

      const panelsRow = document.createElement("div");
      panelsRow.id = "splitPanelsRow";
      panelsRow.style.cssText = "flex:1;display:flex;min-height:0;";

      const iduContainer = createSplitPanel("idu", "Indoor Unit");
      iduContainer.style.borderRight = "2px solid #d8dee6";
      const oduContainer = createSplitPanel("odu", "Outdoor Unit");

      panelsRow.appendChild(iduContainer);
      panelsRow.appendChild(oduContainer);

      // Centered and narrower than the panels above (not full-width) so it
      // reads as its own callout rather than a footer bar — static rules
      // text, present the whole time split mode is active rather than
      // being cleared/reused for anything dynamic.
      const instructionBox = document.createElement("div");
      instructionBox.id = "splitInstructionBox";
      instructionBox.style.cssText =
        "flex-shrink:0;width:60%;max-width:640px;min-height:170px;margin:12px auto;" +
        "border:2px solid #2377e8;border-radius:8px;padding:16px 24px;box-sizing:border-box;" +
        "display:flex;flex-direction:column;justify-content:center;color:#5a6472;" +
        "font:600 14px/1.6 Arial, Helvetica, sans-serif;background:#f8fafc;";
      instructionBox.innerHTML =
        '<div style="font-weight:800;color:#2a3340;margin-bottom:8px;">Split Screen functions:</div>' +
        '<ul style="margin:0;padding-left:22px;">' +
        "<li>Components can be dragged between screens</li>" +
        "<li>Transformer and TSTAT Terminals are added in IDU &amp; ODU screens</li>" +
        "</ul>";

      splitContainer.appendChild(panelsRow);
      splitContainer.appendChild(instructionBox);

      scrollArea.appendChild(splitContainer);

      // Force layout recalculation
      setTimeout(() => {
        renderSplitCanvas("idu");
        renderSplitCanvas("odu");
      }, 50);
    } else {
      // If container already exists, just re-render
      renderSplitCanvas("idu");
      renderSplitCanvas("odu");
    }
  }

  // Called by canvas-interactions.js after placing/moving a component
  // while in split mode — the split panels are separate SVGs the general
  // CanvasInteractions.renderInstances() never touches, so they need their
  // own explicit re-render on every change.
  function refreshSplitCanvases() {
    if (mode === "split") {
      renderSplitCanvas("idu");
      renderSplitCanvas("odu");
    }
  }

  function renderSplitCanvas(canvasId) {
    const svgId = canvasId === "idu" ? "iduCircuitSvg" : "oduCircuitSvg";
    const svgElement = document.getElementById(svgId);

    if (!svgElement) return;

    // Fixed height (as if a low-voltage section always existed) and a
    // shifted min-x so the rails render centered — recomputed every call
    // since a transformer placed after the first render doesn't change
    // the height, but the centering math depends on Sections existing.
    const minX = splitViewBoxMinX();
    svgElement.setAttribute("viewBox", `${minX} 0 ${C.VIEW_W} ${splitFixedHeight()}`);

    // Clear and render instances for this canvas
    D.clearGroup(svgElement);

    // Create layers (order matters: rails first, then wires, then instances, then selection)
    const railsLayer = D.group({ id: `${canvasId}RailsLayer` }, svgElement);
    const wiresLayer = D.group({ id: `${canvasId}WiresLayer` }, svgElement);
    const instancesLayer = D.group({ id: `${canvasId}InstancesLayer` }, svgElement);
    const selectionLayer = D.group({ id: `${canvasId}SelectionLayer` }, svgElement);

    // Render rails (power rails) for this canvas
    const main = window.ESB.Sections.getById("main");
    if (main) {
      const centerX = (main.leftX + main.rightX) / 2;
      D.text(centerX, 52, "Earth Ground", 16, 700, "#2a3340", {}, railsLayer);

      // Draw L1 (left) rail
      D.line(main.leftX, main.topY, main.leftX, main.bottomY,
        { stroke: "#000000", width: 3 }, railsLayer);
      D.text(main.leftX - 20, main.topY - 10, "L1", 14, 700, "#000000", {}, railsLayer);

      // Draw L2 (right) rail
      D.line(main.rightX, main.topY, main.rightX, main.bottomY,
        { stroke: "#000000", width: 3 }, railsLayer);
      D.text(main.rightX + 10, main.topY - 10, "L2", 14, 700, "#000000", {}, railsLayer);

      // Same faint snap-row guide lines the main canvas shows (see
      // Sections.renderAll) — split mode components/wires snap onto the
      // identical rows, so the guides need to be visible here too.
      window.ESB.Sections.getSnapRows(main).forEach((rowY) => {
        D.line(
          main.leftX, rowY, main.rightX, rowY,
          { stroke: "#d3dae3", width: 1, "stroke-dasharray": "4 4" },
          railsLayer
        );
      });
    }

    // The low-voltage section (once a transformer exists) has its own
    // rails/rows too, and the fixed panel height already reserves room
    // for it whether or not it actually exists yet.
    const lowSection = window.ESB.Sections.getById("lowVoltage");
    if (lowSection) {
      D.line(lowSection.leftX, lowSection.topY, lowSection.leftX, lowSection.bottomY,
        { stroke: "#000000", width: 3 }, railsLayer);
      D.text(lowSection.leftX - 20, lowSection.topY - 10, lowSection.leftLabel, 14, 700, "#000000", {}, railsLayer);

      D.line(lowSection.rightX, lowSection.topY, lowSection.rightX, lowSection.bottomY,
        { stroke: "#000000", width: 3 }, railsLayer);
      D.text(lowSection.rightX + 10, lowSection.topY - 10, lowSection.rightLabel, 14, 700, "#000000", {}, railsLayer);

      window.ESB.Sections.getSnapRows(lowSection).forEach((rowY) => {
        D.line(
          lowSection.leftX, rowY, lowSection.rightX, rowY,
          { stroke: "#d3dae3", width: 1, "stroke-dasharray": "4 4" },
          railsLayer
        );
      });
    }

    // The whole schematic — wires included, not just components — so the
    // panel matches what the single-canvas IDU/ODU view itself shows.
    window.ESB.WireTool.renderWiresForCanvas(wiresLayer, canvasId);

    const Lib = window.ESB.SymbolLibrary;
    const G = window.ESB.Geometry;

    // Filter and render instances for this canvas only
    S.state.instances.forEach((instance) => {
      if (instance.typeId === "meter_lead_black" || instance.typeId === "meter_lead_red") {
        return; // Skip meter leads in split mode
      }

      if (!instance.canvasId || instance.canvasId === canvasId) {
        const type = Lib.getType(instance.typeId);
        const glyphGroup = D.group(
          {
            "data-instance-id": instance.id,
            transform: `translate(${instance.x},${instance.y}) rotate(${instance.rotation}) scale(${instance.mirrored ? -1 : 1},1)`,
            style: "cursor:grab;"
          },
          instancesLayer
        );

        D.rect(
          -type.width / 2,
          -type.height / 2,
          type.width,
          type.height,
          { fill: "transparent", stroke: "none" },
          glyphGroup
        );

        Lib.drawInstance(glyphGroup, type, instance);

        if (type.labelAnchor) {
          const labelWorld = G.localToWorld(type.labelAnchor, instance);
          D.text(
            labelWorld.x,
            labelWorld.y,
            instance.label,
            15,
            700,
            "#1a2230",
            { "pointer-events": "none" },
            instancesLayer
          );
        }
      }
    });
  }

  function setMode(nextMode) {
    const validModes = ["build", "check", "idu", "odu", "split"];
    if (!validModes.includes(nextMode)) {
      return;
    }

    if (nextMode === "idu" || nextMode === "odu") {
      activeCanvasMode = nextMode;
    }

    mode = nextMode;
    applyMode();
    updateModeButtons();
  }

  function setCheckCanvas(canvasMode) {
    if (canvasMode !== "idu" && canvasMode !== "odu") return;
    activeCanvasMode = canvasMode;

    if (mode === "check") {
      applyMode();
      updateModeButtons();
      if (window.ESB.VoltageMeter) window.ESB.VoltageMeter.refresh();
    }
  }

  function updateModeButtons() {
    const iduBtn = document.getElementById("modeIduButton");
    const oduBtn = document.getElementById("modeOduButton");
    const splitBtn = document.getElementById("modeSplitButton");
    const checkBtn = document.getElementById("modeCheckButton");

    // Only two of the three canvas-mode buttons are ever shown at once —
    // whichever two are NOT the current mode (e.g. in IDU, only "ODU" and
    // "Split Screen" appear). If the current mode isn't one of the three
    // (build/check), default to offering the two single-canvas entry
    // points and hide Split Screen.
    const buttonsByKey = { idu: iduBtn, odu: oduBtn, split: splitBtn };
    const hiddenKey = mode === "check"
      ? activeCanvasMode
      : (buttonsByKey[mode] ? mode : "split");

    Object.keys(buttonsByKey).forEach((key) => {
      const btn = buttonsByKey[key];
      if (btn) {
        btn.style.display = key === hiddenKey ? "none" : "";
      }
    });

    // Update check button - disabled in split mode
    if (checkBtn) {
      const isCheckMode = mode === "check";
      const isSplitMode = mode === "split";

      checkBtn.textContent = isCheckMode ? "Build Circuit" : "Check Circuit";
      checkBtn.style.opacity = isSplitMode ? "0.5" : "1";
      checkBtn.disabled = isSplitMode;
      checkBtn.title = isSplitMode ? "Check Circuit not available in Split Screen mode" : "";
    }
  }

  function createModeButton(id, label, onClick) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "mode-btn";
    button.textContent = label;

    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    button.addEventListener("click", onClick);
    return button;
  }

  function init() {
    const overlays = D.getElements().overlays;

    // Single bottom-left stack: the two visible canvas-mode buttons
    // (row 1) and Check Circuit (row 2) below them. align-items:center on
    // the column is what actually centers the (narrower) button row over
    // the (wider) Check Circuit button, rather than both being
    // independently left-anchored at the same x.
    const bottomBar = document.createElement("div");
    bottomBar.id = "modeBottomBar";
    bottomBar.style.cssText =
      "position:absolute;left:16px;bottom:16px;z-index:25;display:flex;flex-direction:column;align-items:center;gap:8px;";

    // Container for the two visible canvas-mode buttons (of IDU/ODU/Split —
    // see updateModeButtons, which always hides exactly one of the three).
    const modeContainer = document.createElement("div");
    modeContainer.id = "modeButtonContainer";
    modeContainer.style.cssText = "display:flex;gap:8px;";

    const iduBtn = createModeButton("modeIduButton", "IDU", () => {
      if (mode === "check") setCheckCanvas("idu");
      else setMode("idu");
    });
    const oduBtn = createModeButton("modeOduButton", "ODU", () => {
      if (mode === "check") setCheckCanvas("odu");
      else setMode("odu");
    });
    const splitBtn = createModeButton("modeSplitButton", "Split Screen", () => setMode("split"));

    modeContainer.appendChild(iduBtn);
    modeContainer.appendChild(oduBtn);
    modeContainer.appendChild(splitBtn);

    // Check Circuit button (below the canvas mode buttons)
    const checkButton = document.createElement("button");
    checkButton.id = "modeCheckButton";
    checkButton.type = "button";
    checkButton.className = "mode-toggle-btn";
    checkButton.textContent = "Check Circuit";

    checkButton.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    checkButton.addEventListener("click", () => {
      setMode(mode === "check" ? activeCanvasMode : "check");
    });

    bottomBar.appendChild(modeContainer);
    bottomBar.appendChild(checkButton);
    overlays.appendChild(bottomBar);

    applyMode();
    updateModeButtons();
  }

  window.ESB.Mode = { init, getMode, getActiveCanvasMode, setMode, setCheckCanvas, refreshSplitCanvases };
})();
