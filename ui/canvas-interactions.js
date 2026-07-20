// Version 0.2
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

  // TSTAT Terminals bridging placement: how far below the low-voltage
  // section's top the R row lands (leaving room for the rail's leg above
  // it). No horizontal gap constant — the block's x is chosen so the R
  // row's left terminal sits at exactly the rail's x, reading as the rail
  // running straight into it rather than jogging over to reach it.
  const TSTAT_R_OFFSET_Y = 150;

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

  function renderInstances() {
    const layer = document.getElementById("instancesLayer");
    D.clearGroup(layer);

    S.state.instances.forEach((instance) => {
      const type = Lib.getType(instance.typeId);

      const glyphGroup = D.group(
        {
          "data-instance-id": instance.id,
          transform: `translate(${instance.x},${instance.y}) rotate(${instance.rotation}) scale(${instance.mirrored ? -1 : 1},1)`,
          style: "cursor:grab;"
        },
        layer
      );

      // Invisible full-bounding-box hit target, so clicking/dragging in a
      // symbol's open gaps (e.g. between contact prongs) still hits it —
      // the visible strokes alone don't cover the whole footprint.
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
          layer
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
    const radius = Math.max(type.width, type.height) / 2 + 14;

    D.circle(
      instance.x,
      instance.y,
      radius,
      {
        fill: "none",
        stroke: "#2377e8",
        "stroke-width": 3,
        "stroke-dasharray": "8 6"
      },
      layer
    );

    const toolbarY = instance.y - radius - 34;

    drawToolbarButton(layer, instance.x, toolbarY, "delete", (btn) => {
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
  function deleteInstance(id) {
    S.removeInstance(id);
    const railRestored = window.ESB.Sections.releaseTstat(id);

    renderInstances();
    renderSelection();
    window.ESB.Palette.render();

    if (railRestored) {
      window.ESB.relayout();
    }
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

  function renderDragGhost(point, typeId) {
    const layer = document.getElementById("dragPreviewLayer");
    D.clearGroup(layer);

    const preset = RELAY_PRESETS[typeId];
    const type = Lib.getType(preset ? preset.previewTypeId : typeId);
    const isValid = point.x >= MIN_X;

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
  }

  function onPointerDown(event) {
    const svg = D.getElements().svg;
    const target = event.target;

    const toolbarEl = target.closest("[data-toolbar-action]");
    if (toolbarEl) {
      const selected = S.getSelected();
      if (selected && toolbarEl.dataset.toolbarAction === "delete") {
        deleteInstance(selected.id);
      }
      event.preventDefault();
      return;
    }

    const paletteEl = target.closest("[data-palette-type]");
    if (paletteEl) {
      dragMode = "new-instance";
      dragData = { typeId: paletteEl.dataset.paletteType };
      const point = G.clientToStage(svg, event.clientX, event.clientY);
      renderDragGhost(point, dragData.typeId);
      event.preventDefault();
      return;
    }

    const instanceEl = target.closest("[data-instance-id]");
    if (instanceEl) {
      const instance = S.getInstance(instanceEl.dataset.instanceId);
      if (instance) {
        S.select(instance.id);
        renderSelection();

        const point = G.clientToStage(svg, event.clientX, event.clientY);
        dragMode = "move-instance";
        dragData = {
          instanceId: instance.id,
          pointerStartX: point.x,
          pointerStartY: point.y,
          instanceStartX: instance.x,
          instanceStartY: instance.y
        };
      }
      event.preventDefault();
      return;
    }

    S.select(null);
    renderSelection();
  }

  function applyMove(point) {
    const instance = S.getInstance(dragData.instanceId);

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

    const clamped = clampToCanvas(raw);
    const snapped = {
      x: G.snapToGrid(clamped.x, C.PLACEMENT_GRID),
      y: G.snapToGrid(clamped.y, C.PLACEMENT_GRID)
    };

    const type = instance && Lib.getType(instance.typeId);

    // lockVertical (e.g. the transformer, which must stay bridging its two
    // rails): horizontal drag only, Y stays exactly where it started.
    const finalY = type && type.lockVertical ? dragData.instanceStartY : snapped.y;

    S.moveInstance(dragData.instanceId, snapped.x, finalY);
    renderInstances();
    renderSelection();
  }

  function onPointerMove(event) {
    if (!dragMode) {
      return;
    }

    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);

    if (dragMode === "new-instance") {
      renderDragGhost(point, dragData.typeId);
      return;
    }

    if (dragMode === "move-instance") {
      applyMove(point);
    }
  }

  function onPointerUp(event) {
    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);

    if (dragMode === "new-instance") {
      if (point.x >= MIN_X) {
        const snapped = {
          x: G.snapToGrid(point.x, C.PLACEMENT_GRID),
          y: G.snapToGrid(point.y, C.PLACEMENT_GRID)
        };

        const preset = RELAY_PRESETS[dragData.typeId];

        if (preset) {
          const designator = S.nextDesignator("R");
          const coil = S.createInstance(preset.previewTypeId, snapped.x, snapped.y, {
            label: designator,
            deviceGroup: designator
          });

          preset.contactTypeIds.forEach((contactTypeId, index) => {
            const contactPoint = clampToCanvas({
              x: snapped.x,
              y: snapped.y + RELAY_ROW_OFFSET * (index + 1)
            });

            S.createInstance(contactTypeId, contactPoint.x, contactPoint.y, {
              label: designator,
              deviceGroup: designator
            });
          });

          S.select(coil.id);
        } else if (dragData.typeId === "transformer" && !window.ESB.Sections.hasLowVoltageSection()) {
          // First transformer placed: snap it to bridge the main ladder's
          // bottom rail and a newly-created low-voltage section's top
          // rail (H1/H2 and X1/X2 are exactly Config.SECTION_GAP/2 apart
          // from the instance's own origin). Only the initial placement
          // is special-cased — once a low-voltage section exists, later
          // transformers (and this one, afterward) behave like any other
          // freely-draggable instance.
          const main = window.ESB.Sections.getById("main");
          window.ESB.Sections.addLowVoltageSection();
          window.ESB.relayout();

          const bridgeX = G.snapToGrid((main.leftX + main.rightX) / 2, C.PLACEMENT_GRID);
          const bridgeY = main.bottomY + C.SECTION_GAP / 2;

          const instance = S.createInstance("transformer", bridgeX, bridgeY);
          S.select(instance.id);
        } else if (dragData.typeId === "thermostat_block") {
          // TSTAT Terminals requires 24VAC to exist at all — without a
          // transformer there's no low-voltage section/rail for it to
          // bridge to, so the drop is rejected outright rather than
          // placing a disconnected block.
          if (!window.ESB.Sections.hasLowVoltageSection()) {
            showToast("A transformer is required to add this component.");
          } else if (!window.ESB.Sections.getById("lowVoltage").tstatInstanceId) {
            // Fixed position bridging the low-voltage section's 24V rail
            // directly to the R row, same "auto-bridge on first placement"
            // idea as the transformer. Only one TSTAT Terminals block is
            // ever allowed (see ui/palette.js, which greys the row out
            // once one exists), so this branch's guard should always hold
            // whenever the palette let the drag start in the first place.
            const lowSection = window.ESB.Sections.getById("lowVoltage");
            const rTerminalY = lowSection.topY + TSTAT_R_OFFSET_Y;
            // R row's left terminal (local x -95) lands exactly on the
            // rail's own x — the rail reads as running straight into it,
            // not jogging sideways to reach it.
            const instanceX = lowSection.leftX + 95;
            const instanceY = rTerminalY + 150; // -BLOCK_TOP for the 6-row block, matching symbols-hvac-inputs.js

            const instance = S.createInstance("thermostat_block", instanceX, instanceY, {
              fixedPosition: true
            });

            S.createWire(
              { kind: "rail", railId: lowSection.leftRailId, y: rTerminalY },
              { kind: "terminal", instanceId: instance.id, terminalId: "r_l" }
            );

            window.ESB.Sections.attachTstat("lowVoltage", instance.id, rTerminalY);
            window.ESB.relayout();
            window.ESB.Palette.render();

            S.select(instance.id);
          }
        } else {
          const instance = S.createInstance(dragData.typeId, snapped.x, snapped.y);
          S.select(instance.id);
        }

        renderInstances();
        renderSelection();
      }

      clearDragGhost();
    }

    if (dragMode === "move-instance") {
      // Applied again here (not just on pointermove) so a move still
      // completes correctly even if no intermediate move events fired
      // between pointerdown and pointerup.
      applyMove(point);
    }

    dragMode = null;
    dragData = null;
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

  function init() {
    // Listens on #stage, not circuitSvg — the palette lives in its own
    // separate paletteSvg sibling (see styles.css), so a listener on
    // circuitSvg alone would never see palette clicks/drags.
    const stage = D.getElements().stage;

    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    renderInstances();
    renderSelection();
  }

  window.ESB.CanvasInteractions = {
    init,
    renderInstances,
    renderSelection
  };
})();
