// Version 0.6
// Transformer and fuse redrawn from the user's latest 2 mm-grid SVGs.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  // Transformer — traced from Assets/SVG/Transformer.svg (viewBox 112.06x76.39).
  // Source terminal centers: H1(5.67,5.67), H2(106.40,5.67),
  // X1(5.67,70.73), X2(106.40,70.73). Uniform scale 2.45927
  // maps the vertical terminal span to exactly 160 pixels and the
  // horizontal terminal span to approximately 248 pixels, matching the
  // existing bridge recipe without distorting the authored symbol.
  Lib.register({
    id: "transformer",
    category: "power",
    label: "Transformer",
    designatorPrefix: "T",
    lockVertical: true,
    width: 280,
    height: 220,
    terminals: [
      { id: "h1", x: -124, y: -80 },
      { id: "h2", x: 124, y: -80 },
      { id: "x1", x: -124, y: 80 },
      { id: "x2", x: 124, y: 80 }
    ],
    labelAnchor: { x: 0, y: -106 },
    draw(parent) {
      const g = D.group({ transform: "translate(-137.94,-93.94) scale(2.45927)" }, parent);
      const sw = { width: 0.71 };
      D.line(76.77, 70.73, 106.4, 70.73, sw, g);
      D.path("M35.29,5.67c-.75,3.75-1.97,6.79-3.49,8.64-3.82,4.69-8.45.82-10.34-8.64", sw, g);
      D.path("M49.12,5.67c-.75,3.75-1.97,6.79-3.49,8.64-3.82,4.69-8.45.82-10.34-8.64", sw, g);
      D.path("M62.94,5.67c-.75,3.75-1.97,6.79-3.49,8.64-3.82,4.69-8.45.82-10.34-8.64", sw, g);
      D.path("M76.77,5.67c-.75,3.75-1.97,6.79-3.49,8.64-3.82,4.69-8.45.82-10.34-8.64", sw, g);
      D.path("M90.59,5.67c-.75,3.75-1.97,6.79-3.49,8.64-3.82,4.69-8.45.82-10.34-8.64", sw, g);
      D.line(21.47, 5.67, 5.67, 5.67, sw, g);
      D.path("M49.12,70.73c-1.89-9.46-6.52-13.33-10.34-8.64-1.51,1.86-2.74,4.89-3.49,8.64", sw, g);
      D.path("M62.94,70.73c-1.89-9.46-6.52-13.33-10.34-8.64-1.51,1.86-2.74,4.89-3.49,8.64", sw, g);
      D.path("M76.77,70.73c-1.89-9.46-6.52-13.33-10.34-8.64-1.51,1.86-2.74,4.89-3.49,8.64", sw, g);
      D.line(35.29, 70.73, 5.67, 70.73, sw, g);
      D.line(21.47, 27.35, 90.59, 27.35, sw, g);
      D.line(21.47, 49.04, 90.59, 49.04, sw, g);
      D.line(90.59, 5.67, 106.4, 5.67, sw, g);
      D.text(0, 0, "24 VAC", 15, 700, "#1a2230", {}, parent);
    }
  });

  // Fuse — traced from Fuse(1).svg (viewBox 76.39x20.50).
  // Source terminal centers (5.67,10.25) and (70.73,10.25) are mapped
  // to -80/+80, providing an exact 160-pixel grid-aligned span.
  Lib.register({
    id: "fuse",
    category: "protective",
    label: "Fuse",
    designatorPrefix: "FU",
    width: 180,
    height: 70,
    canFault: true,
    terminals: [
      { id: "t1", x: -80, y: 0 },
      { id: "t2", x: 80, y: 0 }
    ],
    labelAnchor: { x: 0, y: -42 },
    draw(parent) {
      const g = D.group({ transform: "translate(-93.944,-25.207) scale(2.45927)" }, parent);
      const sw = { width: 0.71 };
      D.path("M70.73,10.25h-12.74c0,5.47-4.43,9.9-9.9,9.9-5.47,0-9.9-4.43-9.9-9.9S33.77.35,28.3.35s-9.9,4.43-9.9,9.9H5.67", sw, g);
    }
  });

  // Circuit Breaker — Assets/SVG/Circuit Breaker.svg (updated viewBox
  // 76.44x29.01). Terminal centers (8.23,20.36) and (68.20,20.78). Scaled
  // down further (terminal span 60, half of the previous 120) so the two
  // terminal circles sit closer together and the arc reads smaller — same
  // shape, same trace, just a smaller overall footprint. 60 stays a
  // multiple of Config.PLACEMENT_GRID (20), so the rail tap point built
  // from this span (see canvas-interactions.js's createBuiltInBreakers)
  // still lands exactly on the grid. No longer a palette entry: two are
  // created automatically at startup, in series at the top of L1 and L2,
  // each rotated so their arcs face each other.
  //
  // The arc + its two stubs are wrapped in their own sub-group
  // (data-breaker-arc, matching the instance id) with a CSS-transitioned
  // style transform, not a plain SVG transform attribute — that's what
  // lets ui/breaker-control.js animate it smoothly on open/close by
  // updating that one element's style directly, instead of forcing a full
  // re-render (which would just snap to the new position with no
  // transition, since the element would be brand new each time).
  Lib.register({
    id: "breaker",
    category: "protective",
    label: "Circuit Breaker",
    designatorPrefix: "CB",
    hiddenFromPalette: true,
    width: 60,
    height: 45,
    canFault: true,
    defaultParams: { open: false },
    terminals: [
      { id: "t1", x: -30, y: 0 },
      { id: "t2", x: 30, y: 0 }
    ],
    labelAnchor: { x: 0, y: -28 },
    draw(parent, instance) {
      const g = D.group({ transform: "translate(-38.23,-20.58) scale(1.0005)" }, parent);
      const sw = { width: 0.48 };

      const isOpen = !!(instance && instance.params && instance.params.open);
      const arcGroup = D.group(
        {
          "data-breaker-arc": instance && instance.id ? instance.id : "",
          style: `transform:translate(0px,${isOpen ? "-10px" : "0px"});transition:transform 0.3s ease;`
        },
        g
      );

      D.path("M67.5,12.91C59.71,4.96,49.08.45,37.96.36c-11.13-.09-21.83,4.27-29.73,12.1", sw, arcGroup);

      // Short stubs closing the gap between the arc's own endpoints
      // (67.5,12.91) and (8.23,12.46) and the terminal centers
      // (68.20,20.78) and (8.23,20.36) — added rather than editing the
      // curve itself, so the bezier shape stays untouched.
      D.line(67.5, 12.91, 68.2, 20.78, sw, arcGroup);
      D.line(8.23, 12.46, 8.23, 20.36, sw, arcGroup);
    }
  });
})();
