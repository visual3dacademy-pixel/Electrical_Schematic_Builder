// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  // Converts a browser pointer position to stage (design-space) coordinates.
  // Uses the SVG's *live* viewBox dimensions, not the fixed Config.VIEW_W/H —
  // once a low-voltage section is added, circuitSvg's viewBox grows taller
  // than 1080 (see script.js's relayout()), so its on-screen rendered height
  // no longer matches Config.VIEW_H. Dividing by the hardcoded constant
  // instead of the real current height mapped every click in the lower
  // portion of a tall canvas to a much smaller y — reading as "the wire/
  // component landed way above where I clicked."
  function clientToStage(svgEl, clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    const viewBox = svgEl.viewBox.baseVal;

    return {
      x: ((clientX - rect.left) / rect.width) * viewBox.width,
      y: ((clientY - rect.top) / rect.height) * viewBox.height
    };
  }

  // Rotation is always in 90-degree steps (0, 90, 180, 270), matching
  // ladder-diagram symbols which are never drawn at arbitrary angles.
  function rotatePoint(point, degrees) {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.round(Math.cos(radians));
    const sin = Math.round(Math.sin(radians));

    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos
    };
  }

  // Transforms a symbol-local point (from its SymbolType terminal/geometry
  // definitions) into world/stage coordinates, given a placed Instance.
  // Mirrors then rotates then translates, matching the SVG transform order
  // used to render instances: `translate(...) rotate(...) scale(mirror,1)`
  // (SVG composes right-to-left, so scale applies first).
  function localToWorld(localPoint, instance) {
    const mirroredPoint = instance.mirrored
      ? { x: -localPoint.x, y: localPoint.y }
      : localPoint;
    const rotated = rotatePoint(mirroredPoint, instance.rotation || 0);

    return {
      x: instance.x + rotated.x,
      y: instance.y + rotated.y
    };
  }

  function terminalWorldPoint(instance, terminalId) {
    const symbolType = window.ESB.SymbolLibrary.getType(instance.typeId);
    const terminal = symbolType.terminals.find((candidate) => candidate.id === terminalId);

    if (!terminal) {
      return null;
    }

    return localToWorld({ x: terminal.x, y: terminal.y }, instance);
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
  }

  // Resolves a wire endpoint (NodeRef, either a terminal or a junction) to
  // its current world position. Never cached — always reflects the live
  // position of whatever the ref points at, so a wire automatically
  // re-routes when the instance or junction it's attached to moves.
  function resolveRefPoint(ref) {
    if (!ref) {
      return null;
    }

    if (ref.kind === "terminal") {
      const instance = window.ESB.State.getInstance(ref.instanceId);
      return instance ? terminalWorldPoint(instance, ref.terminalId) : null;
    }

    if (ref.kind === "junction") {
      const junction = window.ESB.State.getJunction(ref.junctionId);
      return junction ? { x: junction.x, y: junction.y } : null;
    }

    if (ref.kind === "rail") {
      const railX = window.ESB.Sections.getRailX(ref.railId);
      return railX === null ? null : { x: railX, y: ref.y };
    }

    return null;
  }

  // Nearest point on segment a-b to `point`, and the distance to it. Used
  // to hit-test wire endpoints against a rail's full length, not just a
  // single fixed point.
  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    let t = lengthSquared === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const closest = { x: a.x + t * dx, y: a.y + t * dy };

    return { distance: distance(point, closest), point: closest };
  }

  // Two-segment orthogonal (Manhattan) routing between two points, the
  // ladder-diagram convention: horizontal run first, then vertical — or a
  // single straight segment if the points already line up on one axis.
  function orthogonalPath(a, b) {
    if (a.x === b.x || a.y === b.y) {
      return [a, b];
    }

    // Vertical-first (bend at a.x/b.y), not horizontal-first: dragging
    // from a component down to a rail or another component below it is
    // the most common case, and this way the wire's path tracks the
    // cursor's vertical movement immediately instead of leaving a
    // horizontal segment sitting at the start's height for the whole
    // drag (which reads as "disconnected from the cursor").
    return [a, { x: a.x, y: b.y }, b];
  }

  window.ESB.Geometry = {
    clientToStage,
    rotatePoint,
    localToWorld,
    terminalWorldPoint,
    distance,
    snapToGrid,
    resolveRefPoint,
    orthogonalPath,
    distanceToSegment
  };
})();
