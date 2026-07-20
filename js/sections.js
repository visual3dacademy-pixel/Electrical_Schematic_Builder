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

  function renderAll(parent) {
    const D = window.ESB.Drawing;

    sections.forEach((section) => {
      const leftBottom = section.leftRailBottomY || section.bottomY;

      D.line(section.leftX, section.topY, section.leftX, leftBottom, { stroke: "#111111", width: 6 }, parent);
      D.line(section.rightX, section.topY, section.rightX, section.bottomY, { stroke: "#111111", width: 6 }, parent);

      D.text(section.leftX, section.topY - 30, section.leftLabel, 26, 900, "#111111", {}, parent);
      D.text(section.rightX, section.topY - 30, section.rightLabel, 26, 900, "#111111", {}, parent);
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
    getTotalHeight,
    renderAll
  };
})();
