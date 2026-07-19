// Version 0.1

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config || {};
  const SVG_NS = C.SVG_NS || "http://www.w3.org/2000/svg";

  function getStage() {
    return document.getElementById("stage");
  }

  function getSvg() {
    return document.getElementById("circuitSvg");
  }

  function getOverlays() {
    return document.getElementById("overlays");
  }

  function getElements() {
    return {
      stage: getStage(),
      svg: getSvg(),
      overlays: getOverlays()
    };
  }

  function clearGroup(group) {
    while (group.firstChild) {
      group.removeChild(group.firstChild);
    }
  }

  function setAttrs(el, attrs) {
    if (!attrs) {
      return el;
    }

    Object.keys(attrs).forEach((key) => {
      const value = attrs[key];

      if (value === undefined || value === null) {
        return;
      }

      if (key === "className") {
        el.setAttribute("class", value);
        return;
      }

      el.setAttribute(key, value);
    });

    return el;
  }

  function add(name, attrs, parent) {
    const el = document.createElementNS(SVG_NS, name);
    setAttrs(el, attrs);

    const target = parent && typeof parent.appendChild === "function" ? parent : getSvg();
    target.appendChild(el);

    return el;
  }

  function group(attrs, parent) {
    return add("g", attrs, parent);
  }

  function drawDefs() {
    const svg = getSvg();
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.id = "svgDefs";

    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = `
      .current-flow {
        animation: esb-current-flow 0.65s linear infinite;
      }

      @keyframes esb-current-flow {
        from { stroke-dashoffset: 0; }
        to { stroke-dashoffset: -38; }
      }
    `;

    const gridSize = C.GRID_SIZE || 40;
    const majorSize = C.GRID_MAJOR_SIZE || 160;

    const smallPattern = document.createElementNS(SVG_NS, "pattern");
    smallPattern.setAttribute("id", "smallGrid");
    smallPattern.setAttribute("width", String(gridSize));
    smallPattern.setAttribute("height", String(gridSize));
    smallPattern.setAttribute("patternUnits", "userSpaceOnUse");

    const smallPath = document.createElementNS(SVG_NS, "path");
    smallPath.setAttribute("d", `M ${gridSize} 0 L 0 0 0 ${gridSize}`);
    smallPath.setAttribute("fill", "none");
    smallPath.setAttribute("stroke", "#eef2f6");
    smallPath.setAttribute("stroke-width", "1");
    smallPattern.appendChild(smallPath);

    const gridPattern = document.createElementNS(SVG_NS, "pattern");
    gridPattern.setAttribute("id", "grid");
    gridPattern.setAttribute("width", String(majorSize));
    gridPattern.setAttribute("height", String(majorSize));
    gridPattern.setAttribute("patternUnits", "userSpaceOnUse");

    const gridRect = document.createElementNS(SVG_NS, "rect");
    gridRect.setAttribute("width", String(majorSize));
    gridRect.setAttribute("height", String(majorSize));
    gridRect.setAttribute("fill", "url(#smallGrid)");

    const gridPath = document.createElementNS(SVG_NS, "path");
    gridPath.setAttribute("d", `M ${majorSize} 0 L 0 0 0 ${majorSize}`);
    gridPath.setAttribute("fill", "none");
    gridPath.setAttribute("stroke", "#dde5ee");
    gridPath.setAttribute("stroke-width", "1.6");

    gridPattern.appendChild(gridRect);
    gridPattern.appendChild(gridPath);

    defs.appendChild(style);
    defs.appendChild(smallPattern);
    defs.appendChild(gridPattern);

    svg.appendChild(defs);
  }

  function drawBackground() {
    rect(0, 0, C.VIEW_W || 1920, C.VIEW_H || 1080, {
      fill: "#ffffff",
      stroke: "none"
    });

    rect(0, 0, C.VIEW_W || 1920, C.VIEW_H || 1080, {
      fill: "url(#grid)",
      stroke: "none"
    });
  }

  function line(x1, y1, x2, y2, options, parent) {
    const opts = Object.assign(
      {
        x1,
        y1,
        x2,
        y2,
        stroke: "#111111",
        "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        fill: "none"
      },
      options || {}
    );

    if (options && options.width !== undefined) {
      opts["stroke-width"] = options.width;
      delete opts.width;
    }

    return add("line", opts, parent);
  }

  function polyline(points, options, parent) {
    const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(" ");

    const opts = Object.assign(
      {
        points: pointsAttr,
        stroke: "#111111",
        "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        fill: "none"
      },
      options || {}
    );

    if (options && options.width !== undefined) {
      opts["stroke-width"] = options.width;
      delete opts.width;
    }

    return add("polyline", opts, parent);
  }

  function wire(points, energized, parent) {
    const wireEl = polyline(points, { stroke: "#111111", width: 4 }, parent);

    if (energized) {
      currentOverlay(points, parent);
    }

    return wireEl;
  }

  function currentOverlay(points, parent) {
    return polyline(
      points,
      {
        class: "current-flow",
        stroke: "#2377e8",
        width: 9,
        "stroke-dasharray": "20 18",
        "stroke-dashoffset": "0",
        "pointer-events": "none",
        opacity: "1"
      },
      parent
    );
  }

  function rect(x, y, rectWidth, rectHeight, options, parent) {
    const opts = {
      x,
      y,
      width: rectWidth,
      height: rectHeight,
      fill: "none",
      stroke: "#111111",
      "stroke-width": 2
    };

    if (options) {
      Object.keys(options).forEach((key) => {
        const value = options[key];

        if (value === undefined || value === null) {
          return;
        }

        if (key === "width") {
          opts["stroke-width"] = value;
          return;
        }

        if (key === "className") {
          opts.class = value;
          return;
        }

        opts[key] = value;
      });
    }

    opts.width = rectWidth;
    opts.height = rectHeight;

    return add("rect", opts, parent);
  }

  function circle(cx, cy, r, options, parent) {
    const opts = {
      cx,
      cy,
      r,
      fill: "#ffffff",
      stroke: "#111111",
      "stroke-width": 4
    };

    if (options) {
      Object.keys(options).forEach((key) => {
        const value = options[key];

        if (value === undefined || value === null) {
          return;
        }

        if (key === "width") {
          opts["stroke-width"] = value;
          return;
        }

        if (key === "className") {
          opts.class = value;
          return;
        }

        opts[key] = value;
      });
    }

    return add("circle", opts, parent);
  }

  function path(d, options, parent) {
    const opts = Object.assign(
      {
        d,
        fill: "none",
        stroke: "#111111",
        "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      },
      options || {}
    );

    if (options && options.width !== undefined) {
      opts["stroke-width"] = options.width;
      delete opts.width;
    }

    return add("path", opts, parent);
  }

  function text(x, y, content, size, weight, color, options, parent) {
    const opts = Object.assign(
      {
        x,
        y,
        fill: color || "#111111",
        "font-size": size || 18,
        "font-weight": weight || 700,
        "font-family": "Arial, Helvetica, sans-serif",
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      },
      options || {}
    );

    const el = add("text", opts, parent);
    el.textContent = content || "";
    return el;
  }

  function drawRails() {
    const leftRail = C.LEFT_RAIL || 160;
    const rightRail = C.RIGHT_RAIL || 1760;
    const topRailY = C.TOP_RAIL_Y || 140;
    const bottomRailY = C.BOTTOM_RAIL_Y || 1000;

    line(leftRail, topRailY, leftRail, bottomRailY, { stroke: "#111111", width: 6 });
    line(rightRail, topRailY, rightRail, bottomRailY, { stroke: "#111111", width: 6 });

    text(leftRail, topRailY - 30, "L1", 26, 900, "#111111");
    text(rightRail, topRailY - 30, "L2", 26, 900, "#111111");
  }

  function drawVersion() {
    text(
      (C.VIEW_W || 1920) - 90,
      (C.VIEW_H || 1080) - 30,
      `v${C.VERSION || ""}`,
      16,
      900,
      "#9aa4b2"
    );
  }

  window.ESB.Drawing = {
    getElements,
    clearGroup,
    setAttrs,
    add,
    group,
    drawDefs,
    drawBackground,
    drawRails,
    line,
    polyline,
    wire,
    currentOverlay,
    rect,
    circle,
    path,
    text,
    drawVersion
  };
})();
