// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function clientToStage(svgEl, clientX, clientY) {
    const C = window.ESB.Config;
    const rect = svgEl.getBoundingClientRect();

    return {
      x: ((clientX - rect.left) / rect.width) * C.VIEW_W,
      y: ((clientY - rect.top) / rect.height) * C.VIEW_H
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

    return null;
  }

  // Two-segment orthogonal (Manhattan) routing between two points, the
  // ladder-diagram convention: horizontal run first, then vertical — or a
  // single straight segment if the points already line up on one axis.
  function orthogonalPath(a, b) {
    if (a.x === b.x || a.y === b.y) {
      return [a, b];
    }

    return [a, { x: b.x, y: a.y }, b];
  }

  window.ESB.Geometry = {
    clientToStage,
    rotatePoint,
    localToWorld,
    terminalWorldPoint,
    distance,
    snapToGrid,
    resolveRefPoint,
    orthogonalPath
  };
})();
