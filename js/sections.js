// Version 0.1
//
// Registry of ladder "sections" — each a pair of vertical power rails
// spanning a topY..bottomY range. Rails are the only part of the circuit
// that behave as buses: any wire endpoint attached anywhere along a rail's
// length is on the same electrical net (see engine/netlist.js's "rail"
// NodeRef kind). Starts with just the main high-voltage section; a
// low-voltage section is appended once, the first time a transformer is
// placed (ui/canvas-interactions.js).

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;

  const sections = [
    {
      id: "main",
      leftRailId: "main_hot",
      rightRailId: "main_common",
      leftLabel: "L1",
      rightLabel: "L2",
      leftX: C.LEFT_RAIL,
      rightX: C.RIGHT_RAIL,
      topY: C.TOP_RAIL_Y,
      bottomY: C.BOTTOM_RAIL_Y
    }
  ];

  function getAll() {
    return sections;
  }

  function getById(id) {
    return sections.find((section) => section.id === id) || null;
  }

  function findRailSection(railId) {
    return (
      sections.find(
        (section) => section.leftRailId === railId || section.rightRailId === railId
      ) || null
    );
  }

  function getRailX(railId) {
    const section = findRailSection(railId);
    if (!section) {
      return null;
    }
    return railId === section.leftRailId ? section.leftX : section.rightX;
  }

  function hasLowVoltageSection() {
    return sections.some((section) => section.id === "lowVoltage");
  }

  // TSTAT Terminals bridges the low-voltage section's left ("24V") rail
  // directly to its R row, so that rail's vertical leg only needs to run
  // as far as the block — not all the way to the section's normal bottom.
  // leftRailBottomY overrides just the left rail's rendered/hit-tested
  // length; the section's own bottomY (which also drives total canvas
  // height) is untouched.
  function attachTstat(sectionId, instanceId, bottomY) {
    const section = getById(sectionId);
    if (!section) {
      return;
    }

    section.tstatInstanceId = instanceId;
    section.leftRailBottomY = bottomY;
  }

  // Called whenever any instance is deleted — if it was the one bridging a
  // section's left rail, that rail's leg extends back down to the
  // section's normal bottom. Returns true if a section was actually
  // affected, so the caller knows to redraw the rails.
  function releaseTstat(instanceId) {
    const section = sections.find((candidate) => candidate.tstatInstanceId === instanceId);
    if (!section) {
      return false;
    }

    section.tstatInstanceId = null;
    section.leftRailBottomY = null;
    return true;
  }

  function addLowVoltageSection() {
    const existing = getById("lowVoltage");
    if (existing) {
      return existing;
    }

    const previous = sections[sections.length - 1];
    const topY = previous.bottomY + C.SECTION_GAP;

    // Same rail length as the section above it (the line-voltage run),
    // not a fixed constant.
    const railLength = previous.bottomY - previous.topY;

    const section = {
      id: "lowVoltage",
      leftRailId: "lv_hot",
      rightRailId: "lv_common",
      leftLabel: "24V",
      rightLabel: "C",
      leftX: previous.leftX,
      rightX: previous.rightX,
      topY,
      bottomY: topY + railLength
    };

    sections.push(section);
    return section;
  }

  // Undoes addLowVoltageSection — called when the transformer bridging it
  // to the main ladder is deleted (see canvas-interactions.js's
  // deleteInstance), since nothing can legitimately be wired to a 24V/C
  // rail that no longer bridges to any real transformer. The canvas
  // shrinks back down (getTotalHeight) the moment this runs.
  function removeLowVoltageSection() {
    const index = sections.findIndex((section) => section.id === "lowVoltage");
    if (index !== -1) {
      sections.splice(index, 1);
    }
  }

  function getTotalHeight() {
    const last = sections[sections.length - 1];
    return Math.max(C.VIEW_H, last.bottomY + 80);
  }

  // Fixed number of evenly-spaced horizontal "wire rows" available in each
  // section's own vertical span — a dedicated snap grid for wires and
  // component placement, coarser than Config.PLACEMENT_GRID, so a run of
  // wires/components down the ladder lines up onto a small, predictable
  // set of rows instead of landing at any arbitrary Y. For "main", the
  // span starts below the built-in circuit breakers (getRailBounds
  // already accounts for their carve-out), not at the section's own
  // topY — there's nothing to wire above the breakers anyway. Every other
  // section (lowVoltage) has no such carve-out, so its full topY..bottomY
  // span is used directly.
  const ROW_COUNT = 30;

  function getSnapRows(section) {
    const startY = getRailBounds(section, "left").topY;
    const endY = section.bottomY;
    const spacing = (endY - startY) / ROW_COUNT;

    const rows = [];
    for (let i = 1; i <= ROW_COUNT; i += 1) {
      rows.push(startY + spacing * i);
    }
    return rows;
  }

  // The low-voltage section always mirrors the main section's own raw
  // topY..bottomY span (see addLowVoltageSection — its rail length copies
  // "previous.bottomY - previous.topY" exactly), and has no breaker-style
  // carve-out at its top the way main does. Its row spacing is therefore
  // fully determined by Config alone — computable even before the section
  // itself exists, which is what lets the TSTAT Terminals symbol (built
  // and registered at page load, long before any transformer creates a
  // low-voltage section) size its own six rows to land exactly on this
  // same grid.
  function getLowVoltageRowSpacing() {
    return (C.BOTTOM_RAIL_Y - C.TOP_RAIL_Y) / ROW_COUNT;
  }

  // Nearest snap row across every section — sections never overlap in Y
  // (each new one starts Config.SECTION_GAP below the last), so a plain
  // global nearest-of-all-rows search is equivalent to picking the right
  // section first and is simpler than routing by Y range.
  function getNearestRowY(y) {
    let best = y;
    let bestDist = Infinity;

    sections.forEach((section) => {
      getSnapRows(section).forEach((rowY) => {
        const dist = Math.abs(rowY - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = rowY;
        }
      });
    });

    return best;
  }

  // Effective rendered/hit-tested span of one rail — defaults to the
  // section's own topY/bottomY, but either end can be overridden per-side
  // (e.g. the built-in circuit breakers cut into the top of L1/L2, so
  // those rails only need to start below them; TSTAT Terminals similarly
  // shortens the low-voltage section's left rail from the bottom).
  function getRailBounds(section, side) {
    const topKey = side === "left" ? "leftRailTopY" : "rightRailTopY";
    const bottomKey = side === "left" ? "leftRailBottomY" : "rightRailBottomY";

    return {
      topY: section[topKey] || section.topY,
      bottomY: section[bottomKey] || section.bottomY
    };
  }

  // Used once at startup by the built-in circuit breakers: both L1 and L2
  // visually/electrically start below the breakers rather than at the
  // section's normal topY. The "L1"/"L2" labels stay put (labelY keeps
  // its original position) since the breakers sit between the label and
  // the now-shorter rail.
  function setRailTopOverride(sectionId, leftTopY, rightTopY) {
    const section = getById(sectionId);
    if (!section) {
      return;
    }

    if (section.labelY === undefined) {
      section.labelY = section.topY - 30;
    }

    section.leftRailTopY = leftTopY;
    section.rightRailTopY = rightTopY;
  }

  function renderAll(parent) {
    const D = window.ESB.Drawing;

    sections.forEach((section) => {
      const left = getRailBounds(section, "left");
      const right = getRailBounds(section, "right");
      const labelY = section.labelY !== undefined ? section.labelY : section.topY - 30;

      D.line(section.leftX, left.topY, section.leftX, left.bottomY, { stroke: "#111111", width: 6 }, parent);
      D.line(section.rightX, right.topY, section.rightX, right.bottomY, { stroke: "#111111", width: 6 }, parent);

      // Invisible, generously wide hit-zone along each rail so hovering
      // anywhere on L1/L2/24V/C shows the crosshair cursor — signaling
      // "wire mode" here — rather than only right on the thin 6px line.
      // Drawn into the same (bottom) static layer, so any wire or
      // instance drawn later still takes hover priority over it.
      D.line(
        section.leftX, left.topY, section.leftX, left.bottomY,
        { stroke: "transparent", width: 30, style: "cursor:crosshair;" },
        parent
      );
      D.line(
        section.rightX, right.topY, section.rightX, right.bottomY,
        { stroke: "transparent", width: 30, style: "cursor:crosshair;" },
        parent
      );

      D.text(section.leftX, labelY, section.leftLabel, 26, 900, "#111111", {}, parent);
      D.text(section.rightX, labelY, section.rightLabel, 26, 900, "#111111", {}, parent);

      // Faint full-width guide line at every snap row, so where a wire or
      // component will land is visible before it's dropped, not just felt
      // as an invisible snap. Drawn last (within this section's own
      // pass) so it sits under nothing wire/instance-related that's
      // rendered into later layers, but still reads clearly against the
      // grid background.
      getSnapRows(section).forEach((rowY) => {
        D.line(
          section.leftX, rowY, section.rightX, rowY,
          { stroke: "#d3dae3", width: 1, "stroke-dasharray": "4 4" },
          parent
        );
      });
    });
  }

  window.ESB.Sections = {
    getAll,
    getById,
    getRailX,
    hasLowVoltageSection,
    addLowVoltageSection,
    removeLowVoltageSection,
    attachTstat,
    releaseTstat,
    getRailBounds,
    setRailTopOverride,
    getTotalHeight,
    getSnapRows,
    getNearestRowY,
    getLowVoltageRowSpacing,
    renderAll
  };
})();
