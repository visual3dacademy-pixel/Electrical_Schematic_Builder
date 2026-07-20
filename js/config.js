// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  window.ESB.Config = {
    VERSION: "0.1",
    SVG_NS: "http://www.w3.org/2000/svg",

    VIEW_W: 1920,
    VIEW_H: 1080,

    // Palette panel (left) and canvas working area. The canvas occupies
    // everything to the right of the palette.
    PALETTE_W: 260,

    // Power rails (ladder-diagram convention: hot rail left, common/neutral rail right).
    // Positioned within the canvas area, i.e. to the right of the palette.
    LEFT_RAIL: 360,
    RIGHT_RAIL: 1860,
    TOP_RAIL_Y: 140,
    BOTTOM_RAIL_Y: 1000,

    GRID_SIZE: 40,
    GRID_MAJOR_SIZE: 160,

    // Snap/hit radius, in design-space pixels, for wire endpoints/terminals.
    // The visible terminal dot itself is much smaller (r=5.5) — these are
    // deliberately generous so starting/ending a wire doesn't require
    // pixel-perfect precision once the 1920-wide stage is rendered small
    // (e.g. inside an actual Storyline course window).
    TERMINAL_SNAP_RADIUS: 34,
    TERMINAL_HIT_RADIUS: 28,

    // Placement grid snap for dragged/moved instances.
    PLACEMENT_GRID: 20,

    // Gap between the bottom of one section and the top of the next.
    // Matches the transformer's H/X terminal spacing (160) exactly, so its
    // primary pair lands on the section above and its secondary pair lands
    // on the section below with no extra offset. The low-voltage section's
    // rail length itself matches whatever section precedes it (see
    // Sections.addLowVoltageSection), not a fixed constant.
    SECTION_GAP: 160
  };
})();
