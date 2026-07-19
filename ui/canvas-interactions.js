// Version 0.1
//
// Placement/selection/move/rotate/delete interactions for instances on the
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

  let dragMode = null; // null | "new-instance" | "move-instance"
  let dragData = null;

  function clampToCanvas(point) {
    return {
      x: Math.max(MIN_X, Math.min(C.VIEW_W - CANVAS_MARGIN, point.x)),
      y: Math.max(CANVAS_MARGIN, Math.min(C.VIEW_H - CANVAS_MARGIN, point.y))
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
          instance.label || type.label,
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

    drawToolbarButton(layer, instance.x - 30, toolbarY, "rotate", (btn) => {
      D.path("M -9,-3 A 9,9 0 1 1 -9,3", { fill: "none", stroke: "#1a2230", width: 2.5 }, btn);
      D.path("M -9,-8 L -9,3 L 2,3", { fill: "none", stroke: "#1a2230", width: 2.5 }, btn);
    });

    drawToolbarButton(layer, instance.x + 30, toolbarY, "delete", (btn) => {
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

  function renderDragGhost(point, typeId) {
    const layer = document.getElementById("dragPreviewLayer");
    D.clearGroup(layer);

    const type = Lib.getType(typeId);
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
      if (selected) {
        if (toolbarEl.dataset.toolbarAction === "rotate") {
          S.rotateInstance(selected.id, 90);
        } else if (toolbarEl.dataset.toolbarAction === "delete") {
          S.removeInstance(selected.id);
        }
        renderInstances();
        renderSelection();
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

    S.moveInstance(dragData.instanceId, snapped.x, snapped.y);
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

        const instance = S.createInstance(dragData.typeId, snapped.x, snapped.y);
        S.select(instance.id);
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

    if (event.key === "r" || event.key === "R") {
      S.rotateInstance(selected.id, 90);
      renderInstances();
      renderSelection();
      event.preventDefault();
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      S.removeInstance(selected.id);
      renderInstances();
      renderSelection();
      event.preventDefault();
    }
  }

  function init() {
    const svg = D.getElements().svg;

    svg.addEventListener("pointerdown", onPointerDown);
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
