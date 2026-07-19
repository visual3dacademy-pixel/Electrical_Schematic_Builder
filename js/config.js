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

    // Snap radius, in design-space pixels, for wire endpoints/terminals.
    TERMINAL_SNAP_RADIUS: 22,
    TERMINAL_HIT_RADIUS: 16,

    // Placement grid snap for dragged/moved instances.
    PLACEMENT_GRID: 20
  };
})();
