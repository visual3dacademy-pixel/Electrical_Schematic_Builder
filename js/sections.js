// Version 0.4
// Canvas-scoped ladder sections. IDU and ODU each own an independent
// main section and optional low-voltage section.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const CANVASES = ["idu", "odu"];
  const ROW_COUNT = 30;

  function createMainSection(canvasId) {
    return {
      id: "main",
      leftRailId: `main_hot_${canvasId}`,
      rightRailId: `main_common_${canvasId}`,
      leftLabel: "L1",
      rightLabel: "L2",
      leftX: C.LEFT_RAIL,
      rightX: C.RIGHT_RAIL,
      topY: C.TOP_RAIL_Y,
      bottomY: C.BOTTOM_RAIL_Y
    };
  }

  const sectionsByCanvas = {
    idu: [createMainSection("idu")],
    odu: [createMainSection("odu")]
  };

  function normalizeCanvasId(canvasId) {
    if (CANVASES.includes(canvasId)) return canvasId;
    if (window.ESB.Mode) {
      const mode = window.ESB.Mode.getMode();
      if (CANVASES.includes(mode)) return mode;
      const active = window.ESB.Mode.getActiveCanvasMode();
      if (CANVASES.includes(active)) return active;
    }
    return "idu";
  }

  function list(canvasId) {
    return sectionsByCanvas[normalizeCanvasId(canvasId)];
  }

  function getAll(canvasId) {
    return list(canvasId);
  }

  function getById(id, canvasId) {
    return list(canvasId).find((section) => section.id === id) || null;
  }

  function findRailSection(railId, canvasId) {
    return list(canvasId).find(
      (section) => section.leftRailId === railId || section.rightRailId === railId
    ) || null;
  }

  function getRailX(railId, canvasId) {
    const section = findRailSection(railId, canvasId);
    if (!section) return null;
    return railId === section.leftRailId ? section.leftX : section.rightX;
  }

  function hasLowVoltageSection(canvasId) {
    return !!getById("lowVoltage", canvasId);
  }

  function attachTstat(sectionId, instanceId, bottomY, canvasId) {
    const section = getById(sectionId, canvasId);
    if (!section) return;
    section.tstatInstanceId = instanceId;
    section.leftRailBottomY = bottomY;
  }

  function releaseTstat(instanceId, canvasId) {
    const canvases = canvasId ? [normalizeCanvasId(canvasId)] : CANVASES;
    for (const id of canvases) {
      const section = list(id).find((candidate) => candidate.tstatInstanceId === instanceId);
      if (section) {
        section.tstatInstanceId = null;
        section.leftRailBottomY = null;
        return true;
      }
    }
    return false;
  }

  function addLowVoltageSection(canvasId) {
    const id = normalizeCanvasId(canvasId);
    const sections = list(id);
    const existing = getById("lowVoltage", id);
    if (existing) return existing;

    const previous = sections[sections.length - 1];
    const topY = previous.bottomY + C.SECTION_GAP;
    const railLength = previous.bottomY - previous.topY;
    const section = {
      id: "lowVoltage",
      leftRailId: `lv_hot_${id}`,
      rightRailId: `lv_common_${id}`,
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

  function removeLowVoltageSection(canvasId) {
    const sections = list(canvasId);
    const index = sections.findIndex((section) => section.id === "lowVoltage");
    if (index !== -1) sections.splice(index, 1);
  }

  function getTotalHeight(canvasId) {
    const sections = list(canvasId);
    const last = sections[sections.length - 1];
    return Math.max(C.VIEW_H, last.bottomY + 80);
  }

  function getRailBounds(section, side) {
    const topKey = side === "left" ? "leftRailTopY" : "rightRailTopY";
    const bottomKey = side === "left" ? "leftRailBottomY" : "rightRailBottomY";
    return {
      topY: section[topKey] || section.topY,
      bottomY: section[bottomKey] || section.bottomY
    };
  }

  function getSnapRows(section) {
    const startY = getRailBounds(section, "left").topY;
    const endY = section.bottomY;
    const spacing = (endY - startY) / ROW_COUNT;
    const rows = [];
    for (let i = 1; i <= ROW_COUNT; i += 1) rows.push(startY + spacing * i);
    return rows;
  }

  function getLowVoltageRowSpacing() {
    return (C.BOTTOM_RAIL_Y - C.TOP_RAIL_Y) / ROW_COUNT;
  }

  function getNearestRowY(y, canvasId) {
    let best = y;
    let bestDist = Infinity;
    list(canvasId).forEach((section) => {
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

  function setRailTopOverride(sectionId, leftTopY, rightTopY, canvasId) {
    const section = getById(sectionId, canvasId);
    if (!section) return;
    if (section.labelY === undefined) section.labelY = section.topY - 30;
    section.leftRailTopY = leftTopY;
    section.rightRailTopY = rightTopY;
  }

  function renderAll(parent, canvasId) {
    const D = window.ESB.Drawing;
    list(canvasId).forEach((section) => {
      const left = getRailBounds(section, "left");
      const right = getRailBounds(section, "right");
      const labelY = section.labelY !== undefined ? section.labelY : section.topY - 30;

      D.line(section.leftX, left.topY, section.leftX, left.bottomY, { stroke: "#111111", width: 6 }, parent);
      D.line(section.rightX, right.topY, section.rightX, right.bottomY, { stroke: "#111111", width: 6 }, parent);
      D.line(section.leftX, left.topY, section.leftX, left.bottomY, { stroke: "transparent", width: 30, style: "cursor:crosshair;" }, parent);
      D.line(section.rightX, right.topY, section.rightX, right.bottomY, { stroke: "transparent", width: 30, style: "cursor:crosshair;" }, parent);
      D.text(section.leftX, labelY, section.leftLabel, 26, 900, "#111111", {}, parent);
      D.text(section.rightX, labelY, section.rightLabel, 26, 900, "#111111", {}, parent);
      getSnapRows(section).forEach((rowY) => {
        D.line(section.leftX, rowY, section.rightX, rowY, { stroke: "#d3dae3", width: 1, "stroke-dasharray": "4 4" }, parent);
      });
    });
  }


  function exportCanvas(canvasId) {
    return JSON.parse(JSON.stringify(list(canvasId)));
  }

  function importCanvas(canvasId, snapshot) {
    const id = normalizeCanvasId(canvasId);
    sectionsByCanvas[id] = JSON.parse(JSON.stringify(snapshot && snapshot.length ? snapshot : [createMainSection()]));
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
    renderAll,
    normalizeCanvasId,
    exportCanvas,
    importCanvas
  };
})();
