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

  function getTotalHeight() {
    const last = sections[sections.length - 1];
    return Math.max(C.VIEW_H, last.bottomY + 80);
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
    });
  }

  window.ESB.Sections = {
    getAll,
    getById,
    getRailX,
    hasLowVoltageSection,
    addLowVoltageSection,
    attachTstat,
    releaseTstat,
    getRailBounds,
    setRailTopOverride,
    getTotalHeight,
    renderAll
  };
})();
