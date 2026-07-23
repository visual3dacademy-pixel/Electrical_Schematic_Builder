// Version 0.8
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

  // Wiring is available in build and the two single-canvas modes (IDU/ODU
  // are otherwise full editors, just filtered to one HVAC unit's
  // components) — only Check Circuit (read-only built circuit) and Split
  // Screen (components/movement only, per spec) turn it off.
  function wiringAllowedInMode(mode) {
    return mode === "build" || mode === "idu" || mode === "odu";
  }

  function isCheckMode() {
    return !!(window.ESB.Mode && window.ESB.Mode.getMode() === "check");
  }

  function cancelWireInteraction() {
    dragMode = null;
    dragData = null;
    clearPreview();
    document.body.classList.remove("esb-wire-dragging");
    document.documentElement.classList.remove("esb-wire-dragging");
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";
  }

  // The canvasId a NEW wire/junction should be tagged with, given the
  // current mode — "idu"/"odu" while in one of the single-canvas modes,
  // null (shared/build) otherwise.
  function currentCanvasId() {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    return mode === "idu" || mode === "odu" ? mode : null;
  }

  // Whether an existing item's canvasId (a wire's, a junction's) should be
  // visible/usable in the given mode (defaults to the CURRENT mode).
  // Build (and Check) show everything unfiltered, exactly like instances
  // already do — only IDU/ODU actually scope things down to their own
  // circuit, so a wire drawn in one is never visible, or connectable,
  // from the other. An explicit forMode lets mode.js's split-screen
  // rendering ask "is this visible for the IDU/ODU panel" even though the
  // *actual* current mode at that moment is "split", not "idu"/"odu".
  function visibleInCurrentMode(canvasId, forMode) {
    let mode = forMode || (window.ESB.Mode ? window.ESB.Mode.getMode() : "build");
    if (mode === "check" && window.ESB.Mode && window.ESB.Mode.getActiveCanvasMode) {
      mode = window.ESB.Mode.getActiveCanvasMode();
    }
    if (mode !== "idu" && mode !== "odu") {
      return true;
    }
    return !canvasId || canvasId === mode;
  }

  // A wire's free end (drawn to blank canvas, not onto a terminal/rail/
  // another wire) may never sit outside the main ladder's own L1/L2 span —
  // there's nothing meaningful to the left of L1 or right of L2 for a wire
  // to reach.
  function clampToRailSpan(x) {
    const main = window.ESB.Sections.getById("main");
    return main ? Math.max(main.leftX, Math.min(main.rightX, x)) : x;
  }

  // A free end (dangling, on blank canvas — not snapped onto a real
  // terminal/junction/rail/wire) may never land on top of an unrelated
  // component's body: nothing marks that as an actual connection, so the
  // wire would just visually sit on/through the component while carrying
  // no real link to it, reading as wired when it isn't. Only checked for
  // axis-aligned (rotation 0) instances — the app's placeable components
  // are never rotated in practice, and a naive bounding-box check would be
  // wrong for one that is. excludeInstanceId skips the wire's own starting
  // component, if any — ending near where you started is normal.
  function pointInsideAnyInstance(point, excludeInstanceId) {
    return S.state.instances.some((instance) => {
      if (instance.id === excludeInstanceId || instance.rotation) {
        return false;
      }
      if (!visibleInCurrentMode(instance.canvasId)) {
        return false;
      }

      const type = Lib.getType(instance.typeId);
      if (!type || !type.width || !type.height) {
        return false;
      }

      const halfW = type.width / 2;
      const halfH = type.height / 2;
      return (
        point.x >= instance.x - halfW && point.x <= instance.x + halfW &&
        point.y >= instance.y - halfH && point.y <= instance.y + halfH
      );
    });
  }

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

      const touchesAtA = candidate.a.kind === "junction" && candidate.a.junctionId === ref.junctionId;
      const touchesAtB = candidate.b.kind === "junction" && candidate.b.junctionId === ref.junctionId;
      if (!touchesAtA && !touchesAtB) {
        return false;
      }

      // Determine the direction from the actual rendered segment touching
      // the junction, not from the far endpoint. A routed wire can bend, so
      // the far endpoint may suggest the wrong axis and cause a later branch
      // to overlap the existing path instead of meeting it perpendicularly.
      const path = getWirePath(candidate);
      if (!path || path.length < 2) {
        return false;
      }

      const p0 = touchesAtA ? path[0] : path[path.length - 1];
      const p1 = touchesAtA ? path[1] : path[path.length - 2];
      const dx = Math.abs(p1.x - p0.x);
      const dy = Math.abs(p1.y - p0.y);
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

  // Pure geometry: the 3-point bend for two points given already-decided
  // meeting-direction constraints (see requiredMeetingDirection) — does no
  // scanning of other wires itself. A's requirement wins if both happen to
  // have one, matching the priority already established for rails.
  function buildBendPath(pointA, pointB, directionA, directionB) {
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

  // Returns the side of a component on which a terminal sits, after the
  // instance's mirror/rotation has been applied. The side is expressed in
  // world space: "left", "right", "top", or "bottom".
  function terminalWorldSide(ref) {
    if (!ref || ref.kind !== "terminal") {
      return null;
    }

    const instance = S.getInstance(ref.instanceId);
    const type = instance ? Lib.getType(instance.typeId) : null;
    if (!instance || !type || !Array.isArray(type.terminals)) {
      return null;
    }

    const terminal = type.terminals.find((candidate) => candidate.id === ref.terminalId);
    if (!terminal) {
      return null;
    }

    // Infer the terminal's local side from the dominant offset from the
    // component center. This works for the library's horizontal, vertical,
    // and multi-terminal components without requiring every symbol file to
    // be rewritten with extra metadata.
    let localVector;
    if (Math.abs(terminal.x) >= Math.abs(terminal.y)) {
      localVector = { x: terminal.x < 0 ? -1 : 1, y: 0 };
    } else {
      localVector = { x: 0, y: terminal.y < 0 ? -1 : 1 };
    }

    if (instance.mirrored) {
      localVector.x *= -1;
    }
    const worldVector = G.rotatePoint(localVector, instance.rotation || 0);

    if (Math.abs(worldVector.x) >= Math.abs(worldVector.y)) {
      return worldVector.x < 0 ? "left" : "right";
    }
    return worldVector.y < 0 ? "top" : "bottom";
  }

  function instanceWorldBounds(instance) {
    const type = instance ? Lib.getType(instance.typeId) : null;
    if (!instance || !type || !type.width || !type.height) {
      return null;
    }

    const halfW = type.width / 2;
    const halfH = type.height / 2;
    const corners = [
      G.localToWorld({ x: -halfW, y: -halfH }, instance),
      G.localToWorld({ x: halfW, y: -halfH }, instance),
      G.localToWorld({ x: halfW, y: halfH }, instance),
      G.localToWorld({ x: -halfW, y: halfH }, instance)
    ];

    return {
      left: Math.min.apply(null, corners.map((point) => point.x)),
      right: Math.max.apply(null, corners.map((point) => point.x)),
      top: Math.min.apply(null, corners.map((point) => point.y)),
      bottom: Math.max.apply(null, corners.map((point) => point.y))
    };
  }

  // The point adjacent to a terminal may be perpendicular to the component
  // or may remain outside its body, but it may never lie inward through the
  // symbol. This is the core terminal-direction rule requested by the user.
  function terminalNeighborAllowed(ref, terminalPoint, neighborPoint) {
    const side = terminalWorldSide(ref);
    if (!side || !terminalPoint || !neighborPoint) {
      return true;
    }

    const epsilon = 0.5;
    if (side === "left") {
      return neighborPoint.x <= terminalPoint.x + epsilon;
    }
    if (side === "right") {
      return neighborPoint.x >= terminalPoint.x - epsilon;
    }
    if (side === "top") {
      return neighborPoint.y <= terminalPoint.y + epsilon;
    }
    return neighborPoint.y >= terminalPoint.y - epsilon;
  }

  function segmentEntersBounds(a, b, bounds) {
    if (!bounds) {
      return false;
    }

    const epsilon = 0.5;
    if (Math.abs(a.y - b.y) < epsilon) {
      const y = a.y;
      if (y <= bounds.top + epsilon || y >= bounds.bottom - epsilon) {
        return false;
      }
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      return maxX > bounds.left + epsilon && minX < bounds.right - epsilon;
    }

    if (Math.abs(a.x - b.x) < epsilon) {
      const x = a.x;
      if (x <= bounds.left + epsilon || x >= bounds.right - epsilon) {
        return false;
      }
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      return maxY > bounds.top + epsilon && minY < bounds.bottom - epsilon;
    }

    return true;
  }

  function pathRespectsTerminalComponent(path, ref, atStart) {
    if (!ref || ref.kind !== "terminal" || !path || path.length < 2) {
      return true;
    }

    const terminalPoint = atStart ? path[0] : path[path.length - 1];
    const neighborPoint = atStart ? path[1] : path[path.length - 2];
    if (!terminalNeighborAllowed(ref, terminalPoint, neighborPoint)) {
      return false;
    }

    const instance = S.getInstance(ref.instanceId);
    const bounds = instanceWorldBounds(instance);
    for (let i = 0; i < path.length - 1; i += 1) {
      if (segmentEntersBounds(path[i], path[i + 1], bounds)) {
        return false;
      }
    }
    return true;
  }

  function pathLength(path) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i += 1) {
      total += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y);
    }
    return total;
  }

  function compactOrthogonalPath(path) {
    const compact = [];
    (path || []).forEach((point) => {
      const next = { x: point.x, y: point.y };
      const previous = compact[compact.length - 1];
      if (!previous || Math.abs(previous.x - next.x) > 0.5 || Math.abs(previous.y - next.y) > 0.5) {
        compact.push(next);
      }
    });

    let changed = true;
    while (changed && compact.length >= 3) {
      changed = false;
      for (let i = 1; i < compact.length - 1; i += 1) {
        const a = compact[i - 1];
        const b = compact[i];
        const c = compact[i + 1];
        if ((Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
            (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5)) {
          compact.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return compact;
  }

  function terminalSafePath(pointA, pointB, refA, refB, preferredPath) {
    const candidates = [];
    const addCandidate = (path) => {
      const compact = compactOrthogonalPath(path);
      if (compact.length < 2) {
        return;
      }
      const key = compact.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join("|");
      if (!candidates.some((candidate) => candidate.key === key)) {
        candidates.push({ key, path: compact });
      }
    };

    addCandidate(preferredPath);
    addCandidate([pointA, { x: pointA.x, y: pointB.y }, pointB]);
    addCandidate([pointA, { x: pointB.x, y: pointA.y }, pointB]);

    const grid = C.PLACEMENT_GRID || 20;
    const refs = [refA, refB].filter((ref) => ref && ref.kind === "terminal");
    const boundsList = refs.map((ref) => instanceWorldBounds(S.getInstance(ref.instanceId))).filter(Boolean);

    const yCandidates = [];
    const xCandidates = [];
    boundsList.forEach((bounds) => {
      yCandidates.push(
        Math.floor((bounds.top - grid) / grid) * grid,
        Math.ceil((bounds.bottom + grid) / grid) * grid
      );
      xCandidates.push(
        Math.floor((bounds.left - grid) / grid) * grid,
        Math.ceil((bounds.right + grid) / grid) * grid
      );
    });

    yCandidates.forEach((y) => addCandidate([
      pointA,
      { x: pointA.x, y },
      { x: pointB.x, y },
      pointB
    ]));
    xCandidates.forEach((x) => addCandidate([
      pointA,
      { x, y: pointA.y },
      { x, y: pointB.y },
      pointB
    ]));

    const valid = candidates.filter((candidate) => {
      return pathRespectsTerminalComponent(candidate.path, refA, true) &&
        pathRespectsTerminalComponent(candidate.path, refB, false);
    });

    if (!valid.length) {
      // This should be rare, but returning the preferred route keeps the
      // drawing tool responsive instead of dropping a wire unexpectedly.
      return compactOrthogonalPath(preferredPath);
    }

    valid.sort((a, b) => pathLength(a.path) - pathLength(b.path));
    return valid[0].path;
  }

  // Live/prospective version of the bend above — scans the graph as it
  // currently stands. Only ever used for a wire that doesn't exist yet:
  // choosing the shape a new wire will commit with, and the drag preview.
  // A wire's meetingDirectionA/B (see state.js's createWire) captures
  // exactly this, once, at the moment it's actually created — after that,
  // wirePath below reads the stored value instead of calling this again,
  // which is what keeps an already-committed wire's shape a hard lock:
  // drawing more wires later that touch the same junction must never
  // retroactively reroute it.
  function resolveBend(pointA, pointB, refA, refB, excludeWireId) {
    const directionA = requiredMeetingDirection(refA, excludeWireId);
    const directionB = requiredMeetingDirection(refB, excludeWireId);

    const preferred = buildBendPath(pointA, pointB, directionA, directionB);
    return terminalSafePath(pointA, pointB, refA, refB, preferred);
  }

  // The rendered path for one wire — a plain 2-segment orthogonal bend by
  // default, or (once the user has dragged it) a 3-segment path with a
  // freely-repositionable horizontal jog at wire.bendY. Either way every
  // segment stays strictly horizontal/vertical, matching the rest of the
  // library's ladder-diagram convention. Rail connections, and junctions
  // that already had another wire *at creation time*, always use the
  // perpendicular-meeting path above instead — there's nothing meaningful
  // to drag when one end's direction is already fixed like that, so bendY
  // is ignored for them. Deliberately reads wire.meetingDirectionA/B (frozen
  // at creation) rather than re-deriving it from the graph's current state —
  // otherwise a wire drawn later, touching the same junction from a
  // different direction, would silently reroute this one on its next render.
  function wirePath(wire, pointA, pointB) {
    let preferred;

    if (Array.isArray(wire.fixedPath) && wire.fixedPath.length >= 2) {
      preferred = wire.fixedPath.map((point) => ({ x: point.x, y: point.y }));
      // Keep the route locked while still allowing its actual endpoint refs
      // to resolve live if a terminal, rail, or junction moves later.
      preferred[0] = pointA;
      preferred[preferred.length - 1] = pointB;
    } else if (wire.meetingDirectionA || wire.meetingDirectionB) {
      preferred = buildBendPath(pointA, pointB, wire.meetingDirectionA, wire.meetingDirectionB);
    } else if (wire.bendY === undefined || wire.bendY === null) {
      preferred = G.orthogonalPath(pointA, pointB);
    } else {
      preferred = [
        pointA,
        { x: pointA.x, y: wire.bendY },
        { x: pointB.x, y: wire.bendY },
        pointB
      ];
    }

    return terminalSafePath(pointA, pointB, wire.a, wire.b, preferred);
  }

  // Public wrapper around wirePath for other modules (canvas-
  // interactions.js's overlap/doubling checks) that need a wire's actual
  // rendered path — not just its two raw endpoints — since a rail-
  // connected wire always bends (rails require a perpendicular
  // departure), so the endpoint alone usually isn't even colinear with
  // anything near it; only the bend corner right next to a junction is.
  // Path points always run start-to-end in wire.a → wire.b order, matching
  // wirePath's own pointA/pointB convention.
  function getWirePath(wire) {
    const pointA = G.resolveRefPoint(wire.a);
    const pointB = G.resolveRefPoint(wire.b);
    if (!pointA || !pointB) {
      return null;
    }
    return wirePath(wire, pointA, pointB);
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
      if (instance.id === excludeInstanceId || instance.placementPending) {
        return;
      }
      // IDU/ODU are independent circuits — a wire being drawn in one must
      // never be able to snap onto a component that only exists in the
      // other.
      if (!visibleInCurrentMode(instance.canvasId)) {
        return;
      }

      const type = Lib.getType(instance.typeId);

      // Meter probes are measuring instruments, never circuit nodes. They
      // remain in application state while Build Circuit is active so their
      // positions persist between checks, but a newly drawn wire must never
      // snap to a hidden probe terminal. That stale connection caused a wire
      // to follow the probe when Check Circuit was entered again.
      if (!type || type.pivotAtTip || instance.typeId.indexOf("meter_lead_") === 0) {
        return;
      }

      type.terminals.forEach((terminal) => {
        points.push({
          ref: { kind: "terminal", instanceId: instance.id, terminalId: terminal.id },
          point: G.localToWorld({ x: terminal.x, y: terminal.y }, instance)
        });
      });
    });

    S.state.junctions.forEach((junction) => {
      if (!visibleInCurrentMode(junction.canvasId)) {
        return;
      }

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

        // Same "nothing exists past L1/L2" rule clampToRailSpan applies to a
        // free end — past the rail's own outer edge there's nothing else to
        // hit, so any release out there (however far) still means the rail,
        // not a snap-radius miss that falls through to a floating junction
        // sitting right on top of the rail line but not actually part of it.
        const isPastOutside = rail.side === "left" ? point.x <= rail.x : point.x >= rail.x;
        const withinRailSpan = point.y >= bounds.topY && point.y <= bounds.bottomY;

        if (isPastOutside && withinRailSpan) {
          bestDist = 0;
          best = {
            ref: { kind: "rail", railId: rail.railId, y: point.y },
            point: { x: rail.x, y: point.y }
          };
          return;
        }

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
      // IDU/ODU independence — a wire being drawn in one mode should never
      // tee into a wire that only exists in the other.
      if (!visibleInCurrentMode(wire.canvasId)) {
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
          best = {
            ref: { kind: "wire-tee", wireId: wire.id },
            point: hit.point,
            segmentIndex: i,
            targetPath: path.map((pathPoint) => ({ x: pathPoint.x, y: pathPoint.y }))
          };
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
  function junctionWireCount(junctionId, forMode) {
    return S.state.wires.filter((wire) => {
      if (!visibleInCurrentMode(wire.canvasId, forMode)) {
        return false;
      }
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

  // The axis/extent of a rendered path's very first segment — path[0] is
  // always wherever that path starts, regardless of how many points follow,
  // so this works uniformly for a plain 2-point straight line, a 3-point
  // rail/junction bend, or a 4-point user-dragged bendY jog. Returns null
  // for a degenerate (zero-length) first segment.
  function firstSegmentInfo(path) {
    const p0 = path[0];
    const p1 = path[1];

    if (Math.abs(p1.x - p0.x) < 0.5 && Math.abs(p1.y - p0.y) < 0.5) {
      return null;
    }

    const axis = Math.abs(p1.x - p0.x) < 0.5 ? "y" : "x";
    return { axis, startValue: p0[axis], endValue: p1[axis] };
  }

  // Re-tracing a wire exactly (same two endpoints, either order) already
  // erases it — see the "duplicate" check in onPointerUp. But drawing a new
  // wire from the same start point *past* a shorter existing wire already
  // occupying part of that same run left the old, now-redundant wire
  // doubled up underneath the new, longer one instead of being absorbed
  // into it. Compares actual rendered paths (not just raw endpoints) so
  // this also catches the by far most common case: a wire terminating on a
  // rail is almost always a bent path (the terminal's x essentially never
  // equals the rail's x), which a plain raw-endpoint comparison would never
  // recognize as an extension of the same run at all.
  function removeSubsumedWires(startRef, startPoint, endPoint, endRef) {
    const newPath = resolveBend(startPoint, endPoint, startRef, endRef, null);
    const newSeg = firstSegmentInfo(newPath);
    if (!newSeg) {
      return;
    }

    const newLo = Math.min(newSeg.startValue, newSeg.endValue);
    const newHi = Math.max(newSeg.startValue, newSeg.endValue);

    const toRemove = S.state.wires.filter((candidate) => {
      if (!visibleInCurrentMode(candidate.canvasId)) {
        return false;
      }

      let candidateStartsShared = S.sameRef(candidate.a, startRef);
      if (!candidateStartsShared && !S.sameRef(candidate.b, startRef)) {
        return false;
      }

      const pointA = G.resolveRefPoint(candidate.a);
      const pointB = G.resolveRefPoint(candidate.b);
      if (!pointA || !pointB) {
        return false;
      }

      let candidatePath = wirePath(candidate, pointA, pointB);
      if (!candidateStartsShared) {
        candidatePath = candidatePath.slice().reverse();
      }

      const candSeg = firstSegmentInfo(candidatePath);
      if (!candSeg || candSeg.axis !== newSeg.axis) {
        return false;
      }

      // The old wire's own initial run, from the shared start, lands
      // strictly within the new wire's longer initial run — i.e. it's a
      // shorter stub now fully re-traced (and extended past) by the new
      // wire, whatever the two wires' far ends end up being individually.
      const candFar = candSeg.endValue;
      return candFar > newLo + 0.5 && candFar <= newHi + 0.5;
    });

    toRemove.forEach((wire) => S.removeWire(wire.id));
  }

  // Builds the temporary schematic "wire jump" geometry used only for
  // rendering. The stored wire path always remains orthogonal and unchanged.
  // Whenever two unconnected perpendicular wire segments cross, the newer
  // wire (later in state.wires) receives a small semicircular bridge. Because
  // crossings are recalculated on every render, deleting or moving either
  // wire automatically removes the bridge and restores the remaining wire to
  // a normal straight path.
  const WIRE_JUMP_RADIUS = 13;
  const WIRE_JUMP_HEIGHT = 12;
  const CROSS_EPSILON = 0.01;

  function nearlyEqual(a, b) {
    return Math.abs(a - b) <= CROSS_EPSILON;
  }

  function pointIsSegmentEndpoint(point, a, b) {
    return (
      (nearlyEqual(point.x, a.x) && nearlyEqual(point.y, a.y)) ||
      (nearlyEqual(point.x, b.x) && nearlyEqual(point.y, b.y))
    );
  }

  function segmentOrientation(a, b) {
    if (nearlyEqual(a.y, b.y) && !nearlyEqual(a.x, b.x)) {
      return "horizontal";
    }
    if (nearlyEqual(a.x, b.x) && !nearlyEqual(a.y, b.y)) {
      return "vertical";
    }
    return null;
  }

  function strictlyBetween(value, endA, endB) {
    const min = Math.min(endA, endB) + CROSS_EPSILON;
    const max = Math.max(endA, endB) - CROSS_EPSILON;
    return value > min && value < max;
  }

  function perpendicularIntersection(segmentA, segmentB) {
    if (segmentA.orientation === segmentB.orientation) {
      return null;
    }

    const horizontal = segmentA.orientation === "horizontal" ? segmentA : segmentB;
    const vertical = segmentA.orientation === "vertical" ? segmentA : segmentB;
    const point = { x: vertical.a.x, y: horizontal.a.y };

    // A jump is only valid for a true interior crossing. Any endpoint touch
    // is a terminal, bend, or tee/junction case and must never receive an arc.
    if (
      !strictlyBetween(point.x, horizontal.a.x, horizontal.b.x) ||
      !strictlyBetween(point.y, vertical.a.y, vertical.b.y) ||
      pointIsSegmentEndpoint(point, segmentA.a, segmentA.b) ||
      pointIsSegmentEndpoint(point, segmentB.a, segmentB.b)
    ) {
      return null;
    }

    return point;
  }

  function collectRenderableWires(forMode) {
    return S.state.wires.reduce((records, wire, wireIndex) => {
      if (!visibleInCurrentMode(wire.canvasId, forMode)) {
        return records;
      }

      const pointA = G.resolveRefPoint(wire.a);
      const pointB = G.resolveRefPoint(wire.b);
      if (!pointA || !pointB) {
        return records;
      }

      const path = wirePath(wire, pointA, pointB);
      const segments = [];
      for (let i = 0; i < path.length - 1; i += 1) {
        const orientation = segmentOrientation(path[i], path[i + 1]);
        if (!orientation) {
          continue;
        }
        segments.push({
          a: path[i],
          b: path[i + 1],
          pathIndex: i,
          orientation,
          jumps: []
        });
      }

      records.push({ wire, wireIndex, pointA, pointB, path, segments });
      return records;
    }, []);
  }

  function assignWireJumps(records) {
    for (let i = 0; i < records.length; i += 1) {
      for (let j = i + 1; j < records.length; j += 1) {
        const older = records[i];
        const newer = records[j];

        older.segments.forEach((olderSegment) => {
          newer.segments.forEach((newerSegment) => {
            const crossing = perpendicularIntersection(olderSegment, newerSegment);
            if (!crossing) {
              return;
            }

            // The newer wire jumps over the older wire. Nothing is written to
            // application state; this is temporary display-only geometry.
            newerSegment.jumps.push(crossing);
          });
        });
      }
    }
  }

  function segmentLength(a, b) {
    return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }

  function pointAlongSegment(a, b, distance) {
    const total = segmentLength(a, b);
    const ratio = total > 0 ? distance / total : 0;
    return {
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio
    };
  }

  function distanceFromSegmentStart(segment, point) {
    return segment.orientation === "horizontal"
      ? Math.abs(point.x - segment.a.x)
      : Math.abs(point.y - segment.a.y);
  }

  function wirePathWithJumps(record) {
    if (!record.segments.some((segment) => segment.jumps.length > 0)) {
      return null;
    }

    let d = `M ${record.path[0].x} ${record.path[0].y}`;

    record.segments.forEach((segment) => {
      const length = segmentLength(segment.a, segment.b);
      const sortedJumps = segment.jumps
        .map((point) => ({ point, distance: distanceFromSegmentStart(segment, point) }))
        .sort((left, right) => left.distance - right.distance);

      let cursorDistance = 0;
      sortedJumps.forEach((jump) => {
        // Keep the bridge fully inside the segment and prevent two nearby
        // crossings from creating overlapping arcs.
        const radius = Math.min(WIRE_JUMP_RADIUS, jump.distance, length - jump.distance);
        const startDistance = jump.distance - radius;
        const endDistance = jump.distance + radius;
        if (radius < 3 || startDistance < cursorDistance - CROSS_EPSILON) {
          return;
        }

        const before = pointAlongSegment(segment.a, segment.b, startDistance);
        const after = pointAlongSegment(segment.a, segment.b, endDistance);
        d += ` L ${before.x} ${before.y}`;

        // Horizontal bridges bow upward; vertical bridges bow left, matching
        // the standard schematic crossing convention shown in the reference.
        const control = segment.orientation === "horizontal"
          ? { x: jump.point.x, y: jump.point.y - WIRE_JUMP_HEIGHT }
          : { x: jump.point.x - WIRE_JUMP_HEIGHT, y: jump.point.y };

        d += ` Q ${control.x} ${control.y} ${after.x} ${after.y}`;
        cursorDistance = endDistance;
      });

      d += ` L ${segment.b.x} ${segment.b.y}`;
    });

    return d;
  }

  // Core wire+junction rendering, reusable for both the main canvas
  // (renderWires, using the live current mode) and a split-screen panel
  // (mode.js's renderWiresForCanvas, which needs an explicit "idu"/"odu"
  // since the *actual* current mode while in split screen is "split", not
  // either single-canvas mode).
  function renderWiresIntoLayer(layer, forMode) {
    const records = collectRenderableWires(forMode);
    assignWireJumps(records);

    records.forEach((record) => {
      const wire = record.wire;
      const isSelected = wire.id === S.state.selectedWireId;

      // Selection follows the underlying orthogonal route. The bridge is a
      // visual convention only and does not alter hit-testing or connectivity.
      D.polyline(
        record.path,
        {
          "data-wire-id": wire.id,
          stroke: "transparent",
          "stroke-width": 22,
          "pointer-events": isCheckMode() ? "none" : "stroke",
          style: isCheckMode() ? "pointer-events:none;" : "cursor:pointer;"
        },
        layer
      );

      const jumpedPath = wirePathWithJumps(record);
      const visibleOptions = {
        "data-wire-id": wire.id,
        stroke: isSelected ? "#2377e8" : "#111111",
        "stroke-width": isSelected ? 5 : 4,
        "pointer-events": "none"
      };

      if (jumpedPath) {
        D.path(jumpedPath, visibleOptions, layer);
      } else {
        D.polyline(record.path, visibleOptions, layer);
      }

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
      if (!visibleInCurrentMode(junction.canvasId, forMode)) {
        return;
      }

      const wireCount = junctionWireCount(junction.id, forMode);

      // Only a genuine 3+ way tie gets a solid dot — 2 wires meeting here
      // is just a bend (the same logical wire drawn in two gestures), not
      // a real junction.
      if (wireCount >= 3) {
        D.circle(junction.x, junction.y, 6, { fill: "#111111", stroke: "none" }, layer);
      } else if (wireCount === 1) {
        D.circle(
          junction.x, junction.y, 5.5,
          { fill: "#ffffff", stroke: "#111111", "stroke-width": 2.5 },
          layer
        );
      }

      D.circle(
        junction.x,
        junction.y,
        C.TERMINAL_HIT_RADIUS,
        { fill: "transparent", stroke: "none", style: "cursor:crosshair;" },
        layer
      );
    });
  }

  function refTouchesMeterLead(ref) {
    if (!ref || ref.kind !== "terminal") return false;
    const instance = S.getInstance(ref.instanceId);
    return !!(instance && instance.typeId.indexOf("meter_lead_") === 0);
  }

  // Migration guard for files created before v4.1. Meter leads are probes,
  // not schematic terminals, so any stored wire endpoint that references a
  // lead is invalid and must be removed before rendering or solving.
  function purgeProbeAttachedWires() {
    const invalidIds = S.state.wires
      .filter((wire) => refTouchesMeterLead(wire.a) || refTouchesMeterLead(wire.b))
      .map((wire) => wire.id);

    invalidIds.forEach((wireId) => S.removeWire(wireId));
    return invalidIds.length;
  }

  function renderWires() {
    const layer = document.getElementById("wireLayer");
    D.clearGroup(layer);
    renderWiresIntoLayer(layer, null);
  }

  // Public entry point for mode.js's split-screen panels — draws wires
  // into an arbitrary layer, scoped to an explicit "idu"/"odu" rather than
  // whatever the actual current mode happens to be. Does not clear the
  // layer itself (the caller already clears/rebuilds the whole panel SVG
  // each render, see mode.js's renderSplitCanvas).
  function renderWiresForCanvas(layer, canvasId) {
    renderWiresIntoLayer(layer, canvasId);
  }

  // Draws the selected wire's delete button into the given layer (owned
  // and cleared by canvas-interactions.js's renderSelection, which sits
  // above instancesLayer — a button drawn into wireLayer itself would sit
  // *behind* instances and could have its clicks stolen by them).
  function renderWireToolbar(layer, wire) {
    if (isCheckMode()) return;

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
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    if (!wiringAllowedInMode(mode)) {
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

    // A rail is a bus — any point along its length is a valid click, so
    // unlike a terminal/junction (already a fixed point) the exact Y
    // clicked is otherwise arbitrary. Snapping it to the same row grid
    // everything else uses means a wire started here lands on a
    // predictable row from the very first pixel, not wherever the click
    // happened to land.
    let startRef = hit.ref;
    let startPoint = hit.point;
    if (startRef.kind === "rail") {
      const snappedY = window.ESB.Sections.getNearestRowY(startPoint.y);
      startRef = { kind: "rail", railId: startRef.railId, y: snappedY };
      startPoint = { x: startPoint.x, y: snappedY };
    }

    dragMode = "drawing-wire";
    dragData = { startRef, startPoint };
    renderPreview(startPoint, startPoint, true, startRef, null);

    // Without this, the cursor reverts to whatever's under the pointer
    // mid-drag (grab over a component body, default over blank canvas) —
    // forcing it here keeps the crosshair for the whole gesture, so it
    // reads as "drawing a wire" the entire time, not just at the start.
    document.body.classList.add("esb-wire-dragging");
    document.documentElement.classList.add("esb-wire-dragging");
    document.body.style.cursor = "crosshair";
    document.documentElement.style.cursor = "crosshair";
  }

  function onPointerMove(event) {
    if (isCheckMode()) {
      if (dragMode) cancelWireInteraction();
      return;
    }

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
    let endPoint = snapHit
      ? snapHit.point
      : { x: clampToRailSpan(point.x), y: window.ESB.Sections.getNearestRowY(point.y) };

    // Matches the row-snap applied at commit time (see onPointerUp) so the
    // preview doesn't show one position while the actual drop lands
    // elsewhere on the fixed wire-row grid.
    if (snapHit && snapHit.ref.kind === "rail") {
      endPoint = { x: endPoint.x, y: window.ESB.Sections.getNearestRowY(endPoint.y) };
    }

    // Preview-only: matches the horizontal lock applied at commit time (see
    // onPointerUp), so the wire doesn't visibly snap straight only at the
    // very end of the drag.
    if (isTransformerTerminal(dragData.startRef)) {
      endPoint = { x: endPoint.x, y: dragData.startPoint.y };
    }

    // A free end landing on another component's body renders exactly like
    // any other unsnapped point already (grey, via snapHit being falsy) —
    // matches onPointerUp's own rejection of that same drop at commit time,
    // so the preview never promises a wire the release won't actually create.
    renderPreview(dragData.startPoint, endPoint, !!snapHit, dragData.startRef, snapHit ? snapHit.ref : null);
  }

  function pointsEqual(a, b) {
    return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  }

  function cleanPath(path) {
    const cleaned = [];
    path.forEach((point) => {
      if (!cleaned.length || !pointsEqual(cleaned[cleaned.length - 1], point)) {
        cleaned.push({ x: point.x, y: point.y });
      }
    });
    return cleaned;
  }

  // Canonicalizes a stored orthogonal route after two wire pieces are merged.
  // The merge point is supplied explicitly so both original pieces use the
  // exact same coordinate instead of preserving two points that merely fell
  // within the endpoint snap tolerance. That near-match was able to create a
  // tiny off-grid dogleg/stub after the temporary open-circle junction was
  // removed.
  function canonicalizeMergedPath(path, mergePoint) {
    if (!Array.isArray(path) || path.length < 2) {
      return path;
    }

    let result = cleanPath(path.map((point) => ({ x: point.x, y: point.y })));

    // Make every point that represents the former temporary junction use one
    // authoritative coordinate from State. This prevents a 1-10 px jog where
    // independently routed wire pieces met only approximately.
    if (mergePoint) {
      result = result.map((point) => {
        if (pointsEqual(point, mergePoint)) {
          return { x: mergePoint.x, y: mergePoint.y };
        }
        return point;
      });
      result = cleanPath(result);
    }

    // Remove redundant straight-through points and collinear backtracking.
    // For any A-B-C on one axis, B adds no valid corner, regardless of whether
    // the route continued forward or briefly reversed over itself.
    let changed = true;
    while (changed && result.length >= 3) {
      changed = false;
      for (let i = 1; i < result.length - 1; i += 1) {
        const a = result[i - 1];
        const b = result[i];
        const c = result[i + 1];
        const ab = segmentOrientation(a, b);
        const bc = segmentOrientation(b, c);
        if (ab && ab === bc) {
          result.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    // Final safety pass: a fixedPath must contain only true horizontal or
    // vertical segments. If a sub-pixel mismatch remains, align the later
    // point to the prior segment rather than storing a diagonal/off-grid jog.
    for (let i = 1; i < result.length; i += 1) {
      const previous = result[i - 1];
      const current = result[i];
      if (segmentOrientation(previous, current)) {
        continue;
      }

      const dx = Math.abs(current.x - previous.x);
      const dy = Math.abs(current.y - previous.y);
      if (dx <= 0.5) {
        current.x = previous.x;
      } else if (dy <= 0.5) {
        current.y = previous.y;
      }
    }

    return cleanPath(result);
  }

  // Splits a rendered orthogonal polyline at a tee point. The returned
  // paths are exact subsets of the original route, so replacing the target
  // wire cannot change its geometry or create a doubled segment elsewhere.
  function splitRenderedPath(path, segmentIndex, point) {
    if (!Array.isArray(path) || path.length < 2 || segmentIndex < 0 || segmentIndex >= path.length - 1) {
      return null;
    }

    const splitPoint = { x: point.x, y: point.y };
    const left = cleanPath(path.slice(0, segmentIndex + 1).concat([splitPoint]));
    const right = cleanPath([splitPoint].concat(path.slice(segmentIndex + 1)));

    if (left.length < 2 || right.length < 2) {
      return null;
    }

    return { left, right };
  }


  // Returns a point on an orthogonal segment using inclusive bounds.
  function pointOnSegmentInclusive(point, a, b) {
    const orientation = segmentOrientation(a, b);
    if (orientation === "horizontal") {
      return nearlyEqual(point.y, a.y) && point.x >= Math.min(a.x, b.x) - CROSS_EPSILON && point.x <= Math.max(a.x, b.x) + CROSS_EPSILON;
    }
    if (orientation === "vertical") {
      return nearlyEqual(point.x, a.x) && point.y >= Math.min(a.y, b.y) - CROSS_EPSILON && point.y <= Math.max(a.y, b.y) + CROSS_EPSILON;
    }
    return false;
  }

  function perpendicularIntersectionInclusive(a1, a2, b1, b2) {
    const orientationA = segmentOrientation(a1, a2);
    const orientationB = segmentOrientation(b1, b2);
    if (!orientationA || !orientationB || orientationA === orientationB) {
      return null;
    }
    const horizontalA = orientationA === "horizontal";
    const point = horizontalA ? { x: b1.x, y: a1.y } : { x: a1.x, y: b1.y };
    return pointOnSegmentInclusive(point, a1, a2) && pointOnSegmentInclusive(point, b1, b2) ? point : null;
  }

  function collinearOverlap(a1, a2, b1, b2) {
    const orientationA = segmentOrientation(a1, a2);
    const orientationB = segmentOrientation(b1, b2);
    if (!orientationA || orientationA !== orientationB) {
      return null;
    }
    if (orientationA === "horizontal" && !nearlyEqual(a1.y, b1.y)) {
      return null;
    }
    if (orientationA === "vertical" && !nearlyEqual(a1.x, b1.x)) {
      return null;
    }
    const axis = orientationA === "horizontal" ? "x" : "y";
    const lo = Math.max(Math.min(a1[axis], a2[axis]), Math.min(b1[axis], b2[axis]));
    const hi = Math.min(Math.max(a1[axis], a2[axis]), Math.max(b1[axis], b2[axis]));
    if (hi - lo <= CROSS_EPSILON) {
      return null;
    }
    return { orientation: orientationA, lo, hi };
  }

  function pathPrefixAt(path, segmentIndex, point) {
    return cleanPath(path.slice(0, segmentIndex + 1).concat([{ x: point.x, y: point.y }]));
  }

  function pathDistanceTo(path, segmentIndex, point) {
    let distance = 0;
    for (let i = 0; i < segmentIndex; i += 1) {
      distance += segmentLength(path[i], path[i + 1]);
    }
    distance += segmentLength(path[segmentIndex], point);
    return distance;
  }

  // Finds the earliest collinear overlap along a newly committed route.
  // Perpendicular intersections are deliberately NOT treated as conflicts:
  // a wire that passes through another wire must continue and receive a
  // display-only jump arc. Only a doubled collinear run is trimmed/rejected.
  function firstCollinearOverlapForWire(newWire, newPath) {
    let bestOverlap = null;

    for (let newIndex = 0; newIndex < newPath.length - 1; newIndex += 1) {
      const newA = newPath[newIndex];
      const newB = newPath[newIndex + 1];
      if (!segmentOrientation(newA, newB)) {
        continue;
      }

      S.state.wires.forEach((candidate) => {
        if (candidate.id === newWire.id || !visibleInCurrentMode(candidate.canvasId)) {
          return;
        }
        const candidatePath = getWirePath(candidate);
        if (!candidatePath) {
          return;
        }

        for (let candidateIndex = 0; candidateIndex < candidatePath.length - 1; candidateIndex += 1) {
          const oldA = candidatePath[candidateIndex];
          const oldB = candidatePath[candidateIndex + 1];
          const overlap = collinearOverlap(newA, newB, oldA, oldB);
          if (!overlap) {
            continue;
          }

          const axis = overlap.orientation === "horizontal" ? "x" : "y";
          const forward = newB[axis] >= newA[axis];
          const firstValue = forward ? overlap.lo : overlap.hi;
          const point = overlap.orientation === "horizontal"
            ? { x: firstValue, y: newA.y }
            : { x: newA.x, y: firstValue };
          const distance = pathDistanceTo(newPath, newIndex, point);

          if (distance > 0.5 && (!bestOverlap || distance < bestOverlap.distance)) {
            bestOverlap = {
              distance,
              point,
              newSegmentIndex: newIndex,
              targetWire: candidate,
              targetPath: candidatePath,
              targetSegmentIndex: candidateIndex,
              orientation: overlap.orientation
            };
          }
        }
      });
    }

    return bestOverlap;
  }

  function splitWireAtPoint(targetWire, targetPath, targetSegmentIndex, point) {
    const split = splitRenderedPath(targetPath, targetSegmentIndex, point);
    if (!split) {
      return null;
    }
    const junction = S.createJunction(point.x, point.y, targetWire.canvasId);
    const junctionRef = { kind: "junction", junctionId: junction.id };
    S.createWire(targetWire.a, junctionRef, targetWire.canvasId, {
      fixedPath: split.left,
      meetingDirectionA: null,
      meetingDirectionB: null
    });
    S.createWire(junctionRef, targetWire.b, targetWire.canvasId, {
      fixedPath: split.right,
      meetingDirectionA: null,
      meetingDirectionB: null
    });
    S.removeWire(targetWire.id);
    return junctionRef;
  }

  function junctionAtPoint(point) {
    const junction = S.state.junctions.find((candidate) => {
      return visibleInCurrentMode(candidate.canvasId) &&
        nearlyEqual(candidate.x, point.x) && nearlyEqual(candidate.y, point.y);
    });
    return junction ? { kind: "junction", junctionId: junction.id } : null;
  }

  // At the exact point where a doubled collinear run begins, look for a
  // perpendicular wire. This is the only geometry that may create the
  // junction dot used when the excess portion is trimmed away.
  function perpendicularTargetAtPoint(newWire, newPath, overlap) {
    const newA = newPath[overlap.newSegmentIndex];
    const newB = newPath[overlap.newSegmentIndex + 1];
    const newOrientation = segmentOrientation(newA, newB);
    let result = null;

    S.state.wires.some((candidate) => {
      if (candidate.id === newWire.id || candidate.id === overlap.targetWire.id ||
          !visibleInCurrentMode(candidate.canvasId)) {
        return false;
      }
      const path = getWirePath(candidate);
      if (!path) {
        return false;
      }

      for (let i = 0; i < path.length - 1; i += 1) {
        const orientation = segmentOrientation(path[i], path[i + 1]);
        if (!orientation || orientation === newOrientation) {
          continue;
        }
        if (pointOnSegmentInclusive(overlap.point, path[i], path[i + 1])) {
          result = { wire: candidate, path, segmentIndex: i };
          return true;
        }
      }
      return false;
    });

    return result;
  }

  // Enforces no-overlap without destroying normal schematic crossings:
  // - perpendicular interior crossings remain untouched and render as arcs;
  // - a collinear doubled section is removed from the new route;
  // - when that overlap begins exactly on a perpendicular wire, the new
  //   route ends there and a genuine junction dot is created;
  // - otherwise the invalid overlapping wire is discarded.
  function normalizeCommittedWire(newWire) {
    const newPath = getWirePath(newWire);
    if (!newPath) {
      return newWire;
    }

    const overlap = firstCollinearOverlapForWire(newWire, newPath);
    if (!overlap) {
      return newWire;
    }

    const prefix = pathPrefixAt(newPath, overlap.newSegmentIndex, overlap.point);
    const startRef = newWire.a;
    const canvasId = newWire.canvasId;
    const existingJunction = junctionAtPoint(overlap.point);
    const perpendicular = perpendicularTargetAtPoint(newWire, newPath, overlap);

    S.removeWire(newWire.id);

    let endRef = existingJunction;
    if (!endRef && perpendicular) {
      endRef = splitWireAtPoint(
        perpendicular.wire,
        perpendicular.path,
        perpendicular.segmentIndex,
        overlap.point
      );
    }

    if (!endRef || prefix.length < 2 || S.sameRef(startRef, endRef)) {
      return null;
    }

    return S.createWire(startRef, endRef, canvasId, {
      fixedPath: prefix,
      meetingDirectionA: null,
      meetingDirectionB: null
    });
  }

  function wireTouchesJunction(wire, junctionId) {
    return (
      (wire.a.kind === "junction" && wire.a.junctionId === junctionId) ||
      (wire.b.kind === "junction" && wire.b.junctionId === junctionId)
    );
  }

  function orientedPathAwayFromJunction(wire, junctionId) {
    const path = getWirePath(wire);
    if (!path) {
      return null;
    }
    if (wire.a.kind === "junction" && wire.a.junctionId === junctionId) {
      return { outerRef: wire.b, path: path.slice() };
    }
    if (wire.b.kind === "junction" && wire.b.junctionId === junctionId) {
      return { outerRef: wire.a, path: path.slice().reverse() };
    }
    return null;
  }

  // When a learner extends a dangling wire from its open-circle endpoint,
  // the temporary endpoint junction is no longer meaningful. Merge the two
  // pieces into one stored wire and remove that junction. The combined fixed
  // path preserves every bend exactly, and the open circle disappears.
  function mergeExtendedOpenEndpoint(wire) {
    if (!wire) {
      return wire;
    }

    const junctionRefs = [wire.a, wire.b].filter((ref) => ref.kind === "junction");
    for (let r = 0; r < junctionRefs.length; r += 1) {
      const junctionId = junctionRefs[r].junctionId;
      const touching = S.state.wires.filter((candidate) => wireTouchesJunction(candidate, junctionId));
      if (touching.length !== 2) {
        continue;
      }

      const first = touching[0];
      const second = touching[1];
      const firstData = orientedPathAwayFromJunction(first, junctionId);
      const secondData = orientedPathAwayFromJunction(second, junctionId);
      if (!firstData || !secondData || S.sameRef(firstData.outerRef, secondData.outerRef)) {
        continue;
      }

      // Each path currently runs junction -> outer. Force both pieces to use
      // the exact junction coordinate from State before joining them. Using
      // their independently resolved endpoint coordinates here can preserve a
      // near-match as a tiny dogleg after the open-circle junction disappears.
      const junction = S.getJunction(junctionId);
      if (!junction) {
        continue;
      }
      const mergePoint = { x: junction.x, y: junction.y };
      const firstPath = firstData.path.map((point) => ({ x: point.x, y: point.y }));
      const secondPath = secondData.path.map((point) => ({ x: point.x, y: point.y }));
      firstPath[0] = { x: mergePoint.x, y: mergePoint.y };
      secondPath[0] = { x: mergePoint.x, y: mergePoint.y };

      const combinedPath = canonicalizeMergedPath(
        firstPath.slice().reverse().concat(secondPath.slice(1)),
        mergePoint
      );
      if (!combinedPath || combinedPath.length < 2) {
        continue;
      }

      const canvasId = first.canvasId || second.canvasId || null;
      const merged = S.createWire(firstData.outerRef, secondData.outerRef, canvasId, {
        fixedPath: combinedPath,
        meetingDirectionA: null,
        meetingDirectionB: null
      });

      S.removeWire(first.id);
      S.removeWire(second.id);
      S.removeJunction(junctionId);
      return merged;
    }

    return wire;
  }

  function onPointerUp(event) {
    if (isCheckMode()) {
      cancelWireInteraction();
      return;
    }

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
        const targetPath = snapHit.targetPath || getWirePath(targetWire);
        const split = splitRenderedPath(targetPath, snapHit.segmentIndex, snapHit.point);

        if (split) {
          const junction = S.createJunction(snapHit.point.x, snapHit.point.y, targetWire.canvasId);
          endRef = { kind: "junction", junctionId: junction.id };

          // Preserve the target wire exactly. Each replacement inherits one
          // side of its original rendered polyline, including every bend.
          // The new branch is created afterward, so it sees the inherited
          // segment at the junction and is forced to meet it perpendicular.
          S.createWire(targetWire.a, endRef, targetWire.canvasId, {
            fixedPath: split.left,
            meetingDirectionA: null,
            meetingDirectionB: null
          });
          S.createWire(endRef, targetWire.b, targetWire.canvasId, {
            fixedPath: split.right,
            meetingDirectionA: null,
            meetingDirectionB: null
          });
          S.removeWire(targetWire.id);
        }
      }
    } else if (snapHit) {
      endRef = snapHit.ref;

      // Matches the row-snap already applied when a wire *starts* on a
      // rail (see onPointerDownCapture) — without this, ending on a rail
      // landed at the raw, pixel-precise release point instead of one of
      // the fixed wire rows, which reads as "didn't snap to the grid" even
      // though every other rail connection (and every free end) does.
      if (endRef.kind === "rail") {
        const snappedY = window.ESB.Sections.getNearestRowY(endRef.y);
        endRef = { kind: "rail", railId: endRef.railId, y: snappedY };
      }
    } else if (point.x >= MIN_X) {
      // A free end may never reach past L1/R2's own X span — nothing out
      // there for a wire to meaningfully connect to. Y snaps to the
      // section's fixed row grid (Sections.getNearestRowY), not the finer
      // placement grid — a dedicated, predictable set of "wire rows"
      // rather than any arbitrary height.
      const freeEnd = {
        x: G.snapToGrid(clampToRailSpan(point.x), C.PLACEMENT_GRID),
        y: window.ESB.Sections.getNearestRowY(point.y)
      };

      // Nor may it land on top of an unrelated component's body — see
      // pointInsideAnyInstance. The gesture is simply dropped (no wire, no
      // junction) rather than snapping the point elsewhere, matching how a
      // release past L1/L2's span is handled just above.
      const startInstanceId = dragData.startRef.kind === "terminal" ? dragData.startRef.instanceId : null;
      if (!pointInsideAnyInstance(freeEnd, startInstanceId)) {
        const junction = S.createJunction(freeEnd.x, freeEnd.y, currentCanvasId());
        endRef = { kind: "junction", junctionId: junction.id };
      }
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
        if (!visibleInCurrentMode(candidate.canvasId)) {
          return false;
        }
        return (
          (S.sameRef(candidate.a, dragData.startRef) && S.sameRef(candidate.b, endRef)) ||
          (S.sameRef(candidate.a, endRef) && S.sameRef(candidate.b, dragData.startRef))
        );
      });

      if (duplicate) {
        S.removeWire(duplicate.id);
      } else {
        const endPoint = G.resolveRefPoint(endRef);
        if (endPoint) {
          removeSubsumedWires(dragData.startRef, dragData.startPoint, endPoint, endRef);
        }
        const wire = S.createWire(dragData.startRef, endRef, currentCanvasId());
        const normalizedWire = normalizeCommittedWire(wire);
        const finalWire = mergeExtendedOpenEndpoint(normalizedWire);
        if (finalWire) {
          S.selectWire(finalWire.id);
        }
      }
    }

    clearPreview();
    dragMode = null;
    dragData = null;
    document.body.classList.remove("esb-wire-dragging");
    document.documentElement.classList.remove("esb-wire-dragging");
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";

    renderWires();
    window.ESB.CanvasInteractions.renderSelection();
  }

  function onPointerDownSelect(event) {
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";
    if (mode === "check" || !wiringAllowedInMode(mode)) {
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

  window.ESB.WireTool = {
    init,
    renderWires,
    renderWiresForCanvas,
    renderWireToolbar,
    findConnectionPoint,
    getWirePath,
    // Exposed so state.js's createWire can capture a wire's meeting
    // direction(s) once, at creation time, and freeze them onto the wire —
    // see the comment on wirePath above for why that capture matters.
    requiredMeetingDirection,
    purgeProbeAttachedWires
  };
})();
