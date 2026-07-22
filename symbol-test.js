// Dev-only visual harness for Phase 1 — not part of the shipped app.
// Lays out every registered SymbolType at 0/90/180/270 degree rotations,
// with a red dot on every terminal's computed world position, so terminal
// placement can be verified visually before the wire tool depends on it.

(function () {
  "use strict";

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;
  const G = window.ESB.Geometry;

  const CELL_W = 260;
  const CELL_H = 260;
  const ROTATIONS = [0, 90, 180, 270];

  function buildSvg(rows) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "circuitSvg";
    svg.setAttribute("width", CELL_W * ROTATIONS.length);
    svg.setAttribute("height", CELL_H * rows);
    svg.setAttribute(
      "viewBox",
      `0 0 ${CELL_W * ROTATIONS.length} ${CELL_H * rows}`
    );
    document.getElementById("wrap").appendChild(svg);
    return svg;
  }

  function run() {
    const types = Lib.getAllTypes();
    buildSvg(types.length);

    types.forEach((type, row) => {
      ROTATIONS.forEach((rotation, col) => {
        const cx = col * CELL_W + CELL_W / 2;
        const cy = row * CELL_H + CELL_H / 2;

        D.rect(col * CELL_W, row * CELL_H, CELL_W, CELL_H, {
          fill: "none",
          stroke: "#e2e6ec",
          "stroke-width": 1
        });

        const instance = {
          x: cx,
          y: cy,
          rotation,
          mirrored: false,
          variant: type.defaultVariant
        };

        const cellGroup = D.group({
          transform: `translate(${cx},${cy}) rotate(${rotation})`
        });

        Lib.drawInstance(cellGroup, type, instance);

        type.terminals.forEach((terminal) => {
          const world = G.localToWorld({ x: terminal.x, y: terminal.y }, instance);
          D.circle(world.x, world.y, 2.5, { fill: "#e8452c", stroke: "none" });
        });

        D.text(
          cx,
          row * CELL_H + CELL_H - 14,
          `${type.id}  (${rotation}°)`,
          13,
          700,
          "#556",
          {}
        );
      });
    });
  }

  window.addEventListener("DOMContentLoaded", run);
})();
