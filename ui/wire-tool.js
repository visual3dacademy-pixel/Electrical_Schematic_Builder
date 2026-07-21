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

  let dragMode = null; // null | "drawing-wire" | "move-wire"
  let dragData = null;

  // A rail is a bus, not a point — a wire touching one must always depart/
  // arrive *perpendicular* to it (horizontal, since every rail in this
  // library is vertical), never run parallel alongside it first.
  //
  // The same idea applies at a junction that already has another wire: if
  // that existing wire departs the junction vertically, a second wire
  // should meet it *horizontally* — otherwise the default vertical-first
  // bend can send the new wire back down through the exact corridor the
  // first wire already occupies before it turns, which reads as the wire
  // "backtracking" and leaves what looks like a stray dangling leg where
  // the two overlap. Meeting perpendicular to whatever's already there
  // avoids that regardless of which side of the junction each wire is on.
  //
  // Returns "horizontal" | "vertical" | null (no constraint — a fresh
  // junction with no other wire yet, or a plain terminal).
  function requiredMeetingDirection(ref, excludeWireId) {
    if (!ref) {
      return null;
    }

    if (ref.kind === "rail") {
      return "horizontal";
    }

    if (ref.kind !== "junction") {
      return null;
    }

    const junction = S.getJunction(ref.junctionId);
    if (!junction) {
      return null;
    }

    let neighborAxis = null;

    S.state.wires.some((candidate) => {
      if (candidate.id === excludeWireId) {
        return false;
      }

      let neighborRef = null;
      if (candidate.a.kind === "junction" && candidate.a.junctionId === ref.junctionId) {
        neighborRef = candidate.b;
      } else if (candidate.b.kind === "junction" && candidate.b.junctionId === ref.junctionId) {
        neighborRef = candidate.a;
      }

      const neighborPoint = neighborRef && G.resolveRefPoint(neighborRef);
      if (!neighborPoint) {
        return false;
      }

      const dx = Math.abs(neighborPoint.x - junction.x);
      const dy = Math.abs(neighborPoint.y - junction.y);
      neighborAxis = dx >= dy ? "x" : "y";
      return true;
    });

    if (neighborAxis === "y") {
      return "horizontal";
    }
    if (neighborAxis === "x") {
      return "vertical";
    }
    return null;
  }

  // Picks the orthogonal bend point between two refs, honoring whichever
  // side has a fixed meeting direction (a rail, or a junction that already
  // has another wire) — A's requirement wins if both happen to have one,
  // matching the priority already established for rails.
  function resolveBend(pointA, pointB, refA, refB, excludeWireId) {
    const directionA = requiredMeetingDirection(refA, excludeWireId);
    const directionB = requiredMeetingDirection(refB, excludeWireId);

    if (directionA === "horizontal") {
      return [pointA, { x: pointB.x, y: pointA.y }, pointB];
    }
    if (directionA === "vertical") {
      return [pointA, { x: pointA.x, y: pointB.y }, pointB];
    }
    if (directionB === "horizontal") {
      return [pointA, { x: pointA.x, y: pointB.y }, pointB];
    }
    if (directionB === "vertical") {
      return [pointA, { x: pointB.x, y: pointA.y }, pointB];
    }

    return G.orthogonalPath(pointA, pointB);
  }

  // The rendered path for one wire — a plain 2-segment orthogonal bend by
  // default, or (once the user has dragged it) a 3-segment path with a
  // freely-repositionable horizontal jog at wire.bendY. Either way every
  // segment stays strictly horizontal/vertical, matching the rest of the
  // library's ladder-diagram convention. Rail connections, and junctions
  // that already have another wire, always use the perpendicular-meeting
  // path above instead — there's nothing meaningful to drag when one end's
  // direction is already fixed like that, so bendY is ignored for them.
  function wirePath(wire, pointA, pointB) {
    if (
      wire.a.kind === "rail" ||
      wire.b.kind === "rail" ||
      requiredMeetingDirection(wire.a, wire.id) ||
      requiredMeetingDirection(wire.b, wire.id)
    ) {
      return resolveBend(pointA, pointB, wire.a, wire.b, wire.id);
    }

    if (wire.bendY === undefined || wire.bendY === null) {
      return G.orthogonalPath(pointA, pointB);
    }

    return [
      pointA,
      { x: pointA.x, y: wire.bendY },
      { x: pointB.x, y: wire.bendY },
      pointB
    ];
  }

  // excludeInstanceId leaves out one instance's own terminals — needed so
  // dragging something that snaps onto other terminals (a meter lead's
  // tip; see ui/canvas-interactions.js) doesn't find *itself* as the
  // nearest candidate. That self-match is what made a lead read as
  // "stuck": on every frame of a real drag its own terminal is still
  // sitting at last frame's position, only a hair from the current
  // pointer position — almost always closer than any real terminal — so
  // it kept re-snapping to itself and never actually moved.
  function allConnectionPoints(excludeInstanceId) {
    const points = [];

    S.state.instances.forEach((instance) => {
      if (instance.id === excludeInstanceId) {
        return;
      }

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

  function findConnectionPoint(point, radius, excludeInstanceId) {
    let best = null;
    let bestDist = radius;

    allConnectionPoints(excludeInstanceId).forEach((candidate) => {
      const d = G.distance(point, candidate.point);
      if (d <= bestDist) {
        bestDist = d;
        best = candidate;
      }
    });

    // Rails are buses, not fixed points — hit-test the whole length of
    // each one so a wire can land anywhere along it, not just at its ends.
    // Bounds come from Sections.getRailBounds so a rail shortened by a
    // built-in fixture (the breakers cutting into the top of L1/L2, TSTAT
    // Terminals cutting into the bottom of the 24V rail) can't be wired
    // into the portion that's no longer actually there.
    window.ESB.Sections.getAll().forEach((section) => {
      [
        { railId: section.leftRailId, x: section.leftX, side: "left" },
        { railId: section.rightRailId, x: section.rightX, side: "right" }
      ].forEach((rail) => {
        const bounds = window.ESB.Sections.getRailBounds(section, rail.side);
        const hit = G.distanceToSegment(
          point,
          { x: rail.x, y: bounds.topY },
          { x: rail.x, y: bounds.bottomY }
        );

        if (hit.distance <= bestDist) {
          bestDist = hit.distance;
          best = {
            ref: { kind: "rail", railId: rail.railId, y: hit.point.y },
            point: hit.point
          };
        }
      });
    });

    return best;
  }

  // Hit-tests every segment of every committed wire's rendered path — a
  // new wire ending here doesn't just snap visually, it tees into that
  // wire: findEndpoint below turns this into an actual junction that
  // splits the target wire in two, so the new connection is genuinely
  // part of the same electrical net (see onPointerUp).
  function findWireHit(point, radius, excludeWireId) {
    let best = null;
    let bestDist = radius;

    S.state.wires.forEach((wire) => {
      if (wire.id === excludeWireId) {
        return;
      }

      const pointA = G.resolveRefPoint(wire.a);
      const pointB = G.resolveRefPoint(wire.b);
      if (!pointA || !pointB) {
        return;
      }

      const path = wirePath(wire, pointA, pointB);

      for (let i = 0; i < path.length - 1; i += 1) {
        const hit = G.distanceToSegment(point, path[i], path[i + 1]);
        if (hit.distance <= bestDist) {
          bestDist = hit.distance;
          best = { ref: { kind: "wire-tee", wireId: wire.id }, point: hit.point };
        }
      }
    });

    return best;
  }

  // Combines terminal/junction/rail snapping with wire-tee snapping — used
  // only for the *end* of a new wire (see the module doc comment: a wire
  // can start only from a terminal/junction/rail, matching how it always
  // worked, but it can now end on top of another wire too).
  function findEndpoint(point, radius, excludeWireId) {
    return findConnectionPoint(point, radius) || findWireHit(point, radius, excludeWireId);
  }

  // How many wires currently touch a junction — a junction with only 2 is
  // just a routing bend (one wire drawn in two gestures, or dragged back
  // through the same point): electrically it's a pass-through, not a real
  // tie, so it gets no visible dot. 3+ is a genuine multi-way branch.
  function junctionWireCount(junctionId) {
    return S.state.wires.filter((wire) => {
      return (
        (wire.a.kind === "junction" && wire.a.junctionId === junctionId) ||
        (wire.b.kind === "junction" && wire.b.junctionId === junctionId)
      );
    }).length;
  }

  // The transformer's H1/H2/X1/X2 sit at exactly the Y where they're meant
  // to bridge into a rail — any wire touching one should stay perfectly
  // horizontal, never an L-bend, since a bend there would just be wrong
  // (there's no reason to jog when the two points are already meant to
  // line up).
  function isTransformerTerminal(ref) {
    if (!ref || ref.kind !== "terminal") {
      return false;
    }
    const instance = S.getInstance(ref.instanceId);
    return !!(instance && instance.typeId === "transformer");
  }

  // Forces a wire touching a transformer terminal to be perfectly
  // horizontal by pinning the *other* end's Y to the terminal's — a rail
  // ref's y is free to move (it's just a stored number), and a fresh
  // junction (from ending on blank canvas, or tee-ing into another wire)
  // can simply be relocated. A fixed terminal on the other end can't be
  // moved to match, so that case is left alone.
  function lockTransformerWireHorizontal(startRef, endRef, startPoint) {
    if (isTransformerTerminal(startRef)) {
      if (endRef.kind === "rail") {
        return { start: startRef, end: { kind: "rail", railId: endRef.railId, y: startPoint.y } };
      }
      if (endRef.kind === "junction") {
        const junction = S.getJunction(endRef.junctionId);
        if (junction) {
          junction.y = startPoint.y;
        }
      }
    } else if (isTransformerTerminal(endRef)) {
      const endPoint = G.resolveRefPoint(endRef);
      if (startRef.kind === "rail") {
        return { start: { kind: "rail", railId: startRef.railId, y: endPoint.y }, end: endRef };
      }
      if (startRef.kind === "junction") {
        const junction = S.getJunction(startRef.junctionId);
        if (junction) {
          junction.y = endPoint.y;
        }
      }
    }

    return { start: startRef, end: endRef };
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

      const path = wirePath(wire, pointA, pointB);
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

      // A dot wherever this wire taps into a rail — rails are buses, not
      // discrete points, so unlike a terminal/junction there's nothing
      // else marking that connection exists. Live via resolveRefPoint, so
      // it's always drawn at wherever this wire currently meets the rail.
      [wire.a, wire.b].forEach((ref) => {
        if (ref && ref.kind === "rail") {
          const railPoint = G.resolveRefPoint(ref);
          if (railPoint) {
            D.circle(railPoint.x, railPoint.y, 6, { fill: "#111111", stroke: "none" }, layer);
          }
        }
      });
    });

    S.state.junctions.forEach((junction) => {
      // Only a genuine 3+ way tie gets a visible dot — 2 wires meeting
      // here is just a bend (the same logical wire drawn in two
      // gestures), not a real junction.
      if (junctionWireCount(junction.id) >= 3) {
        D.circle(junction.x, junction.y, 6, { fill: "#111111", stroke: "none" }, layer);
      }

      // The hit-zone stays regardless of wire count — a 2-wire junction is
      // still a perfectly valid point to continue wiring from, it just
      // doesn't need a marker. Without this, hovering it would show the
      // wire's own pointer cursor (its fat hit-path's rounded cap reaches
      // slightly past this point) instead of crosshair — drawn last so it
      // wins the hit-test within its radius.
      D.circle(
        junction.x,
        junction.y,
        C.TERMINAL_HIT_RADIUS,
        { fill: "transparent", stroke: "none", style: "cursor:crosshair;" },
        layer
      );
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

  function renderPreview(start, end, snapped, startRef, endRef) {
    const layer = document.getElementById("wirePreviewLayer");
    D.clearGroup(layer);

    const path = resolveBend(start, end, startRef, endRef, null);
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
    if (window.ESB.Mode && window.ESB.Mode.getMode() !== "build") {
      return;
    }

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
    renderPreview(hit.point, hit.point, true, hit.ref, null);

    // Without this, the cursor reverts to whatever's under the pointer
    // mid-drag (grab over a component body, default over blank canvas) —
    // forcing it here keeps the crosshair for the whole gesture, so it
    // reads as "drawing a wire" the entire time, not just at the start.
    document.body.style.cursor = "crosshair";
  }

  function onPointerMove(event) {
    if (dragMode === "move-wire") {
      const svg = D.getElements().svg;
      const point = G.clientToStage(svg, event.clientX, event.clientY);
      const wire = S.getWire(dragData.wireId);
      const pointA = wire && G.resolveRefPoint(wire.a);
      const pointB = wire && G.resolveRefPoint(wire.b);

      if (pointA && pointB) {
        // Clamped to stay between the two endpoints' heights — letting the
        // jog slide *past* either end made the path overshoot and double
        // back on itself (visible as the wire "backtracking" on a main
        // vertical, or wherever else it was dragged past) instead of just
        // stepping cleanly from one height to the other.
        const minY = Math.min(pointA.y, pointB.y);
        const maxY = Math.max(pointA.y, pointB.y);
        const clampedY = Math.max(minY, Math.min(maxY, point.y));

        S.setWireBendY(dragData.wireId, clampedY);
      }

      renderWires();
      window.ESB.CanvasInteractions.renderSelection();
      return;
    }

    if (dragMode !== "drawing-wire") {
      return;
    }

    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);
    const snapHit = findEndpoint(point, C.TERMINAL_SNAP_RADIUS);
    let endPoint = snapHit ? snapHit.point : point;

    // Preview-only: matches the horizontal lock applied at commit time (see
    // onPointerUp), so the wire doesn't visibly snap straight only at the
    // very end of the drag.
    if (isTransformerTerminal(dragData.startRef)) {
      endPoint = { x: endPoint.x, y: dragData.startPoint.y };
    }

    renderPreview(dragData.startPoint, endPoint, !!snapHit, dragData.startRef, snapHit ? snapHit.ref : null);
  }

  function onPointerUp(event) {
    if (dragMode === "move-wire") {
      dragMode = null;
      dragData = null;
      return;
    }

    if (dragMode !== "drawing-wire") {
      return;
    }

    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);
    const snapHit = findEndpoint(point, C.TERMINAL_SNAP_RADIUS);

    let endRef = null;

    if (snapHit && snapHit.ref.kind === "wire-tee") {
      // Ending on top of another wire splits it in two at a new junction,
      // rather than just visually touching it — otherwise the new wire
      // wouldn't actually share a net with the wire it's teeing into.
      // Order matters: create the two replacement wires *before* removing
      // the original, so its endpoints (which might themselves be
      // junctions) are never briefly orphaned and auto-pruned.
      const targetWire = S.getWire(snapHit.ref.wireId);

      if (targetWire) {
        const junction = S.createJunction(snapHit.point.x, snapHit.point.y);
        endRef = { kind: "junction", junctionId: junction.id };

        S.createWire(targetWire.a, endRef);
        S.createWire(endRef, targetWire.b);
        S.removeWire(targetWire.id);
      }
    } else if (snapHit) {
      endRef = snapHit.ref;
    } else if (point.x >= MIN_X) {
      const junction = S.createJunction(
        G.snapToGrid(point.x, C.PLACEMENT_GRID),
        G.snapToGrid(point.y, C.PLACEMENT_GRID)
      );
      endRef = { kind: "junction", junctionId: junction.id };
    }

    if (endRef) {
      const locked = lockTransformerWireHorizontal(dragData.startRef, endRef, dragData.startPoint);
      dragData.startRef = locked.start;
      endRef = locked.end;
    }

    if (endRef && !S.sameRef(endRef, dragData.startRef)) {
      // Re-tracing an existing connection (drawing the same wire back over
      // itself) removes it instead of adding a redundant, overlapping one.
      const duplicate = S.state.wires.find((candidate) => {
        return (
          (S.sameRef(candidate.a, dragData.startRef) && S.sameRef(candidate.b, endRef)) ||
          (S.sameRef(candidate.a, endRef) && S.sameRef(candidate.b, dragData.startRef))
        );
      });

      if (duplicate) {
        S.removeWire(duplicate.id);
      } else {
        const wire = S.createWire(dragData.startRef, endRef);
        S.selectWire(wire.id);
      }
    }

    clearPreview();
    dragMode = null;
    dragData = null;
    document.body.style.cursor = "";

    renderWires();
    window.ESB.CanvasInteractions.renderSelection();
  }

  function onPointerDownSelect(event) {
    if (window.ESB.Mode && window.ESB.Mode.getMode() !== "build") {
      return;
    }

    const deleteBtn = event.target.closest('[data-toolbar-action="delete-wire"]');
    if (deleteBtn) {
      const selectedWire = S.getSelectedWire();
      if (selectedWire) {
        S.removeWire(selectedWire.id);
        renderWires();
        window.ESB.CanvasInteractions.renderSelection();
      }
      event.preventDefault();
      // Stops canvas-interactions.js's own bubble-phase handler (now on
      // the ancestor #stage, so it fires *after* this one) from treating
      // the click as "nothing matched" and clearing what we just did.
      event.stopPropagation();
      return;
    }

    const wireEl = event.target.closest("[data-wire-id]");
    if (!wireEl) {
      return;
    }

    S.selectWire(wireEl.dataset.wireId);
    renderWires();
    window.ESB.CanvasInteractions.renderSelection();
    event.stopPropagation();

    // Selecting a wire and starting to drag it are the same touch/click —
    // the delete button (drawn by renderSelection, a separate element)
    // stays available regardless; this only takes effect if the pointer
    // actually moves before release.
    dragMode = "move-wire";
    dragData = { wireId: wireEl.dataset.wireId };
  }

  function init() {
    const svg = D.getElements().svg;

    svg.addEventListener("pointerdown", onPointerDownCapture, true);
    svg.addEventListener("pointerdown", onPointerDownSelect);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    renderWires();
  }

  window.ESB.WireTool = { init, renderWires, renderWireToolbar, findConnectionPoint };
})();
