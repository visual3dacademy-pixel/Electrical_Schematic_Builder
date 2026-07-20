// Version 0.5
//
// Transformer, Fuse, and Circuit Breaker geometry is traced from the
// user's reference SVGs (Assets/SVG/*.svg — industry-standard symbols),
// not hand-approximated. Each draw() wraps the *exact*, unmodified source
// path/line coordinates in a translate+scale group — that keeps every
// curve numerically identical to the reference art while normalizing
// each symbol's terminal-to-terminal span to match the rest of the
// library. Only the terminal positions and the transform's two numbers
// are computed by hand; every other coordinate is a verbatim copy.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;

  // Transformer — Assets/SVG/Transfomrer.svg (viewBox 158.28x107.82).
  // Terminal circle centers there: H1(7.88,7.87) H2(150.41,7.87)
  // X1(7.88,99.94) X2(150.41,99.94). scale=1.7378 is chosen so the
  // vertical H-to-X span becomes exactly 160 (Config.SECTION_GAP) —
  // required so the transformer still bridges the main ladder's bottom
  // rail and the low-voltage section's top rail exactly (see
  // Sections.addLowVoltageSection and the placement special case in
  // ui/canvas-interactions.js). Fixed vertical orientation only, since
  // rotation doesn't exist as a feature.
  Lib.register({
    id: "transformer",
    category: "power",
    label: "Transformer",
    designatorPrefix: "T",
    // Its Y is fixed at placement time (bridging the main ladder's bottom
    // rail and the low-voltage section's top rail) — a learner can still
    // slide it left/right, but not off of that bridging height.
    lockVertical: true,
    width: 280,
    height: 220,
    terminals: [
      { id: "h1", x: -124, y: -80 },
      { id: "h2", x: 124, y: -80 },
      { id: "x1", x: -124, y: 80 },
      { id: "x2", x: 124, y: 80 }
    ],
    labelAnchor: { x: 0, y: -100 },
    draw(parent) {
      const g = D.group({ transform: "translate(-137.53,-93.68) scale(1.7378)" }, parent);
      const sw = { width: 1.73 };

      D.line(108.45, 99.96, 150.41, 99.94, sw, g);
      D.path("M30.23,7.88c1.84,9.21,5.63,15.04,9.77,15.04s7.93-5.83,9.77-15.04", sw, g);
      D.path("M49.79,7.88c1.84,9.21,5.63,15.04,9.77,15.04s7.93-5.83,9.77-15.04", sw, g);
      D.path("M69.35,7.88c1.84,9.21,5.63,15.04,9.77,15.04s7.93-5.83,9.77-15.04", sw, g);
      D.path("M88.91,7.88c1.84,9.21,5.63,15.04,9.77,15.04s7.93-5.83,9.77-15.04", sw, g);
      D.path("M108.5,7.88c1.84,9.21,5.63,15.04,9.77,15.04s7.93-5.83,9.77-15.04", sw, g);
      // Four leads below are extended to the exact terminal centers
      // (7.88,7.87) (150.41,7.87) (7.88,99.94) (150.41,99.94) — the source
      // art's lines stop at the terminal circle's edge, leaving a
      // radius-sized gap to the auto-rendered terminal dot.
      D.line(30.21, 7.89, 7.88, 7.87, sw, g);
      D.path("M69.34,99.97c-1.84-9.21-5.63-15.04-9.77-15.04s-7.93,5.83-9.77,15.04", sw, g);
      D.path("M88.9,99.97c-1.84-9.21-5.63-15.04-9.77-15.04s-7.93,5.83-9.77,15.04", sw, g);
      D.path("M108.46,99.97c-1.84-9.21-5.63-15.04-9.77-15.04s-7.93,5.83-9.77,15.04", sw, g);
      D.line(49.77, 99.96, 7.88, 99.94, sw, g);
      D.line(30.21, 37.05, 128.04, 37.05, sw, g);
      D.line(30.21, 70.8, 128.04, 70.8, sw, g);
      D.line(128.04, 7.89, 150.41, 7.87, sw, g);

      D.text(0, 0, "24 VAC", 15, 700, "#1a2230", {}, parent);
    }
  });

  // Fuse — Assets/SVG/Fuse.svg (updated viewBox 120.78x32.91). Terminal
  // centers (8.23,16.46) and (112.54,16.46); scale=150/104.31=1.438
  // normalizes the span to 150, matching every other 2-terminal
  // horizontal symbol.
  Lib.register({
    id: "fuse",
    category: "protective",
    label: "Fuse",
    designatorPrefix: "FU",
    width: 150,
    height: 90,
    canFault: true,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -46 },
    draw(parent) {
      const g = D.group({ transform: "translate(-86.83,-23.67) scale(1.438)" }, parent);
      const sw = { width: 2.09 };

      // Leads extended to the exact terminal centers (8.23,16.46) and
      // (112.54,16.46) — see the transformer comment above for why.
      D.line(112.54, 16.46, 92.58, 16.47, sw, g);
      D.path("M60.39,16.46c0,8.89,7.21,16.1,16.1,16.1s16.1-7.21,16.1-16.1", sw, g);
      D.path("M60.39,16.46c0,-8.89,-7.21,-16.1,-16.1,-16.1s-16.1,7.21,-16.1,16.1", sw, g);
      D.line(28.2, 16.47, 8.23, 16.46, sw, g);
    }
  });

  // Circuit Breaker — Assets/SVG/Circuit Breaker.svg (updated viewBox
  // 76.44x29.01). Terminal centers (8.23,20.36) and (68.20,20.78);
  // scale=150/59.97=2.5013.
  Lib.register({
    id: "breaker",
    category: "protective",
    label: "Circuit Breaker",
    designatorPrefix: "CB",
    width: 150,
    height: 110,
    canFault: true,
    terminals: [
      { id: "t1", x: -75, y: 0 },
      { id: "t2", x: 75, y: 0 }
    ],
    labelAnchor: { x: 0, y: -70 },
    draw(parent) {
      const g = D.group({ transform: "translate(-95.58,-51.45) scale(2.5013)" }, parent);
      const sw = { width: 1.2 };

      D.path("M67.5,12.91C59.71,4.96,49.08.45,37.96.36c-11.13-.09-21.83,4.27-29.73,12.1", sw, g);

      // Short stubs closing the gap between the arc's own endpoints
      // (67.5,12.91) and (8.23,12.46) and the terminal centers
      // (68.20,20.78) and (8.23,20.36) — added rather than editing the
      // curve itself, so the bezier shape stays untouched.
      D.line(67.5, 12.91, 68.2, 20.78, sw, g);
      D.line(8.23, 12.46, 8.23, 20.36, sw, g);
    }
  });
})();
