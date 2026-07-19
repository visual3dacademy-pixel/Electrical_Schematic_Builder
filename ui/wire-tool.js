// Version 0.1
//
// Click-drag wire drawing between terminals/junctions, with snapping and
// orthogonal routing, plus rendering and selection of committed wires.
// Runs its pointerdown check in the capture phase so a precise click on a
// terminal always starts a wire, taking priority over instance
// selection/move (canvas-interactions.js) before that module ever sees
// the event.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const G = window.ESB.Geometry;
  const Lib = window.ESB.SymbolLibrary;
  const S = window.ESB.State;

  const MIN_X = C.PALETTE_W + 20;

  let dragMode = null; // null | "drawing-wire"
  let dragData = null;

  function allConnectionPoints() {
    const points = [];

    S.state.instances.forEach((instance) => {
      const type = Lib.getType(instance.typeId);
      type.terminals.forEach((terminal) => {
        points.push({
          ref: { kind: "terminal", instanceId: instance.id, terminalId: terminal.id },
          point: G.localToWorld({ x: terminal.x, y: terminal.y }, instance)
        });
      });
    });

    S.state.junctions.forEach((junction) => {
      points.push({
        ref: { kind: "junction", junctionId: junction.id },
        point: { x: junction.x, y: junction.y }
      });
    });

    return points;
  }

  function findConnectionPoint(point, radius) {
    let best = null;
    let bestDist = radius;

    allConnectionPoints().forEach((candidate) => {
      const d = G.distance(point, candidate.point);
      if (d <= bestDist) {
        bestDist = d;
        best = candidate;
      }
    });

    return best;
  }

  function renderWires() {
    const layer = document.getElementById("wireLayer");
    D.clearGroup(layer);

    S.state.wires.forEach((wire) => {
      const pointA = G.resolveRefPoint(wire.a);
      const pointB = G.resolveRefPoint(wire.b);

      if (!pointA || !pointB) {
        return;
      }

      const path = G.orthogonalPath(pointA, pointB);
      const isSelected = wire.id === S.state.selectedWireId;

      // Fat transparent hit-path underneath, so clicking near (not
      // pixel-perfect on) the visible line still selects the wire.
      D.polyline(
        path,
        { "data-wire-id": wire.id, stroke: "transparent", "stroke-width": 22, style: "cursor:pointer;" },
        layer
      );

      D.polyline(
        path,
        {
          "data-wire-id": wire.id,
          stroke: isSelected ? "#2377e8" : "#111111",
          "stroke-width": isSelected ? 5 : 4,
          "pointer-events": "none"
        },
        layer
      );
    });

    S.state.junctions.forEach((junction) => {
      D.circle(junction.x, junction.y, 6, { fill: "#111111", stroke: "none" }, layer);
    });
  }

  // Draws the selected wire's delete button into the given layer (owned
  // and cleared by canvas-interactions.js's renderSelection, which sits
  // above instancesLayer — a button drawn into wireLayer itself would sit
  // *behind* instances and could have its clicks stolen by them).
  function renderWireToolbar(layer, wire) {
    const pointA = G.resolveRefPoint(wire.a);
    const pointB = G.resolveRefPoint(wire.b);

    if (!pointA || !pointB) {
      return;
    }

    const mid = { x: (pointA.x + pointB.x) / 2, y: (pointA.y + pointB.y) / 2 };

    const btn = D.group({ "data-toolbar-action": "delete-wire", style: "cursor:pointer;" }, layer);
    D.circle(0, 0, 18, { fill: "#ffffff", stroke: "#c7cfd9", "stroke-width": 2 }, btn);
    D.line(-6, -6, 6, 6, { stroke: "#c0392b", width: 2.5 }, btn);
    D.line(-6, 6, 6, -6, { stroke: "#c0392b", width: 2.5 }, btn);
    btn.setAttribute("transform", `translate(${mid.x},${mid.y - 30})`);
  }

  function renderPreview(start, end, snapped) {
    const layer = document.getElementById("wirePreviewLayer");
    D.clearGroup(layer);

    const path = G.orthogonalPath(start, end);
    D.polyline(
      path,
      {
        stroke: snapped ? "#2377e8" : "#8a94a3",
        "stroke-width": 3,
        "stroke-dasharray": "10 6",
        style: "pointer-events:none;"
      },
      layer
    );
  }

  function clearPreview() {
    D.clearGroup(document.getElementById("wirePreviewLayer"));
  }

  function onPointerDownCapture(event) {
    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);
    const hit = findConnectionPoint(point, C.TERMINAL_HIT_RADIUS);

    if (!hit) {
      return;
    }

    event.stopImmediatePropagation();
    event.preventDefault();

    dragMode = "drawing-wire";
    dragData = { startRef: hit.ref, startPoint: hit.point };
    renderPreview(hit.point, hit.point, true);
  }

  function onPointerMove(event) {
    if (dragMode !== "drawing-wire") {
      return;
    }

    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);
    const snapHit = findConnectionPoint(point, C.TERMINAL_SNAP_RADIUS);
    const endPoint = snapHit ? snapHit.point : point;

    renderPreview(dragData.startPoint, endPoint, !!snapHit);
  }

  function onPointerUp(event) {
    if (dragMode !== "drawing-wire") {
      return;
    }

    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);
    const snapHit = findConnectionPoint(point, C.TERMINAL_SNAP_RADIUS);

    let endRef = null;

    if (snapHit) {
      endRef = snapHit.ref;
    } else if (point.x >= MIN_X) {
      const junction = S.createJunction(
        G.snapToGrid(point.x, C.PLACEMENT_GRID),
        G.snapToGrid(point.y, C.PLACEMENT_GRID)
      );
      endRef = { kind: "junction", junctionId: junction.id };
    }

    if (endRef && !S.sameRef(endRef, dragData.startRef)) {
      const wire = S.createWire(dragData.startRef, endRef);
      S.selectWire(wire.id);
    }

    clearPreview();
    dragMode = null;
    dragData = null;

    renderWires();
    window.ESB.CanvasInteractions.renderSelection();
  }

  function onPointerDownSelect(event) {
    const deleteBtn = event.target.closest('[data-toolbar-action="delete-wire"]');
    if (deleteBtn) {
      const selectedWire = S.getSelectedWire();
      if (selectedWire) {
        S.removeWire(selectedWire.id);
        renderWires();
        window.ESB.CanvasInteractions.renderSelection();
      }
      event.preventDefault();
      return;
    }

    const wireEl = event.target.closest("[data-wire-id]");
    if (!wireEl) {
      return;
    }

    S.selectWire(wireEl.dataset.wireId);
    renderWires();
    window.ESB.CanvasInteractions.renderSelection();
  }

  function init() {
    const svg = D.getElements().svg;

    svg.addEventListener("pointerdown", onPointerDownCapture, true);
    svg.addEventListener("pointerdown", onPointerDownSelect);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    renderWires();
  }

  window.ESB.WireTool = { init, renderWires, renderWireToolbar };
})();
