// Version 0.2
//
// Multimeter probe leads — Check Circuit mode only (see ui/mode.js). These
// aren't schematic symbols traced into path data like the rest of the
// library; they're photographic reference art (SVG/Black_lead.png,
// SVG/Red_Lead.png) referenced by relative URL and embedded via <image>,
// since the source files are tens of KB each — far too large to usefully
// inline as path data or base64.
//
// Both pivot at the metal tip, not their own center: each type's only
// terminal ("tip") sits at local (0,0), with the probe body/cable drawn
// hanging down from there (matching the source art's natural orientation).
// Because the pivot point IS the terminal, rotating the instance (any
// angle — see ui/canvas-interactions.js's pivotAtTip handling) swings the
// body around the tip without moving the tip itself, and dragging the tip
// itself just moves instance.x/y directly, with the fixed terminal always
// resolving to the exact same point regardless of rotation.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const Lib = window.ESB.SymbolLibrary;
  const D = window.ESB.Drawing;
  const C = window.ESB.Config;

  // Requested size: the height of two main (major) grid squares.
  const LEAD_HEIGHT = (C.GRID_MAJOR_SIZE || 160) * 2;

  // Must match ui/canvas-interactions.js's LEAD_MOVE_ZONE_LENGTH — that's
  // the actual move-vs-rotate decision boundary; this is just the visible
  // cursor cue matching it, so hovering accurately previews what a click
  // will do instead of only showing crosshair over a much smaller area
  // than what's actually draggable-to-move.
  const MOVE_ZONE_LENGTH = 110;

  // Both leads render at the black lead's own native aspect ratio, scaled
  // to LEAD_HEIGHT — the red source PNG has a different native ratio, so
  // giving it its own computed width (as before) made it visibly narrower
  // than black at the same height. Using one shared box for both instead
  // (image drawn with preserveAspectRatio:"none", so it stretches to fit)
  // is a barely-perceptible stretch on red given how thin/elongated these
  // probe shapes already are, and makes the two leads read as the same size.
  const BLACK_NATIVE_W = 71;
  const BLACK_NATIVE_H = 982;
  const width = LEAD_HEIGHT * (BLACK_NATIVE_W / BLACK_NATIVE_H);

  function registerLead(id, label, href) {
    Lib.register({
      id,
      category: "meter",
      label,
      hiddenFromPalette: true,
      pivotAtTip: true,
      width,
      height: LEAD_HEIGHT,
      terminals: [{ id: "tip", x: 0, y: 0 }],
      draw(parent) {
        D.image(href, -width / 2, 0, width, LEAD_HEIGHT, { preserveAspectRatio: "none" }, parent);

        // hideTerminalDots (below) skips symbol-library.js's generic
        // terminal-dot rendering — the photographic metal tip already
        // reads as a point, a drawn ring on top of it would look wrong.
        // This invisible hit/cursor zone replaces it — drawn last (on top
        // of the image) so it wins the cursor for the whole "grab here to
        // move" region, not just a small circle right at the tip.
        D.rect(
          -width / 2,
          0,
          width,
          MOVE_ZONE_LENGTH,
          { fill: "transparent", stroke: "none", style: "cursor:crosshair;" },
          parent
        );
      },
      hideTerminalDots: true
    });
  }

  registerLead("meter_lead_black", "Black Meter Lead", "SVG/Black_lead.png");
  registerLead("meter_lead_red", "Red Meter Lead", "SVG/Red_Lead.png");
})();
