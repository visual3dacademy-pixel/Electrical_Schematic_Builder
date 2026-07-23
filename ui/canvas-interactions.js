// Version 4.3
//
// Placement/selection/move/delete interactions for instances on the
// canvas, plus palette-to-canvas drag-and-drop. Wire drawing (Phase 3)
// is a separate module layered on top of this one.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const G = window.ESB.Geometry;
  const Lib = window.ESB.SymbolLibrary;
  const S = window.ESB.State;

  const CANVAS_MARGIN = 20;
  const MIN_X = C.PALETTE_W + CANVAS_MARGIN;
  const RELAY_ROW_OFFSET = 140;

  // Actual visible symbol bounds captured after each symbol is drawn.
  // Symbol definitions are not always centered on their instance origin
  // (Ground is the clearest example), so selection/placement feedback must
  // follow the rendered artwork rather than generic type.width/type.height.
  const visualBoundsByInstanceId = new Map();

  // The canvasId a NEW wire/junction should be tagged with, given the
  // current mode — mirrors wire-tool.js's own currentCanvasId (duplicated
  // rather than shared, since neither module exposes internals to the
  // other beyond WireTool's small public API).
  function currentCanvasId() {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    return mode === "idu" || mode === "odu" ? mode : null;
  }

  // Whether an existing wire/junction/instance's canvasId should be
  // visible/usable in the CURRENT mode — build/check show everything
  // unfiltered; only IDU/ODU actually scope down to their own circuit.
  function visibleInCurrentMode(canvasId) {
    let mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    if (mode === "check" && window.ESB.Mode && window.ESB.Mode.getActiveCanvasMode) {
      mode = window.ESB.Mode.getActiveCanvasMode();
    }
    if (mode !== "idu" && mode !== "odu") {
      return true;
    }
    return !canvasId || canvasId === mode;
  }

  // TSTAT Terminals bridging placement: how far below the low-voltage
  // section's top the R row lands (leaving room for the rail's leg above
  // it). No horizontal gap constant — the block's x is chosen so the R
  // row's left terminal sits at exactly the rail's x, reading as the rail
  // running straight into it rather than jogging over to reach it. Six
  // grid intervals (Sections.getLowVoltageRowSpacing) rather than a fixed
  // pixel offset — every other row below is also spaced by exact grid
  // multiples (see symbols-hvac-inputs.js's ROW_H), so once R lands on a
  // real snap row, G/Y/W1/O-B/C all land on their own rows too, instead of
  // drifting between lines the way a fixed 160px offset did.
  const TSTAT_R_OFFSET_Y = window.ESB.Sections.getLowVoltageRowSpacing() * 6;

  // Terminal-to-terminal distance (world units) within which a dragged
  // component's terminal is considered to be "landed on" another
  // instance's terminal — see applyMove's touch-then-separate auto-wiring.
  const TERMINAL_TOUCH_RADIUS = 14;

  // Circuit Breaker's terminal-to-terminal span (see symbols-power.js) —
  // used to work out how much of L1/L2's top the two built-in breakers
  // occupy. A multiple of Config.PLACEMENT_GRID (20) so the rail's tap
  // point (main.topY + this) lands exactly on the grid.
  const BREAKER_SPAN = 60;

  // Shortest a wire is ever allowed to shrink to while dragging one of its
  // two connected components — stops the dragged terminal from crossing
  // over (and visually overlapping/inverting past) the point it's wired
  // to, leaving a short visible stub instead.
  const MIN_WIRE_LENGTH = 40;

  // How far down a pivotAtTip instance's own length (meter_lead_black/red
  // — see symbols-meter.js) counts as "grabbed near the tip" for move-vs-
  // rotate purposes. A plain radius around the tip point (matching a
  // normal terminal's hit circle) was far too small relative to how long
  // and thin the lead actually is — almost any real click landed just
  // outside it, rotating the lead when the user was trying to relocate it
  // entirely, which read as "it's stuck." This is checked along the
  // lead's own local length instead, so "anywhere in the first third,
  // roughly" reliably counts as move.
  const LEAD_MOVE_ZONE_LENGTH = 110;

  // Precise (non-90-degree-snapped) inverse rotation — G.rotatePoint
  // rounds cos/sin to the nearest -1/0/1, which is correct for every other
  // instance in this app (always at a 0/90/180/270 rotation) but wrong
  // here, since a meter lead's rotation is a free, continuous angle (see
  // applyRotateLead). Used only to work out where a click landed relative
  // to a lead's own tip-to-cable-end axis.
  function worldToLocal(worldPoint, instance) {
    const dx = worldPoint.x - instance.x;
    const dy = worldPoint.y - instance.y;
    const radians = (-instance.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  // Palette entries "SPST Relay"/"SPDT Relay" are placement *recipes*, not
  // real SymbolTypes: dropping one creates a coil plus its NO (and, for
  // SPDT, NC) contact together, sharing one auto-numbered "R" designator
  // as both their label and deviceGroup — a real SymbolType to preview
  // with in the palette/drag-ghost since neither has its own glyph.
  const RELAY_PRESETS = {
    relay_spst: { previewTypeId: "coil", contactTypeIds: ["contact_no"] },
    relay_spdt: { previewTypeId: "coil", contactTypeIds: ["contact_no", "contact_nc"] }
  };

  let dragMode = null; // null | "new-instance" | "move-instance"
  let dragData = null;

  function clampToCanvas(point) {
    // Sections.getTotalHeight() grows once a low-voltage section exists —
    // clamping to the fixed Config.VIEW_H would trap instances at the
    // original 1080 boundary even though the canvas is now taller.
    const totalHeight = window.ESB.Sections.getTotalHeight();

    return {
      x: Math.max(MIN_X, Math.min(C.VIEW_W - CANVAS_MARGIN, point.x)),
      y: Math.max(CANVAS_MARGIN, Math.min(totalHeight - CANVAS_MARGIN, point.y))
    };
  }

  function setInteractionCursor(cursor) {
    document.body.style.cursor = cursor || "";
    document.documentElement.style.cursor = cursor || "";
  }

  function clearInteractionCursor() {
    setInteractionCursor("");
  }

  function renderInstances() {
    const layer = document.getElementById("instancesLayer");
    const meterLeadsLayer = document.getElementById("meterLeadsLayer");
    D.clearGroup(layer);
    if (meterLeadsLayer) {
      D.clearGroup(meterLeadsLayer);
    }

    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";

    S.state.instances.forEach((instance) => {
      const type = Lib.getType(instance.typeId);

      // Meter leads only exist (visually and interactively) in Check
      // Circuit mode — they're created once and persist in state.instances
      // regardless of mode, just not rendered outside it.
      if (type.pivotAtTip && mode !== "check") {
        return;
      }

      // In split mode, skip rendering here (rendered separately in mode.js)
      if (mode === "split") {
        return;
      }

      // IDU, ODU, and Check Circuit all show only the active unit's
      // canvas-scoped instances. Shared instances remain visible.
      if (!visibleInCurrentMode(instance.canvasId)) {
        return;
      }

      // Probe leads render in a dedicated layer above all normal
      // components. This fixes both the visual stacking problem and the
      // stuck-drag problem caused by a component's transparent hit box
      // sitting over the black lead.
      const renderLayer = type.pivotAtTip && meterLeadsLayer ? meterLeadsLayer : layer;

      const glyphGroup = D.group(
        {
          "data-instance-id": instance.id,
          transform: `translate(${instance.x},${instance.y}) rotate(${instance.rotation}) scale(${instance.mirrored ? -1 : 1},1)`,
          style: "cursor:grab;"
        },
        renderLayer
      );

      // Invisible full-bounding-box hit target, so clicking/dragging in a
      // symbol's open gaps (e.g. between contact prongs) still hits it —
      // the visible strokes alone don't cover the whole footprint. A
      // pivotAtTip type's local origin is its tip (the top of the glyph),
      // not its center, so its box spans down from y=0 instead of being
      // centered on the origin like every other symbol's.
      if (type.pivotAtTip) {
        D.rect(-type.width / 2, 0, type.width, type.height, { fill: "transparent", stroke: "none" }, glyphGroup);
      } else {
        D.rect(
          -type.width / 2,
          -type.height / 2,
          type.width,
          type.height,
          { fill: "transparent", stroke: "none" },
          glyphGroup
        );
      }

      const artworkGroup = D.group(
        { "data-instance-artwork-id": instance.id },
        glyphGroup
      );
      Lib.drawInstance(artworkGroup, type, instance);

      // getBBox() is available immediately after SVG artwork is appended.
      // Store only the visible symbol artwork bounds; the transparent hit box
      // is deliberately excluded so asymmetric symbols remain centered in
      // the placement circle.
      try {
        const box = artworkGroup.getBBox();
        if (Number.isFinite(box.x) && Number.isFinite(box.y) && box.width >= 0 && box.height >= 0) {
          visualBoundsByInstanceId.set(instance.id, {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          });
        }
      } catch (error) {
        // A temporarily hidden SVG can reject getBBox(). The selection code
        // has a safe fallback to the symbol type dimensions.
      }

      if (type.labelAnchor) {
        const labelWorld = G.localToWorld(type.labelAnchor, instance);
        // pointer-events:none so a label sitting over the glyph (e.g. a
        // coil's designation drawn at its center) never steals the click
        // that should hit the instance underneath.
        D.text(
          labelWorld.x,
          labelWorld.y,
          // instance.label is always set at creation time (empty string is
          // a deliberate choice for some types, e.g. capacitor) — no
          // `|| type.label` fallback, since "" is falsy but valid here.
          instance.label,
          15,
          700,
          "#1a2230",
          { "pointer-events": "none" },
          renderLayer
        );
      }
    });
  }

  function renderSelection() {
    // Selecting/deselecting an instance also affects wire highlighting
    // (mutually exclusive with wire selection) and wires may have just
    // been invalidated by an instance delete — keep wireLayer in sync
    // wherever selection changes.
    if (window.ESB.WireTool) {
      window.ESB.WireTool.renderWires();
    }

    const layer = document.getElementById("selectionLayer");
    D.clearGroup(layer);

    const instance = S.getSelected();
    if (!instance) {
      const selectedWire = S.getSelectedWire();
      if (selectedWire && window.ESB.WireTool) {
        window.ESB.WireTool.renderWireToolbar(layer, selectedWire);
      }
      return;
    }

    const type = Lib.getType(instance.typeId);
    const localBounds = visualBoundsByInstanceId.get(instance.id) || {
      x: -type.width / 2,
      y: -type.height / 2,
      width: type.width,
      height: type.height
    };

    // Transform all four visible-artwork corners into stage coordinates.
    // This keeps the placement circle centered correctly for asymmetric,
    // mirrored, and rotated symbols.
    const localCorners = [
      { x: localBounds.x, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
      { x: localBounds.x, y: localBounds.y + localBounds.height }
    ];
    const worldCorners = localCorners.map((point) => G.localToWorld(point, instance));
    const minX = Math.min(...worldCorners.map((point) => point.x));
    const maxX = Math.max(...worldCorners.map((point) => point.x));
    const minY = Math.min(...worldCorners.map((point) => point.y));
    const maxY = Math.max(...worldCorners.map((point) => point.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const radius = Math.max(maxX - minX, maxY - minY) / 2 + 18;

    D.circle(
      centerX,
      centerY,
      radius,
      {
        fill: instance.placementPending ? "rgba(104, 189, 234, 0.16)" : "none",
        stroke: instance.placementPending ? "#68bdea" : "#2377e8",
        "stroke-width": 3,
        "stroke-dasharray": "8 6",
        "pointer-events": "none"
      },
      layer
    );

    // Only the delete control remains. Newly placed components stay shaded
    // and electrically inert until the user moves them once.
    const toolbarY = centerY - radius - 34;

    drawToolbarButton(layer, centerX, toolbarY, "delete", (btn) => {
      D.line(-7, -7, 7, 7, { stroke: "#c0392b", width: 2.5 }, btn);
      D.line(-7, 7, 7, -7, { stroke: "#c0392b", width: 2.5 }, btn);
    });
  }

  function drawToolbarButton(layer, x, y, action, drawIcon) {
    const btn = D.group(
      { "data-toolbar-action": action, style: "cursor:pointer;" },
      layer
    );

    D.circle(0, 0, 22, { fill: "#ffffff", stroke: "#c7cfd9", "stroke-width": 2 }, btn);
    drawIcon(btn);

    btn.setAttribute("transform", `translate(${x},${y})`);
  }

  // Shared by the toolbar delete button and the Delete/Backspace key: if
  // the removed instance was bridging a section's rail (TSTAT Terminals),
  // that rail's leg extends back to its normal length, so the canvas needs
  // a relayout too — not just a re-render of instances/wires. Also
  // refreshes the palette, since deleting the one TSTAT Terminals block
  // un-greys its row again.
  // Everything wired below the transformer only exists *because* the
  // low-voltage section it bridges to exists (TSTAT Terminals, anything
  // wired to its 24V/C rails) — once that bridge is gone there's nothing
  // legitimate left for any of it to connect to, so it all goes with it.
  // Identified by Y position (>= the section's own topY) rather than by
  // canvasId or wire-tracing, since components placed there aren't
  // otherwise marked as "belonging" to the section in any other way.
  function cascadeDeleteLowVoltageSection(canvasId) {
    const lowSection = window.ESB.Sections.getById("lowVoltage", canvasId);
    if (!lowSection) {
      return;
    }

    const cutoffY = lowSection.topY - 1;

    S.state.instances
      .filter((instance) => instance.canvasId === canvasId && instance.y >= cutoffY)
      .forEach((instance) => S.removeInstance(instance.id));

    window.ESB.Sections.removeLowVoltageSection(canvasId);
  }

  // Modal warning before an irreversible cascade (deleting a transformer
  // takes the whole low-voltage section — and everything wired into it —
  // with it). A plain confirm() would work too, but this matches the
  // rest of the app's own styled-overlay look instead of a jarring native
  // browser dialog.
  function showConfirmModal(message, onConfirm) {
    const overlays = D.getElements().overlays;

    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:absolute;inset:0;background:rgba(20,26,35,0.45);z-index:40;" +
      "display:flex;align-items:center;justify-content:center;";

    const box = document.createElement("div");
    box.style.cssText =
      "background:#ffffff;border-radius:10px;padding:24px 28px;max-width:360px;" +
      "text-align:center;box-shadow:0 12px 32px rgba(0,0,0,0.3);";

    const text = document.createElement("p");
    text.textContent = message;
    text.style.cssText =
      "margin:0 0 20px 0;font:600 15px/1.4 Arial, Helvetica, sans-serif;color:#2a3340;";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:12px;justify-content:center;";

    const yesBtn = document.createElement("button");
    yesBtn.type = "button";
    yesBtn.textContent = "Yes";
    yesBtn.style.cssText =
      "padding:9px 24px;border:none;border-radius:6px;background:#c0392b;color:#ffffff;" +
      "font:700 14px Arial, Helvetica, sans-serif;cursor:pointer;";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText =
      "padding:9px 24px;border:none;border-radius:6px;background:#e2e6ec;color:#2a3340;" +
      "font:700 14px Arial, Helvetica, sans-serif;cursor:pointer;";

    yesBtn.addEventListener("click", () => {
      backdrop.remove();
      onConfirm();
    });
    cancelBtn.addEventListener("click", () => backdrop.remove());

    btnRow.appendChild(yesBtn);
    btnRow.appendChild(cancelBtn);
    box.appendChild(text);
    box.appendChild(btnRow);
    backdrop.appendChild(box);
    overlays.appendChild(backdrop);
  }

  function performDelete(id) {
    const instance = S.getInstance(id);
    const isTransformer = !!(instance && instance.typeId === "transformer");

    S.removeInstance(id);
    const railRestored = window.ESB.Sections.releaseTstat(id, instance && instance.canvasId);

    if (isTransformer) {
      cascadeDeleteLowVoltageSection(instance.canvasId);
    }

    renderInstances();
    renderSelection();
    window.ESB.Palette.render();

    if (railRestored || isTransformer) {
      window.ESB.relayout();
    }
  }

  function deleteInstance(id) {
    const instance = S.getInstance(id);

    if (instance && instance.typeId === "transformer") {
      showConfirmModal(
        "Deleting the transformer will also delete the low-voltage section and everything wired into it below. Continue?",
        () => performDelete(id)
      );
      return;
    }

    performDelete(id);
  }

  // Brief, self-dismissing message near the top of the stage — used for
  // rejected placements (e.g. dropping TSTAT Terminals with no transformer
  // on the canvas yet), where there's no instance/selection to attach a
  // normal inline error to.
  function showToast(message) {
    const overlays = D.getElements().overlays;

    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText =
      "position:absolute;left:50%;top:6%;transform:translateX(-50%);" +
      "background:#2a3340;color:#ffffff;padding:12px 22px;border-radius:8px;" +
      "font:700 15px Arial, Helvetica, sans-serif;box-shadow:0 8px 20px rgba(0,0,0,0.25);" +
      "pointer-events:none;z-index:30;transition:opacity 0.3s ease;opacity:1;white-space:nowrap;";

    overlays.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  // Split mode renders IDU/ODU as two independent SVGs (each its own
  // 0-1920/0-1080 coordinate space), not one shared circuitSvg — so every
  // pointer handler needs to know which of the two the cursor is currently
  // over (or the single shared circuitSvg, outside split mode) before it
  // can convert client coordinates or know which canvasId a new/moved
  // instance belongs to.
  function getCanvasContext(event) {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";

    if (mode === "split") {
      const iduContainer = document.getElementById("iduCanvasContainer");
      const oduContainer = document.getElementById("oduCanvasContainer");

      if (iduContainer && event.target && iduContainer.contains(event.target)) {
        return { svg: document.getElementById("iduCircuitSvg"), canvasId: "idu" };
      }
      if (oduContainer && event.target && oduContainer.contains(event.target)) {
        return { svg: document.getElementById("oduCircuitSvg"), canvasId: "odu" };
      }
      return { svg: null, canvasId: null };
    }

    return {
      svg: D.getElements().svg,
      canvasId: mode === "idu" || mode === "odu" ? mode : null
    };
  }

  // Split canvases have no palette overlapping them (unlike the shared
  // circuitSvg, which starts at MIN_X past the palette strip) and no
  // Sections-derived total height — clamp to their own fixed 1920x1080
  // box with a plain margin instead of reusing clampToCanvas.
  function clampToSplitCanvas(point) {
    return {
      x: Math.max(CANVAS_MARGIN, Math.min(C.VIEW_W - CANVAS_MARGIN, point.x)),
      y: Math.max(CANVAS_MARGIN, Math.min(C.VIEW_H - CANVAS_MARGIN, point.y))
    };
  }

  function ensureDragPreviewLayer(canvasId) {
    if (!canvasId) {
      return document.getElementById("dragPreviewLayer");
    }

    const svgEl = document.getElementById(canvasId === "idu" ? "iduCircuitSvg" : "oduCircuitSvg");
    if (!svgEl) {
      return null;
    }

    const layerId = `${canvasId}DragPreviewLayer`;
    return document.getElementById(layerId) || D.group({ id: layerId }, svgEl);
  }

  function renderDragGhost(point, typeId, canvasId) {
    const layer = ensureDragPreviewLayer(canvasId);
    if (!layer) {
      return;
    }
    D.clearGroup(layer);

    const preset = RELAY_PRESETS[typeId];
    const type = Lib.getType(preset ? preset.previewTypeId : typeId);
    // canvasId set means we're in a self-contained split panel with no
    // palette to stay clear of — always valid there.
    const isValid = canvasId ? true : point.x >= MIN_X;

    const ghost = D.group(
      {
        transform: `translate(${point.x},${point.y})`,
        opacity: isValid ? "0.85" : "0.35",
        style: "pointer-events:none;"
      },
      layer
    );

    Lib.drawInstance(ghost, type, { variant: type.defaultVariant, rotation: 0 });
  }

  function clearDragGhost() {
    D.clearGroup(document.getElementById("dragPreviewLayer"));

    const iduLayer = document.getElementById("iduDragPreviewLayer");
    if (iduLayer) {
      D.clearGroup(iduLayer);
    }

    const oduLayer = document.getElementById("oduDragPreviewLayer");
    if (oduLayer) {
      D.clearGroup(oduLayer);
    }
  }

  function getPlacementCanvasId() {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "idu";
    if (mode === "idu" || mode === "odu") return mode;
    if (mode === "split") return window.ESB.Mode.getActiveCanvasMode ? window.ESB.Mode.getActiveCanvasMode() : "idu";
    return window.ESB.Mode && window.ESB.Mode.getActiveCanvasMode ? window.ESB.Mode.getActiveCanvasMode() : "idu";
  }

  function placeAtCenter(typeId) {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "idu";
    const canvasId = getPlacementCanvasId();
    const section = window.ESB.Sections.getById("main", canvasId);
    const x = G.snapToGrid((section.leftX + section.rightX) / 2, C.PLACEMENT_GRID);
    const scrollArea = document.getElementById("scrollArea");
    const visibleY = scrollArea ? scrollArea.scrollTop + scrollArea.clientHeight / 2 : (section.topY + section.bottomY) / 2;
    const y = window.ESB.Sections.getNearestRowY(visibleY, canvasId);
    const preset = RELAY_PRESETS[typeId];
    let selected = null;

    if (preset) {
      const designator = S.nextDesignator("R");
      const relayGroup = `relay_${designator}`;
      selected = S.createInstance(preset.previewTypeId, x, y, { label: designator, deviceGroup: designator, canvasId, relayGroup, placementPending: true });
      preset.contactTypeIds.forEach((contactTypeId, index) => {
        S.createInstance(contactTypeId, x, y + RELAY_ROW_OFFSET * (index + 1), { label: designator, deviceGroup: designator, canvasId, relayGroup, placementPending: true });
      });
    } else if (typeId === "transformer" && !window.ESB.Sections.hasLowVoltageSection(canvasId)) {
      const main = window.ESB.Sections.getById("main", canvasId);
      window.ESB.Sections.addLowVoltageSection(canvasId);
      window.ESB.relayout();
      selected = S.createInstance("transformer", G.snapToGrid((main.leftX + main.rightX) / 2, C.PLACEMENT_GRID), main.bottomY + C.SECTION_GAP / 2, { canvasId, placementPending: true });
      window.ESB.Palette.render();
    } else if (typeId === "thermostat_block") {
      if (!window.ESB.Sections.hasLowVoltageSection(canvasId)) {
        showToast("A transformer is required to add this component.");
        return;
      }
      const low = window.ESB.Sections.getById("lowVoltage", canvasId);
      if (low.tstatInstanceId) return;
      const rTerminalY = low.topY + TSTAT_R_OFFSET_Y;
      const tstatType = Lib.getType("thermostat_block");
      const rRowLocalY = tstatType.terminals.find((terminal) => terminal.id === "r_l").y;
      selected = S.createInstance("thermostat_block", low.leftX + 95, rTerminalY - rRowLocalY, { fixedPosition: true, canvasId });
      S.createWire({ kind: "rail", railId: low.leftRailId, y: rTerminalY }, { kind: "terminal", instanceId: selected.id, terminalId: "r_l" }, canvasId);
      window.ESB.Sections.attachTstat("lowVoltage", selected.id, rTerminalY, canvasId);
      window.ESB.relayout(); window.ESB.Palette.render();
    } else {
      selected = S.createInstance(typeId, x, y, { canvasId, placementPending: true });
    }

    if (selected) {
      S.select(selected.id);
      renderInstances(); renderSelection();
      if (mode === "split" && window.ESB.Mode.refreshSplitCanvases) window.ESB.Mode.refreshSplitCanvases();
      showToast("Move the highlighted component to activate connections.");
      if (window.ESB.History) window.ESB.History.observe();
    }
  }

  function startPaletteDrag(typeId, event) {
    dragMode = "new-instance";
    dragData = { typeId };

    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    const context = getCanvasContext(event);
    const svg = context.svg || D.getElements().svg;

    if (svg) {
      const point = G.clientToStage(svg, event.clientX, event.clientY);
      renderDragGhost(point, typeId, mode === "split" ? context.canvasId : null);
    }

    event.preventDefault();
  }

  function onPointerDown(event) {
    const context = getCanvasContext(event);
    const svg = context.svg;
    const target = event.target;
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";

    // In split mode, only allow component placement/movement, no wiring or meter interactions
    if (mode === "split" && !target.closest("[data-palette-type]") && !target.closest("[data-instance-id]")) {
      return;
    }

    const toolbarEl = target.closest("[data-toolbar-action]");
    if (toolbarEl) {
      const selected = S.getSelected();
      if (selected) {
        const action = toolbarEl.dataset.toolbarAction;
        if (action === "delete") deleteInstance(selected.id);
        if (action === "rotate" && !selected.fixedPosition) {
          S.rotateInstance(selected.id, 90);
          renderInstances(); renderSelection();
        }
        if (action === "transfer") {
          const destination = selected.canvasId === "idu" ? "odu" : "idu";
          selected.canvasId = destination;
          S.select(null);
          renderInstances(); renderSelection(); window.ESB.Palette.render();
          showToast(`Component transferred to ${destination === "idu" ? "Indoor Unit" : "Outdoor Unit"}.`);
        }
        if (window.ESB.History) window.ESB.History.observe();
      }
      event.preventDefault();
      return;
    }

    // Available in both modes — flipping the breaker to see its effect is
    // exactly what Check Circuit is for, and there's no reason to block it
    // while still building either.
    const breakerToggleEl = target.closest("[data-breaker-toggle]");
    if (breakerToggleEl) {
      if (window.ESB.BreakerControl) {
        window.ESB.BreakerControl.toggle();
      }
      event.preventDefault();
      return;
    }

    // Component placement/movement is allowed in every canvas-editing mode
    // (build, the two single-canvas modes, and split) — only "check" keeps
    // the built circuit read-only (aside from the pivotAtTip probe leads).
    const canEditInstances = mode === "build" || mode === "idu" || mode === "odu" || mode === "split";

    if (canEditInstances) {
      const paletteEl = target.closest("[data-palette-type]");
      if (paletteEl) {
        const paletteType = paletteEl.dataset.paletteType;

        if (paletteType === "thermoswitch_picker") {
          if (window.ESB.ThermoswitchPicker) {
            window.ESB.ThermoswitchPicker.open();
          }
          event.preventDefault();
          return;
        }

        placeAtCenter(paletteType);
        event.preventDefault();
        return;
      }
    }

    const instanceEl = target.closest("[data-instance-id]");
    if (instanceEl) {
      const instance = S.getInstance(instanceEl.dataset.instanceId);

      if (instance) {
        const type = Lib.getType(instance.typeId);
        const activeSvg = svg || D.getElements().svg;
        const point = G.clientToStage(activeSvg, event.clientX, event.clientY);

        if (type.pivotAtTip) {
          // Check Circuit only (see renderInstances — leads aren't even
          // rendered, hence not clickable, in build mode). Clicking within
          // the first LEAD_MOVE_ZONE_LENGTH of the lead's own length
          // (from the tip down) moves the tip; grabbing further down —
          // deeper into the cable — rotates it around the (fixed) tip
          // instead.
          const local = worldToLocal(point, instance);

          dragMode = local.y <= LEAD_MOVE_ZONE_LENGTH ? "move-tip" : "rotate-lead";
          dragData = { instanceId: instance.id };
          // Meter-probe movement uses a crosshair so the exact probe-tip
          // landing point remains obvious on desktop and touch-capable apps.
          setInteractionCursor("crosshair");
          event.preventDefault();
          return;
        }

        if (mode === "check" && type.isSwitchLike &&
            instance.typeId !== "contact_no" && instance.typeId !== "contact_nc") {
          window.ESB.ComponentState.toggle(instance.id);
          event.preventDefault();
          return;
        }

        if (canEditInstances) {
          const alreadySelected = S.getSelected() && S.getSelected().id === instance.id;
          S.select(instance.id);
          renderSelection();

          // Positioned components require a first tap to select. A second
          // deliberate drag moves them. Newly placed pending components are
          // the exception because moving them is the required next step.
          if (!alreadySelected && !instance.placementPending) {
            event.preventDefault();
            return;
          }

          dragMode = "move-instance";
          dragData = {
            instanceId: instance.id,
            pointerStartX: point.x,
            pointerStartY: point.y,
            instanceStartX: instance.x,
            instanceStartY: instance.y,
            touchState: {},
            // Fixed once, at drag start — which side of each wired
            // connection this instance's terminal starts on, and along
            // which axis. Locking this in up front (rather than re-deriving
            // it live from the current tentative position every frame) is
            // what actually stops a fast/large drag from popping straight
            // through to the far side: every frame clamps back toward the
            // SAME original side, however far past the pointer has gone.
            wireConstraints: buildWireConstraints(instance)
          };
        }
        // mode === "check" and not pivotAtTip: the built circuit is
        // read-only here — no selection, no drag.
      }

      event.preventDefault();
      return;
    }

    if (canEditInstances) {
      S.select(null);
      renderSelection();
    }
  }

  function terminalHasWire(instanceId, terminalId) {
    return S.state.wires.some((wire) => {
      return (
        (wire.a.kind === "terminal" && wire.a.instanceId === instanceId && wire.a.terminalId === terminalId) ||
        (wire.b.kind === "terminal" && wire.b.instanceId === instanceId && wire.b.terminalId === terminalId)
      );
    });
  }

  // Nearest OTHER instance's terminal to worldPoint, within touch range —
  // used by applyMove to detect "this terminal is currently landed on
  // that one," regardless of whether either terminal already has a wire
  // (the caller filters that).
  function findTouchingTerminal(worldPoint, excludeInstanceId) {
    let best = null;
    let bestDist = TERMINAL_TOUCH_RADIUS;

    S.state.instances.forEach((other) => {
      if (other.id === excludeInstanceId) {
        return;
      }
      // IDU/ODU are independent circuits — a component in one must never
      // auto-wire to a component that only exists in the other.
      if (!visibleInCurrentMode(other.canvasId)) {
        return;
      }

      const type = Lib.getType(other.typeId);
      type.terminals.forEach((terminal) => {
        const worldTerminal = G.localToWorld({ x: terminal.x, y: terminal.y }, other);
        const d = G.distance(worldPoint, worldTerminal);

        if (d <= bestDist) {
          bestDist = d;
          best = { kind: "terminal", instanceId: other.id, terminalId: terminal.id };
        }
      });
    });

    // An existing wire's free end is a junction, not a component terminal
    // — without this, dragging a component's terminal onto one and
    // separating never registered as "touching" anything, so it couldn't
    // auto-wire the way touching another component's terminal does.
    S.state.junctions.forEach((junction) => {
      if (!visibleInCurrentMode(junction.canvasId)) {
        return;
      }

      const d = G.distance(worldPoint, { x: junction.x, y: junction.y });
      if (d <= bestDist) {
        bestDist = d;
        best = { kind: "junction", junctionId: junction.id };
      }
    });

    // Same idea for a bare rail (L1/L2/24V/C) with nothing wired to it
    // yet — touching a component's terminal directly against the rail
    // itself should auto-wire it too, the same as touching another
    // component's terminal.
    window.ESB.Sections.getAll().forEach((section) => {
      [
        { railId: section.leftRailId, x: section.leftX, side: "left" },
        { railId: section.rightRailId, x: section.rightX, side: "right" }
      ].forEach((rail) => {
        const bounds = window.ESB.Sections.getRailBounds(section, rail.side);
        const hit = G.distanceToSegment(
          worldPoint,
          { x: rail.x, y: bounds.topY },
          { x: rail.x, y: bounds.bottomY }
        );

        if (hit.distance <= bestDist) {
          bestDist = hit.distance;
          best = { kind: "rail", railId: rail.railId, y: hit.point.y };
        }
      });
    });

    return best;
  }

  // Live, per-drag "touch" tracking: while dragging, if one of the moved
  // instance's (still-unwired) terminals currently coincides with another
  // instance's terminal, remember it — then the moment it's no longer
  // touching (dragged away), wire the two together. Only fires for a
  // terminal that had no wire at all, per the user's spec, and only once
  // per touch episode (dragData.touchState is cleared right after).
  function checkTouchAndAutoWire(instance) {
    const type = Lib.getType(instance.typeId);

    type.terminals.forEach((terminal) => {
      if (terminalHasWire(instance.id, terminal.id)) {
        return;
      }

      const worldPoint = G.localToWorld({ x: terminal.x, y: terminal.y }, instance);
      const touching = findTouchingTerminal(worldPoint, instance.id);
      const previouslyTouching = dragData.touchState[terminal.id] || null;

      if (touching) {
        dragData.touchState[terminal.id] = touching;
      } else if (previouslyTouching) {
        S.createWire(
          { kind: "terminal", instanceId: instance.id, terminalId: terminal.id },
          previouslyTouching,
          currentCanvasId()
        );
        dragData.touchState[terminal.id] = null;
      }
    });
  }

  // A component terminal's fixed offset from its own origin (e.g. ±75) is
  // essentially never itself a multiple of Config.PLACEMENT_GRID (20), so
  // after the *instance* snaps to that grid, the terminal's world
  // position almost never lands exactly on the same coordinate as a
  // junction/rail tap (which snap independently, directly to a grid
  // multiple). The result is a few-unit residual jog right at the
  // junction — real, but visually negligible — which would otherwise
  // dominate a naive "look at the very next path point" direction check
  // and mask an actual overlap sitting just beyond it.
  const MEANINGFUL_SEGMENT_LENGTH = 25;

  // Which side of `pathWire` (its "a" or "b" ref) resolves to `ref`, and
  // the true local direction that wire departs the shared point from —
  // walking along its *rendered* path (not just its raw far endpoint,
  // which is wrong for any rail-connected wire: rails force a
  // perpendicular departure, so their raw endpoint usually isn't even
  // colinear with the shared point at all) until a segment of real length
  // is found, skipping past any negligible residual jog right at the
  // junction itself.
  function pathDepartureDirection(pathWire, path, ref) {
    const refIsA = S.sameRef(pathWire.a, ref);
    const ordered = refIsA ? path : path.slice().reverse();
    const anchor = ordered[0];

    for (let i = 1; i < ordered.length; i += 1) {
      const dx = ordered[i].x - anchor.x;
      const dy = ordered[i].y - anchor.y;

      if (Math.hypot(dx, dy) >= MEANINGFUL_SEGMENT_LENGTH || i === ordered.length - 1) {
        return Math.abs(dx) >= Math.abs(dy)
          ? { axis: "x", sign: dx < 0 ? -1 : 1 }
          : { axis: "y", sign: dy < 0 ? -1 : 1 };
      }
    }

    return null;
  }

  // A wired terminal whose wire ends at a plain 2-wire pass-through
  // junction (not a real 3+ way branch) is really just one continuous run
  // to whatever's on the junction's *other* side (a rail, another
  // terminal, or a longer chain). A clean pass-through has the two wires
  // departing the junction in OPPOSITE directions (one arrives from
  // above, the other continues below, say). Dragging the component far
  // enough crosses it onto the same side the junction's other wire
  // already occupies — both wires then depart the junction in the SAME
  // direction, overlapping along that shared stretch instead of
  // continuing past it, which reads as the wire "doubling up." Collapsing
  // both into one direct terminal-to-far wire (dropping the now-pointless
  // junction) keeps it a single clean line no matter how far the
  // component is dragged.
  function simplifyPassthroughWires(instance) {
    const type = Lib.getType(instance.typeId);
    const WT = window.ESB.WireTool;

    type.terminals.forEach((terminal) => {
      const myRef = { kind: "terminal", instanceId: instance.id, terminalId: terminal.id };
      const wire = S.state.wires.find((candidate) => {
        return visibleInCurrentMode(candidate.canvasId) && (S.sameRef(candidate.a, myRef) || S.sameRef(candidate.b, myRef));
      });
      if (!wire) {
        return;
      }

      const otherEnd = S.sameRef(wire.a, myRef) ? wire.b : wire.a;
      if (otherEnd.kind !== "junction") {
        return;
      }

      const junction = S.getJunction(otherEnd.junctionId);
      if (!junction) {
        return;
      }

      const junctionRef = { kind: "junction", junctionId: junction.id };
      const otherWires = S.state.wires.filter((candidate) => {
        if (candidate.id === wire.id || !visibleInCurrentMode(candidate.canvasId)) {
          return false;
        }
        return S.sameRef(candidate.a, junctionRef) || S.sameRef(candidate.b, junctionRef);
      });

      // A real 3+ way branch (or a dead-end junction with nothing else
      // attached) stays exactly as-is — only a simple 2-wire pass-through
      // is ever collapsed.
      if (otherWires.length !== 1) {
        return;
      }

      const otherWire = otherWires[0];
      const farRef = S.sameRef(otherWire.a, junctionRef) ? otherWire.b : otherWire.a;

      const myPath = WT.getWirePath(wire);
      const otherPath = WT.getWirePath(otherWire);
      if (!myPath || !otherPath || myPath.length < 2 || otherPath.length < 2) {
        return;
      }

      const myDir = pathDepartureDirection(wire, myPath, junctionRef);
      const otherDir = pathDepartureDirection(otherWire, otherPath, junctionRef);
      if (!myDir || !otherDir) {
        return;
      }

      // Opposite directions (or different axes entirely, e.g. one arrives
      // horizontally and the other departs vertically) is a normal,
      // non-overlapping pass-through — nothing to fix.
      if (!(myDir.axis === otherDir.axis && myDir.sign === otherDir.sign)) {
        return;
      }

      S.removeWire(wire.id);
      S.removeWire(otherWire.id);
      S.createWire(myRef, farRef, wire.canvasId);
    });
  }

  // Every wire touching one of this instance's terminals, paired with
  // which terminal it's on — used at drag start to fix which side of each
  // connection the terminal begins on.
  function wiredTerminalsFor(instanceId) {
    const results = [];

    S.state.wires.forEach((wire) => {
      if (wire.a.kind === "terminal" && wire.a.instanceId === instanceId) {
        results.push({ terminalId: wire.a.terminalId, otherRef: wire.b });
      } else if (wire.b.kind === "terminal" && wire.b.instanceId === instanceId) {
        results.push({ terminalId: wire.b.terminalId, otherRef: wire.a });
      }
    });

    return results;
  }

  // Called once, at the start of a move-instance drag: for each wired
  // terminal, records which axis the connection runs along and which side
  // of the other point the terminal starts on. A *distance*-only check
  // (just "clamp if closer than 40") isn't enough — a terminal can cross
  // all the way to the far side and then simply be more than 40 units away
  // again, popping straight through. Fixing the side up front means every
  // later frame clamps back toward that same original side no matter how
  // far past it the raw drag has gone.
  function buildWireConstraints(instance) {
    const type = Lib.getType(instance.typeId);

    return wiredTerminalsFor(instance.id)
      .map((connection) => {
        const terminal = type.terminals.find((candidate) => candidate.id === connection.terminalId);
        const otherPoint = terminal && G.resolveRefPoint(connection.otherRef);

        if (!terminal || !otherPoint) {
          return null;
        }

        const originalWorld = G.localToWorld(terminal, instance);
        const dx = originalWorld.x - otherPoint.x;
        const dy = originalWorld.y - otherPoint.y;
        const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        const sign = (axis === "x" ? dx : dy) < 0 ? -1 : 1;

        return { terminal, otherRef: connection.otherRef, axis, sign };
      })
      .filter(Boolean);
  }

  // Keeps a dragged instance's wired terminals from crossing over the
  // point each is wired to — instead of overlapping/inverting past it,
  // the drag stops MIN_WIRE_LENGTH short, leaving a short visible stub.
  // Assumes rotation 0 / not mirrored, true for every instance type that's
  // actually user-draggable today (the built-in breakers and TSTAT
  // Terminals, which do use rotation/aren't draggable at all, never reach
  // this — see the fixedPosition/locked guards in applyMove).
  function constrainAgainstConnectedWires(constraints, x, y) {
    let resultX = x;
    let resultY = y;

    constraints.forEach((constraint) => {
      const otherPoint = G.resolveRefPoint(constraint.otherRef);
      if (!otherPoint) {
        return;
      }

      const terminal = constraint.terminal;

      if (constraint.axis === "x") {
        const tentativeX = resultX + terminal.x;
        const signed = constraint.sign * (tentativeX - otherPoint.x);
        if (signed < MIN_WIRE_LENGTH) {
          resultX = otherPoint.x + constraint.sign * MIN_WIRE_LENGTH - terminal.x;
        }
      } else {
        const tentativeY = resultY + terminal.y;
        const signed = constraint.sign * (tentativeY - otherPoint.y);
        if (signed < MIN_WIRE_LENGTH) {
          resultY = otherPoint.y + constraint.sign * MIN_WIRE_LENGTH - terminal.y;
        }
      }
    });

    return { x: resultX, y: resultY };
  }

  // targetCanvasId is which split panel the pointer is currently over
  // (from getCanvasContext, resolved fresh per pointermove/up) — undefined
  // outside split mode, where canvas reassignment doesn't apply.
  function applyMove(point, targetCanvasId) {
    const instance = S.getInstance(dragData.instanceId);
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    const inSplit = mode === "split";

    // fixedPosition (e.g. TSTAT Terminals, auto-bridged to the 24V rail):
    // selectable and deletable like any instance, but never repositioned.
    if (instance && instance.fixedPosition) {
      renderInstances();
      renderSelection();
      return;
    }

    const dx = point.x - dragData.pointerStartX;
    const dy = point.y - dragData.pointerStartY;

    const raw = {
      x: dragData.instanceStartX + dx,
      y: dragData.instanceStartY + dy
    };

    // Split panels are self-contained 1920x1080 boxes with no palette
    // strip and no Sections-derived height — clampToCanvas's MIN_X/
    // getTotalHeight assumptions don't apply there.
    const clamped = inSplit ? clampToSplitCanvas(raw) : clampToCanvas(raw);
    const snapped = {
      x: G.snapToGrid(clamped.x, C.PLACEMENT_GRID),
      // Y snaps to the section's fixed row grid, not the finer placement
      // grid — matches wire endpoints onto the same predictable rows.
      y: window.ESB.Sections.getNearestRowY(clamped.y)
    };

    const type = instance && Lib.getType(instance.typeId);

    // lockVertical (e.g. the transformer, which must stay bridging its two
    // rails): horizontal drag only, Y stays exactly where it started.
    const finalY = type && type.lockVertical ? dragData.instanceStartY : snapped.y;

    const constrained = dragData.wireConstraints && dragData.wireConstraints.length
      ? constrainAgainstConnectedWires(dragData.wireConstraints, snapped.x, finalY)
      : { x: snapped.x, y: finalY };

    S.moveInstance(dragData.instanceId, constrained.x, constrained.y);

    // Reassign canvasId based on whichever split panel the pointer is
    // actually over right now — not the instance's raw x, since IDU and
    // ODU are two independent 1920-wide panels, not one 1920 space split
    // in half. A relay's coil and contacts (linked by relayGroup for
    // labeling) are each dragged independently — the group no longer
    // forces its other members onto the same canvasId.
    if (inSplit && instance && targetCanvasId && instance.canvasId !== targetCanvasId) {
      instance.canvasId = targetCanvasId;
    }

    // A palette-placed component is inert until this first deliberate move.
    // Its first release only activates it; it cannot snap, split, or create wires.
    const wasPending = !!(instance && instance.placementPending);
    if (instance && wasPending) {
      instance.placementPending = false;
    }
    // Split mode is components-only. Pending components also skip all automatic wiring.
    if (instance && !inSplit && !wasPending) {
      checkTouchAndAutoWire(instance);
      simplifyPassthroughWires(instance);
    }

    renderInstances();
    renderSelection();

    if (inSplit && window.ESB.Mode && window.ESB.Mode.refreshSplitCanvases) {
      window.ESB.Mode.refreshSplitCanvases();
    }
  }

  // Moves a meter lead's tip directly to the cursor, snapping onto any
  // nearby terminal/junction/rail exactly like drawing a wire would (reuses
  // wire-tool's own snap search) — touching the tip to a point is meant to
  // read as "the probe is on this exact node." instance.probeRef records
  // what it's currently touching (or null) for a future reading feature;
  // nothing acts on it yet.
  function applyMoveTip(point) {
    const instance = S.getInstance(dragData.instanceId);
    if (!instance) {
      return;
    }

    // Exclude the lead's own instance — otherwise its tip (still sitting
    // at last frame's position) is almost always the closest candidate on
    // every subsequent frame, and it never actually escapes to snap onto
    // anything else.
    const snap = window.ESB.WireTool && window.ESB.WireTool.findConnectionPoint
      ? window.ESB.WireTool.findConnectionPoint(point, C.TERMINAL_SNAP_RADIUS, instance.id)
      : null;

    const target = snap ? snap.point : point;

    instance.x = target.x;
    instance.y = target.y;
    instance.probeRef = snap ? snap.ref : null;

    renderInstances();
    renderSelection();
  }

  // Rotates a meter lead around its tip (the instance's own x/y, which
  // never moves during this drag) so its body swings to point at the
  // cursor. -90 so that "cursor straight below the tip" — the artwork's
  // own natural, unrotated orientation — maps to rotation 0.
  function applyRotateLead(point) {
    const instance = S.getInstance(dragData.instanceId);
    if (!instance) {
      return;
    }

    const dx = point.x - instance.x;
    const dy = point.y - instance.y;

    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      instance.rotation = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    }

    renderInstances();
    renderSelection();
  }

  function onPointerMove(event) {
    if (!dragMode) {
      return;
    }

    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    // Re-resolved every frame: in split mode the cursor may have crossed
    // from one panel into the other (or off both) since the last event.
    const context = getCanvasContext(event);

    if (dragMode === "new-instance") {
      if (!context.svg) {
        // Cursor is over the palette or the gap between panels — no valid
        // drop target right now, so don't leave a stale ghost showing.
        clearDragGhost();
        return;
      }
      const point = G.clientToStage(context.svg, event.clientX, event.clientY);
      // See the matching comment in onPointerDown — context.canvasId is
      // "idu"/"odu" outside split mode too (for instance tagging), but the
      // ghost layer lookup should only treat it as a split-panel SVG id
      // when we're actually in split mode.
      renderDragGhost(point, dragData.typeId, mode === "split" ? context.canvasId : null);
      return;
    }

    const activeSvg = mode === "split" ? context.svg : D.getElements().svg;
    if (!activeSvg) {
      // Split mode, cursor currently over neither panel — hold position
      // rather than computing a meaningless point.
      return;
    }

    const point = G.clientToStage(activeSvg, event.clientX, event.clientY);

    if (dragMode === "move-instance") {
      applyMove(point, context.canvasId);
      return;
    }

    if (dragMode === "move-tip") {
      applyMoveTip(point);
      return;
    }

    if (dragMode === "rotate-lead") {
      applyRotateLead(point);
    }
  }

  function onPointerUp(event) {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    const inSplit = mode === "split";
    const context = getCanvasContext(event);
    const activeSvg = inSplit ? context.svg : D.getElements().svg;
    const point = activeSvg ? G.clientToStage(activeSvg, event.clientX, event.clientY) : null;

    if (dragMode === "move-tip" && point) {
      applyMoveTip(point);
    }

    if (dragMode === "rotate-lead" && point) {
      applyRotateLead(point);
    }

    if (dragMode === "new-instance") {
      // Split panels have no palette to stay clear of — any drop inside
      // one of the two panel SVGs is valid. Outside split mode, keep the
      // original "must clear the palette strip" rule.
      const validDrop = inSplit ? !!point : (point && point.x >= MIN_X);
      const targetCanvasId = inSplit ? context.canvasId : (mode === "idu" || mode === "odu" ? mode : null);

      // Transformer and thermostat terminals are intentionally unavailable
      // in split-screen mode. Keep this hard guard even if a stale palette
      // drag was started before the user entered split view.
      const splitBlockedType = inSplit && (
        dragData.typeId === "transformer" ||
        dragData.typeId === "thermostat_block"
      );

      // Enforce one transformer and one thermostat terminal block per unit
      // at the placement layer as well as in the palette. This prevents
      // duplicates caused by stale UI state, rapid taps, or mode changes.
      const duplicateSingleUse = targetCanvasId && (
        (dragData.typeId === "transformer" || dragData.typeId === "thermostat_block") &&
        S.state.instances.some((instance) =>
          instance.typeId === dragData.typeId && instance.canvasId === targetCanvasId
        )
      );

      if (splitBlockedType) {
        showToast("Transformer and TSTAT Terminals must be added in the IDU or ODU view.");
      } else if (duplicateSingleUse) {
        showToast(
          dragData.typeId === "transformer"
            ? "Only one transformer is allowed per unit."
            : "Only one TSTAT Terminals block is allowed per unit."
        );
      } else if (validDrop) {
        const snapped = {
          x: G.snapToGrid(point.x, C.PLACEMENT_GRID),
          y: window.ESB.Sections.getNearestRowY(point.y, targetCanvasId)
        };
        const clampPoint = inSplit ? clampToSplitCanvas : clampToCanvas;

        const preset = RELAY_PRESETS[dragData.typeId];

        if (preset) {
          const designator = S.nextDesignator("R");
          const relayGroup = `relay_${designator}`;

          const coil = S.createInstance(preset.previewTypeId, snapped.x, snapped.y, {
            label: designator,
            deviceGroup: designator,
            canvasId: targetCanvasId,
            relayGroup: relayGroup
          });

          preset.contactTypeIds.forEach((contactTypeId, index) => {
            const contactPoint = clampPoint({
              x: snapped.x,
              y: snapped.y + RELAY_ROW_OFFSET * (index + 1)
            });

            S.createInstance(contactTypeId, contactPoint.x, contactPoint.y, {
              label: designator,
              deviceGroup: designator,
              canvasId: targetCanvasId,
              relayGroup: relayGroup
            });
          });

          S.select(coil.id);
        } else if (dragData.typeId === "transformer" && !window.ESB.Sections.hasLowVoltageSection(targetCanvasId)) {
          // First transformer placed: snap it to bridge the main ladder's
          // bottom rail and a newly-created low-voltage section's top
          // rail (H1/H2 and X1/X2 are exactly Config.SECTION_GAP/2 apart
          // from the instance's own origin). Only the initial placement
          // is special-cased — once a low-voltage section exists, later
          // transformers (and this one, afterward) behave like any other
          // freely-draggable instance. Sections are global, not per-panel,
          // so this bridging recipe is skipped in split mode (falls
          // through to the plain instance below instead).
          const main = window.ESB.Sections.getById("main", targetCanvasId);
          window.ESB.Sections.addLowVoltageSection(targetCanvasId);
          window.ESB.relayout();

          const bridgeX = G.snapToGrid((main.leftX + main.rightX) / 2, C.PLACEMENT_GRID);
          const bridgeY = main.bottomY + C.SECTION_GAP / 2;

          const instance = S.createInstance("transformer", bridgeX, bridgeY, {
            canvasId: targetCanvasId
          });
          S.select(instance.id);
          window.ESB.Palette.render();
        } else if (dragData.typeId === "thermostat_block") {
          // TSTAT Terminals requires 24VAC to exist at all — without a
          // transformer there's no low-voltage section/rail for it to
          // bridge to, so the drop is rejected outright rather than
          // placing a disconnected block. Same Sections-are-global caveat
          // as the transformer branch above — skipped entirely in split
          // mode.
          if (!window.ESB.Sections.hasLowVoltageSection(targetCanvasId)) {
            showToast("A transformer is required to add this component.");
          } else if (!window.ESB.Sections.getById("lowVoltage", targetCanvasId).tstatInstanceId) {
            // Fixed position bridging the low-voltage section's 24V rail
            // directly to the R row, same "auto-bridge on first placement"
            // idea as the transformer. Only one TSTAT Terminals block is
            // ever allowed (see ui/palette.js, which greys the row out
            // once one exists), so this branch's guard should always hold
            // whenever the palette let the drag start in the first place.
            const lowSection = window.ESB.Sections.getById("lowVoltage", targetCanvasId);
            const rTerminalY = lowSection.topY + TSTAT_R_OFFSET_Y;
            // R row's left terminal (local x -95) lands exactly on the
            // rail's own x — the rail reads as running straight into it,
            // not jogging sideways to reach it.
            const instanceX = lowSection.leftX + 95;
            // R row's own local y (its terminals' y) IS -BLOCK_TOP by
            // construction (symbols-hvac-inputs.js) — read it from the
            // registered type instead of duplicating that constant here,
            // so the two files can't silently drift apart.
            const tstatType = Lib.getType("thermostat_block");
            const rRowLocalY = tstatType.terminals.find((terminal) => terminal.id === "r_l").y;
            const instanceY = rTerminalY - rRowLocalY;

            const instance = S.createInstance("thermostat_block", instanceX, instanceY, {
              fixedPosition: true,
              canvasId: targetCanvasId
            });

            S.createWire(
              { kind: "rail", railId: lowSection.leftRailId, y: rTerminalY },
              { kind: "terminal", instanceId: instance.id, terminalId: "r_l" },
              targetCanvasId
            );

            window.ESB.Sections.attachTstat("lowVoltage", instance.id, rTerminalY, targetCanvasId);
            window.ESB.relayout();
            window.ESB.Palette.render();

            S.select(instance.id);
          }
        } else {
          const instance = S.createInstance(dragData.typeId, snapped.x, snapped.y, {
            canvasId: targetCanvasId
          });
          S.select(instance.id);
        }

        renderInstances();
        renderSelection();

        if (inSplit && window.ESB.Mode && window.ESB.Mode.refreshSplitCanvases) {
          window.ESB.Mode.refreshSplitCanvases();
        }
      }

      clearDragGhost();
    }

    if (dragMode === "move-instance") {
      // Applied again here (not just on pointermove) so a move still
      // completes correctly even if no intermediate move events fired
      // between pointerdown and pointerup.
      if (point) {
        applyMove(point, context.canvasId);
      }
    }

    dragMode = null;
    dragData = null;
    clearInteractionCursor();
    if (window.ESB.History) window.ESB.History.observe();
  }

  function onKeyDown(event) {
    if (event.key === "Delete" || event.key === "Backspace") {
      const selectedWire = S.getSelectedWire();
      if (selectedWire) {
        S.removeWire(selectedWire.id);
        renderSelection();
        event.preventDefault();
        return;
      }
    }

    const selected = S.getSelected();
    if (!selected) {
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      deleteInstance(selected.id);
      event.preventDefault();
    }
  }

  // One permanent Earth Ground reference belongs to each unit canvas.
  // These fixtures are locked, grid-aligned, and always available as a
  // wire/meter terminal in Build and Check Circuit views. The symbol is
  // rotated vertically so its open terminal sits directly above the earth
  // mark beneath the unit title.
  function createBuiltInEarthGrounds() {
    const main = window.ESB.Sections.getById("main");
    if (!main) return;

    const centerX = (main.leftX + main.rightX) / 2;
    const centerY = 130; // terminal lands below the symbol after -90-degree rotation

    ["idu", "odu"].forEach((canvasId) => {
      const alreadyExists = S.state.instances.some((instance) => {
        return instance.typeId === "ground" && instance.canvasId === canvasId && instance.params && instance.params.permanentEarthGround;
      });

      if (alreadyExists) return;

      const ground = S.createInstance("ground", centerX, centerY, {
        label: "",
        locked: true,
        canvasId
      });
      // The normalized ground glyph is already drawn in the visual
      // orientation produced by a -90° rotation of the original CAD/SVG
      // source: terminal at left, earth mark extending to the right.
      // Keep the instance at 0° so it matches the supplied reference image.
      ground.rotation = 0;
      ground.params.permanentEarthGround = true;
    });
  }

  // Two Circuit Breakers, permanently in series at the top of L1 and L2 —
  // no longer a palette item (see symbols-power.js), created once here
  // instead. Rotated so each one's terminal pair runs vertically: the
  // "outer" terminal (away from the rail) sits at the section's original
  // topY, the "inner" one (toward the rail) BREAKER_SPAN below that, and
  // the rail's own visible/wireable length is shortened to start there
  // (Sections.setRailTopOverride) so it reads as running straight out of
  // the breaker rather than through it.
  function createBuiltInBreakers() {
    ["idu", "odu"].forEach((canvasId) => {
      const alreadyExists = S.state.instances.some(
        (instance) => instance.typeId === "breaker" && instance.canvasId === canvasId
      );
      if (alreadyExists) return;

      const main = window.ESB.Sections.getById("main", canvasId);
      const outerY = main.topY;
      const innerY = outerY + BREAKER_SPAN;
      const centerY = (outerY + innerY) / 2;

      const l1 = S.createInstance("breaker", main.leftX, centerY, { label: "CB", locked: true, canvasId });
      l1.rotation = 90;
      const l2 = S.createInstance("breaker", main.rightX, centerY, { label: "CB", locked: true, canvasId });
      l2.rotation = -90;

      S.createWire(
        { kind: "terminal", instanceId: l1.id, terminalId: "t2" },
        { kind: "rail", railId: main.leftRailId, y: innerY },
        canvasId
      );
      S.createWire(
        { kind: "terminal", instanceId: l2.id, terminalId: "t1" },
        { kind: "rail", railId: main.rightRailId, y: innerY },
        canvasId
      );

      window.ESB.Sections.setRailTopOverride("main", innerY, innerY, canvasId);
    });
    window.ESB.relayout();
  }

  function init() {
    // Listens on #stage, not circuitSvg — the palette lives in its own
    // separate paletteSvg sibling (see styles.css), so a listener on
    // circuitSvg alone would never see palette clicks/drags.
    const stage = D.getElements().stage;

    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", clearInteractionCursor);
    window.addEventListener("blur", clearInteractionCursor);
    window.addEventListener("keydown", onKeyDown);

    createBuiltInBreakers();

    createBuiltInEarthGrounds();

    renderInstances();
    renderSelection();
  }

  window.ESB.CanvasInteractions = {
    init,
    startPaletteDrag,
    placeAtCenter,
    renderInstances,
    renderSelection
  };
})();
