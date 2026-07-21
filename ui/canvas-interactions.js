// Version 0.2
//
// Placement/selection/move/delete interactions for instances on the
// canvas, plus palette-to-canvas drag-and-drop. Wire drawing (Phase 3)
// is a separate module layered on top of this one.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const C = window.ESB.Config;
  const D = window.ESB.Drawing;
  const G = window.ESB.Geometry;
  const Lib = window.ESB.SymbolLibrary;
  const S = window.ESB.State;

  const CANVAS_MARGIN = 20;
  const MIN_X = C.PALETTE_W + CANVAS_MARGIN;
  const RELAY_ROW_OFFSET = 140;

  // TSTAT Terminals bridging placement: how far below the low-voltage
  // section's top the R row lands (leaving room for the rail's leg above
  // it). No horizontal gap constant — the block's x is chosen so the R
  // row's left terminal sits at exactly the rail's x, reading as the rail
  // running straight into it rather than jogging over to reach it. Must be
  // a multiple of Config.PLACEMENT_GRID (20) — every row is ROW_H (60,
  // itself a 20-multiple) below the last, so once the R row lands exactly
  // on the grid, every other row does too, and any component the learner
  // drags toward one can snap to it exactly instead of landing 10 units
  // off (which is what 150 — not a multiple of 20 — used to cause).
  const TSTAT_R_OFFSET_Y = 160;

  // Terminal-to-terminal distance (world units) within which a dragged
  // component's terminal is considered to be "landed on" another
  // instance's terminal — see applyMove's touch-then-separate auto-wiring.
  const TERMINAL_TOUCH_RADIUS = 14;

  // Circuit Breaker's terminal-to-terminal span (see symbols-power.js) —
  // used to work out how much of L1/L2's top the two built-in breakers
  // occupy. A multiple of Config.PLACEMENT_GRID (20) so the rail's tap
  // point (main.topY + this) lands exactly on the grid.
  const BREAKER_SPAN = 60;

  // Shortest a wire is ever allowed to shrink to while dragging one of its
  // two connected components — stops the dragged terminal from crossing
  // over (and visually overlapping/inverting past) the point it's wired
  // to, leaving a short visible stub instead.
  const MIN_WIRE_LENGTH = 40;

  // How far down a pivotAtTip instance's own length (meter_lead_black/red
  // — see symbols-meter.js) counts as "grabbed near the tip" for move-vs-
  // rotate purposes. A plain radius around the tip point (matching a
  // normal terminal's hit circle) was far too small relative to how long
  // and thin the lead actually is — almost any real click landed just
  // outside it, rotating the lead when the user was trying to relocate it
  // entirely, which read as "it's stuck." This is checked along the
  // lead's own local length instead, so "anywhere in the first third,
  // roughly" reliably counts as move.
  const LEAD_MOVE_ZONE_LENGTH = 110;

  // Precise (non-90-degree-snapped) inverse rotation — G.rotatePoint
  // rounds cos/sin to the nearest -1/0/1, which is correct for every other
  // instance in this app (always at a 0/90/180/270 rotation) but wrong
  // here, since a meter lead's rotation is a free, continuous angle (see
  // applyRotateLead). Used only to work out where a click landed relative
  // to a lead's own tip-to-cable-end axis.
  function worldToLocal(worldPoint, instance) {
    const dx = worldPoint.x - instance.x;
    const dy = worldPoint.y - instance.y;
    const radians = (-instance.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  // Palette entries "SPST Relay"/"SPDT Relay" are placement *recipes*, not
  // real SymbolTypes: dropping one creates a coil plus its NO (and, for
  // SPDT, NC) contact together, sharing one auto-numbered "R" designator
  // as both their label and deviceGroup — a real SymbolType to preview
  // with in the palette/drag-ghost since neither has its own glyph.
  const RELAY_PRESETS = {
    relay_spst: { previewTypeId: "coil", contactTypeIds: ["contact_no"] },
    relay_spdt: { previewTypeId: "coil", contactTypeIds: ["contact_no", "contact_nc"] }
  };

  let dragMode = null; // null | "new-instance" | "move-instance"
  let dragData = null;

  function clampToCanvas(point) {
    // Sections.getTotalHeight() grows once a low-voltage section exists —
    // clamping to the fixed Config.VIEW_H would trap instances at the
    // original 1080 boundary even though the canvas is now taller.
    const totalHeight = window.ESB.Sections.getTotalHeight();

    return {
      x: Math.max(MIN_X, Math.min(C.VIEW_W - CANVAS_MARGIN, point.x)),
      y: Math.max(CANVAS_MARGIN, Math.min(totalHeight - CANVAS_MARGIN, point.y))
    };
  }

  function renderInstances() {
    const layer = document.getElementById("instancesLayer");
    D.clearGroup(layer);

    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";

    S.state.instances.forEach((instance) => {
      const type = Lib.getType(instance.typeId);

      // Meter leads only exist (visually and interactively) in Check
      // Circuit mode — they're created once and persist in state.instances
      // regardless of mode, just not rendered outside it.
      if (type.pivotAtTip && mode !== "check") {
        return;
      }

      const glyphGroup = D.group(
        {
          "data-instance-id": instance.id,
          transform: `translate(${instance.x},${instance.y}) rotate(${instance.rotation}) scale(${instance.mirrored ? -1 : 1},1)`,
          style: "cursor:grab;"
        },
        layer
      );

      // Invisible full-bounding-box hit target, so clicking/dragging in a
      // symbol's open gaps (e.g. between contact prongs) still hits it —
      // the visible strokes alone don't cover the whole footprint. A
      // pivotAtTip type's local origin is its tip (the top of the glyph),
      // not its center, so its box spans down from y=0 instead of being
      // centered on the origin like every other symbol's.
      if (type.pivotAtTip) {
        D.rect(-type.width / 2, 0, type.width, type.height, { fill: "transparent", stroke: "none" }, glyphGroup);
      } else {
        D.rect(
          -type.width / 2,
          -type.height / 2,
          type.width,
          type.height,
          { fill: "transparent", stroke: "none" },
          glyphGroup
        );
      }

      Lib.drawInstance(glyphGroup, type, instance);

      if (type.labelAnchor) {
        const labelWorld = G.localToWorld(type.labelAnchor, instance);
        // pointer-events:none so a label sitting over the glyph (e.g. a
        // coil's designation drawn at its center) never steals the click
        // that should hit the instance underneath.
        D.text(
          labelWorld.x,
          labelWorld.y,
          // instance.label is always set at creation time (empty string is
          // a deliberate choice for some types, e.g. capacitor) — no
          // `|| type.label` fallback, since "" is falsy but valid here.
          instance.label,
          15,
          700,
          "#1a2230",
          { "pointer-events": "none" },
          layer
        );
      }
    });
  }

  function renderSelection() {
    // Selecting/deselecting an instance also affects wire highlighting
    // (mutually exclusive with wire selection) and wires may have just
    // been invalidated by an instance delete — keep wireLayer in sync
    // wherever selection changes.
    if (window.ESB.WireTool) {
      window.ESB.WireTool.renderWires();
    }

    const layer = document.getElementById("selectionLayer");
    D.clearGroup(layer);

    const instance = S.getSelected();
    if (!instance) {
      const selectedWire = S.getSelectedWire();
      if (selectedWire && window.ESB.WireTool) {
        window.ESB.WireTool.renderWireToolbar(layer, selectedWire);
      }
      return;
    }

    const type = Lib.getType(instance.typeId);
    const radius = Math.max(type.width, type.height) / 2 + 14;

    D.circle(
      instance.x,
      instance.y,
      radius,
      {
        fill: "none",
        stroke: "#2377e8",
        "stroke-width": 3,
        "stroke-dasharray": "8 6"
      },
      layer
    );

    const toolbarY = instance.y - radius - 34;

    drawToolbarButton(layer, instance.x, toolbarY, "delete", (btn) => {
      D.line(-7, -7, 7, 7, { stroke: "#c0392b", width: 2.5 }, btn);
      D.line(-7, 7, 7, -7, { stroke: "#c0392b", width: 2.5 }, btn);
    });
  }

  function drawToolbarButton(layer, x, y, action, drawIcon) {
    const btn = D.group(
      { "data-toolbar-action": action, style: "cursor:pointer;" },
      layer
    );

    D.circle(0, 0, 22, { fill: "#ffffff", stroke: "#c7cfd9", "stroke-width": 2 }, btn);
    drawIcon(btn);

    btn.setAttribute("transform", `translate(${x},${y})`);
  }

  // Shared by the toolbar delete button and the Delete/Backspace key: if
  // the removed instance was bridging a section's rail (TSTAT Terminals),
  // that rail's leg extends back to its normal length, so the canvas needs
  // a relayout too — not just a re-render of instances/wires. Also
  // refreshes the palette, since deleting the one TSTAT Terminals block
  // un-greys its row again.
  function deleteInstance(id) {
    S.removeInstance(id);
    const railRestored = window.ESB.Sections.releaseTstat(id);

    renderInstances();
    renderSelection();
    window.ESB.Palette.render();

    if (railRestored) {
      window.ESB.relayout();
    }
  }

  // Brief, self-dismissing message near the top of the stage — used for
  // rejected placements (e.g. dropping TSTAT Terminals with no transformer
  // on the canvas yet), where there's no instance/selection to attach a
  // normal inline error to.
  function showToast(message) {
    const overlays = D.getElements().overlays;

    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText =
      "position:absolute;left:50%;top:6%;transform:translateX(-50%);" +
      "background:#2a3340;color:#ffffff;padding:12px 22px;border-radius:8px;" +
      "font:700 15px Arial, Helvetica, sans-serif;box-shadow:0 8px 20px rgba(0,0,0,0.25);" +
      "pointer-events:none;z-index:30;transition:opacity 0.3s ease;opacity:1;white-space:nowrap;";

    overlays.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  function renderDragGhost(point, typeId) {
    const layer = document.getElementById("dragPreviewLayer");
    D.clearGroup(layer);

    const preset = RELAY_PRESETS[typeId];
    const type = Lib.getType(preset ? preset.previewTypeId : typeId);
    const isValid = point.x >= MIN_X;

    const ghost = D.group(
      {
        transform: `translate(${point.x},${point.y})`,
        opacity: isValid ? "0.85" : "0.35",
        style: "pointer-events:none;"
      },
      layer
    );

    Lib.drawInstance(ghost, type, { variant: type.defaultVariant, rotation: 0 });
  }

  function clearDragGhost() {
    D.clearGroup(document.getElementById("dragPreviewLayer"));
  }

  function onPointerDown(event) {
    const svg = D.getElements().svg;
    const target = event.target;
    const mode = window.ESB.Mode ? window.ESB.Mode.getMode() : "build";

    const toolbarEl = target.closest("[data-toolbar-action]");
    if (toolbarEl) {
      const selected = S.getSelected();
      if (selected && toolbarEl.dataset.toolbarAction === "delete") {
        deleteInstance(selected.id);
      }
      event.preventDefault();
      return;
    }

    // Available in both modes — flipping the breaker to see its effect is
    // exactly what Check Circuit is for, and there's no reason to block it
    // while still building either.
    const breakerToggleEl = target.closest("[data-breaker-toggle]");
    if (breakerToggleEl) {
      if (window.ESB.BreakerControl) {
        window.ESB.BreakerControl.toggle();
      }
      event.preventDefault();
      return;
    }

    if (mode === "build") {
      const paletteEl = target.closest("[data-palette-type]");
      if (paletteEl) {
        dragMode = "new-instance";
        dragData = { typeId: paletteEl.dataset.paletteType };
        const point = G.clientToStage(svg, event.clientX, event.clientY);
        renderDragGhost(point, dragData.typeId);
        event.preventDefault();
        return;
      }
    }

    const instanceEl = target.closest("[data-instance-id]");
    if (instanceEl) {
      const instance = S.getInstance(instanceEl.dataset.instanceId);

      if (instance) {
        const type = Lib.getType(instance.typeId);
        const point = G.clientToStage(svg, event.clientX, event.clientY);

        if (type.pivotAtTip) {
          // Check Circuit only (see renderInstances — leads aren't even
          // rendered, hence not clickable, in build mode). Clicking within
          // the first LEAD_MOVE_ZONE_LENGTH of the lead's own length
          // (from the tip down) moves the tip; grabbing further down —
          // deeper into the cable — rotates it around the (fixed) tip
          // instead.
          const local = worldToLocal(point, instance);

          dragMode = local.y <= LEAD_MOVE_ZONE_LENGTH ? "move-tip" : "rotate-lead";
          dragData = { instanceId: instance.id };
          event.preventDefault();
          return;
        }

        if (mode === "build") {
          S.select(instance.id);
          renderSelection();

          dragMode = "move-instance";
          dragData = {
            instanceId: instance.id,
            pointerStartX: point.x,
            pointerStartY: point.y,
            instanceStartX: instance.x,
            instanceStartY: instance.y,
            touchState: {},
            // Fixed once, at drag start — which side of each wired
            // connection this instance's terminal starts on, and along
            // which axis. Locking this in up front (rather than re-deriving
            // it live from the current tentative position every frame) is
            // what actually stops a fast/large drag from popping straight
            // through to the far side: every frame clamps back toward the
            // SAME original side, however far past the pointer has gone.
            wireConstraints: buildWireConstraints(instance)
          };
        }
        // mode === "check" and not pivotAtTip: the built circuit is
        // read-only here — no selection, no drag.
      }

      event.preventDefault();
      return;
    }

    if (mode === "build") {
      S.select(null);
      renderSelection();
    }
  }

  function terminalHasWire(instanceId, terminalId) {
    return S.state.wires.some((wire) => {
      return (
        (wire.a.kind === "terminal" && wire.a.instanceId === instanceId && wire.a.terminalId === terminalId) ||
        (wire.b.kind === "terminal" && wire.b.instanceId === instanceId && wire.b.terminalId === terminalId)
      );
    });
  }

  // Nearest OTHER instance's terminal to worldPoint, within touch range —
  // used by applyMove to detect "this terminal is currently landed on
  // that one," regardless of whether either terminal already has a wire
  // (the caller filters that).
  function findTouchingTerminal(worldPoint, excludeInstanceId) {
    let best = null;
    let bestDist = TERMINAL_TOUCH_RADIUS;

    S.state.instances.forEach((other) => {
      if (other.id === excludeInstanceId) {
        return;
      }

      const type = Lib.getType(other.typeId);
      type.terminals.forEach((terminal) => {
        const worldTerminal = G.localToWorld({ x: terminal.x, y: terminal.y }, other);
        const d = G.distance(worldPoint, worldTerminal);

        if (d <= bestDist) {
          bestDist = d;
          best = { kind: "terminal", instanceId: other.id, terminalId: terminal.id };
        }
      });
    });

    return best;
  }

  // Live, per-drag "touch" tracking: while dragging, if one of the moved
  // instance's (still-unwired) terminals currently coincides with another
  // instance's terminal, remember it — then the moment it's no longer
  // touching (dragged away), wire the two together. Only fires for a
  // terminal that had no wire at all, per the user's spec, and only once
  // per touch episode (dragData.touchState is cleared right after).
  function checkTouchAndAutoWire(instance) {
    const type = Lib.getType(instance.typeId);

    type.terminals.forEach((terminal) => {
      if (terminalHasWire(instance.id, terminal.id)) {
        return;
      }

      const worldPoint = G.localToWorld({ x: terminal.x, y: terminal.y }, instance);
      const touching = findTouchingTerminal(worldPoint, instance.id);
      const previouslyTouching = dragData.touchState[terminal.id] || null;

      if (touching) {
        dragData.touchState[terminal.id] = touching;
      } else if (previouslyTouching) {
        S.createWire(
          { kind: "terminal", instanceId: instance.id, terminalId: terminal.id },
          previouslyTouching
        );
        dragData.touchState[terminal.id] = null;
      }
    });
  }

  // Every wire touching one of this instance's terminals, paired with
  // which terminal it's on — used at drag start to fix which side of each
  // connection the terminal begins on.
  function wiredTerminalsFor(instanceId) {
    const results = [];

    S.state.wires.forEach((wire) => {
      if (wire.a.kind === "terminal" && wire.a.instanceId === instanceId) {
        results.push({ terminalId: wire.a.terminalId, otherRef: wire.b });
      } else if (wire.b.kind === "terminal" && wire.b.instanceId === instanceId) {
        results.push({ terminalId: wire.b.terminalId, otherRef: wire.a });
      }
    });

    return results;
  }

  // Called once, at the start of a move-instance drag: for each wired
  // terminal, records which axis the connection runs along and which side
  // of the other point the terminal starts on. A *distance*-only check
  // (just "clamp if closer than 40") isn't enough — a terminal can cross
  // all the way to the far side and then simply be more than 40 units away
  // again, popping straight through. Fixing the side up front means every
  // later frame clamps back toward that same original side no matter how
  // far past it the raw drag has gone.
  function buildWireConstraints(instance) {
    const type = Lib.getType(instance.typeId);

    return wiredTerminalsFor(instance.id)
      .map((connection) => {
        const terminal = type.terminals.find((candidate) => candidate.id === connection.terminalId);
        const otherPoint = terminal && G.resolveRefPoint(connection.otherRef);

        if (!terminal || !otherPoint) {
          return null;
        }

        const originalWorld = G.localToWorld(terminal, instance);
        const dx = originalWorld.x - otherPoint.x;
        const dy = originalWorld.y - otherPoint.y;
        const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        const sign = (axis === "x" ? dx : dy) < 0 ? -1 : 1;

        return { terminal, otherRef: connection.otherRef, axis, sign };
      })
      .filter(Boolean);
  }

  // Keeps a dragged instance's wired terminals from crossing over the
  // point each is wired to — instead of overlapping/inverting past it,
  // the drag stops MIN_WIRE_LENGTH short, leaving a short visible stub.
  // Assumes rotation 0 / not mirrored, true for every instance type that's
  // actually user-draggable today (the built-in breakers and TSTAT
  // Terminals, which do use rotation/aren't draggable at all, never reach
  // this — see the fixedPosition/locked guards in applyMove).
  function constrainAgainstConnectedWires(constraints, x, y) {
    let resultX = x;
    let resultY = y;

    constraints.forEach((constraint) => {
      const otherPoint = G.resolveRefPoint(constraint.otherRef);
      if (!otherPoint) {
        return;
      }

      const terminal = constraint.terminal;

      if (constraint.axis === "x") {
        const tentativeX = resultX + terminal.x;
        const signed = constraint.sign * (tentativeX - otherPoint.x);
        if (signed < MIN_WIRE_LENGTH) {
          resultX = otherPoint.x + constraint.sign * MIN_WIRE_LENGTH - terminal.x;
        }
      } else {
        const tentativeY = resultY + terminal.y;
        const signed = constraint.sign * (tentativeY - otherPoint.y);
        if (signed < MIN_WIRE_LENGTH) {
          resultY = otherPoint.y + constraint.sign * MIN_WIRE_LENGTH - terminal.y;
        }
      }
    });

    return { x: resultX, y: resultY };
  }

  function applyMove(point) {
    const instance = S.getInstance(dragData.instanceId);

    // fixedPosition (e.g. TSTAT Terminals, auto-bridged to the 24V rail):
    // selectable and deletable like any instance, but never repositioned.
    if (instance && instance.fixedPosition) {
      renderInstances();
      renderSelection();
      return;
    }

    const dx = point.x - dragData.pointerStartX;
    const dy = point.y - dragData.pointerStartY;

    const raw = {
      x: dragData.instanceStartX + dx,
      y: dragData.instanceStartY + dy
    };

    const clamped = clampToCanvas(raw);
    const snapped = {
      x: G.snapToGrid(clamped.x, C.PLACEMENT_GRID),
      y: G.snapToGrid(clamped.y, C.PLACEMENT_GRID)
    };

    const type = instance && Lib.getType(instance.typeId);

    // lockVertical (e.g. the transformer, which must stay bridging its two
    // rails): horizontal drag only, Y stays exactly where it started.
    const finalY = type && type.lockVertical ? dragData.instanceStartY : snapped.y;

    const constrained = dragData.wireConstraints && dragData.wireConstraints.length
      ? constrainAgainstConnectedWires(dragData.wireConstraints, snapped.x, finalY)
      : { x: snapped.x, y: finalY };

    S.moveInstance(dragData.instanceId, constrained.x, constrained.y);

    if (instance) {
      checkTouchAndAutoWire(instance);
    }

    renderInstances();
    renderSelection();
  }

  // Moves a meter lead's tip directly to the cursor, snapping onto any
  // nearby terminal/junction/rail exactly like drawing a wire would (reuses
  // wire-tool's own snap search) — touching the tip to a point is meant to
  // read as "the probe is on this exact node." instance.probeRef records
  // what it's currently touching (or null) for a future reading feature;
  // nothing acts on it yet.
  function applyMoveTip(point) {
    const instance = S.getInstance(dragData.instanceId);
    if (!instance) {
      return;
    }

    // Exclude the lead's own instance — otherwise its tip (still sitting
    // at last frame's position) is almost always the closest candidate on
    // every subsequent frame, and it never actually escapes to snap onto
    // anything else.
    const snap = window.ESB.WireTool && window.ESB.WireTool.findConnectionPoint
      ? window.ESB.WireTool.findConnectionPoint(point, C.TERMINAL_SNAP_RADIUS, instance.id)
      : null;

    const target = snap ? snap.point : point;

    instance.x = target.x;
    instance.y = target.y;
    instance.probeRef = snap ? snap.ref : null;

    renderInstances();
    renderSelection();
  }

  // Rotates a meter lead around its tip (the instance's own x/y, which
  // never moves during this drag) so its body swings to point at the
  // cursor. -90 so that "cursor straight below the tip" — the artwork's
  // own natural, unrotated orientation — maps to rotation 0.
  function applyRotateLead(point) {
    const instance = S.getInstance(dragData.instanceId);
    if (!instance) {
      return;
    }

    const dx = point.x - instance.x;
    const dy = point.y - instance.y;

    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      instance.rotation = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    }

    renderInstances();
    renderSelection();
  }

  function onPointerMove(event) {
    if (!dragMode) {
      return;
    }

    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);

    if (dragMode === "new-instance") {
      renderDragGhost(point, dragData.typeId);
      return;
    }

    if (dragMode === "move-instance") {
      applyMove(point);
      return;
    }

    if (dragMode === "move-tip") {
      applyMoveTip(point);
      return;
    }

    if (dragMode === "rotate-lead") {
      applyRotateLead(point);
    }
  }

  function onPointerUp(event) {
    const svg = D.getElements().svg;
    const point = G.clientToStage(svg, event.clientX, event.clientY);

    if (dragMode === "move-tip") {
      applyMoveTip(point);
    }

    if (dragMode === "rotate-lead") {
      applyRotateLead(point);
    }

    if (dragMode === "new-instance") {
      if (point.x >= MIN_X) {
        const snapped = {
          x: G.snapToGrid(point.x, C.PLACEMENT_GRID),
          y: G.snapToGrid(point.y, C.PLACEMENT_GRID)
        };

        const preset = RELAY_PRESETS[dragData.typeId];

        if (preset) {
          const designator = S.nextDesignator("R");
          const coil = S.createInstance(preset.previewTypeId, snapped.x, snapped.y, {
            label: designator,
            deviceGroup: designator
          });

          preset.contactTypeIds.forEach((contactTypeId, index) => {
            const contactPoint = clampToCanvas({
              x: snapped.x,
              y: snapped.y + RELAY_ROW_OFFSET * (index + 1)
            });

            S.createInstance(contactTypeId, contactPoint.x, contactPoint.y, {
              label: designator,
              deviceGroup: designator
            });
          });

          S.select(coil.id);
        } else if (dragData.typeId === "transformer" && !window.ESB.Sections.hasLowVoltageSection()) {
          // First transformer placed: snap it to bridge the main ladder's
          // bottom rail and a newly-created low-voltage section's top
          // rail (H1/H2 and X1/X2 are exactly Config.SECTION_GAP/2 apart
          // from the instance's own origin). Only the initial placement
          // is special-cased — once a low-voltage section exists, later
          // transformers (and this one, afterward) behave like any other
          // freely-draggable instance.
          const main = window.ESB.Sections.getById("main");
          window.ESB.Sections.addLowVoltageSection();
          window.ESB.relayout();

          const bridgeX = G.snapToGrid((main.leftX + main.rightX) / 2, C.PLACEMENT_GRID);
          const bridgeY = main.bottomY + C.SECTION_GAP / 2;

          const instance = S.createInstance("transformer", bridgeX, bridgeY);
          S.select(instance.id);
        } else if (dragData.typeId === "thermostat_block") {
          // TSTAT Terminals requires 24VAC to exist at all — without a
          // transformer there's no low-voltage section/rail for it to
          // bridge to, so the drop is rejected outright rather than
          // placing a disconnected block.
          if (!window.ESB.Sections.hasLowVoltageSection()) {
            showToast("A transformer is required to add this component.");
          } else if (!window.ESB.Sections.getById("lowVoltage").tstatInstanceId) {
            // Fixed position bridging the low-voltage section's 24V rail
            // directly to the R row, same "auto-bridge on first placement"
            // idea as the transformer. Only one TSTAT Terminals block is
            // ever allowed (see ui/palette.js, which greys the row out
            // once one exists), so this branch's guard should always hold
            // whenever the palette let the drag start in the first place.
            const lowSection = window.ESB.Sections.getById("lowVoltage");
            const rTerminalY = lowSection.topY + TSTAT_R_OFFSET_Y;
            // R row's left terminal (local x -95) lands exactly on the
            // rail's own x — the rail reads as running straight into it,
            // not jogging sideways to reach it.
            const instanceX = lowSection.leftX + 95;
            const instanceY = rTerminalY + 150; // -BLOCK_TOP for the 6-row block, matching symbols-hvac-inputs.js

            const instance = S.createInstance("thermostat_block", instanceX, instanceY, {
              fixedPosition: true
            });

            S.createWire(
              { kind: "rail", railId: lowSection.leftRailId, y: rTerminalY },
              { kind: "terminal", instanceId: instance.id, terminalId: "r_l" }
            );

            window.ESB.Sections.attachTstat("lowVoltage", instance.id, rTerminalY);
            window.ESB.relayout();
            window.ESB.Palette.render();

            S.select(instance.id);
          }
        } else {
          const instance = S.createInstance(dragData.typeId, snapped.x, snapped.y);
          S.select(instance.id);
        }

        renderInstances();
        renderSelection();
      }

      clearDragGhost();
    }

    if (dragMode === "move-instance") {
      // Applied again here (not just on pointermove) so a move still
      // completes correctly even if no intermediate move events fired
      // between pointerdown and pointerup.
      applyMove(point);
    }

    dragMode = null;
    dragData = null;
  }

  function onKeyDown(event) {
    if (event.key === "Delete" || event.key === "Backspace") {
      const selectedWire = S.getSelectedWire();
      if (selectedWire) {
        S.removeWire(selectedWire.id);
        renderSelection();
        event.preventDefault();
        return;
      }
    }

    const selected = S.getSelected();
    if (!selected) {
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      deleteInstance(selected.id);
      event.preventDefault();
    }
  }

  // Two Circuit Breakers, permanently in series at the top of L1 and L2 —
  // no longer a palette item (see symbols-power.js), created once here
  // instead. Rotated so each one's terminal pair runs vertically: the
  // "outer" terminal (away from the rail) sits at the section's original
  // topY, the "inner" one (toward the rail) BREAKER_SPAN below that, and
  // the rail's own visible/wireable length is shortened to start there
  // (Sections.setRailTopOverride) so it reads as running straight out of
  // the breaker rather than through it.
  function createBuiltInBreakers() {
    const main = window.ESB.Sections.getById("main");
    const outerY = main.topY;
    const innerY = outerY + BREAKER_SPAN;
    const centerY = (outerY + innerY) / 2;

    // Rotated so the arcs curve toward each other (in toward the space
    // between L1 and L2) rather than away — the opposite sign from what
    // "-90 for L1 / +90 for L2" would suggest at face value, since the
    // breaker's arc bulges in the direction that sign convention sends
    // outward, not inward.
    const l1 = S.createInstance("breaker", main.leftX, centerY, { label: "CB", locked: true });
    l1.rotation = 90;

    const l2 = S.createInstance("breaker", main.rightX, centerY, { label: "CB", locked: true });
    l2.rotation = -90;

    S.createWire(
      { kind: "terminal", instanceId: l1.id, terminalId: "t2" },
      { kind: "rail", railId: main.leftRailId, y: innerY }
    );
    S.createWire(
      { kind: "terminal", instanceId: l2.id, terminalId: "t1" },
      { kind: "rail", railId: main.rightRailId, y: innerY }
    );

    window.ESB.Sections.setRailTopOverride("main", innerY, innerY);
    window.ESB.relayout();
  }

  function init() {
    // Listens on #stage, not circuitSvg — the palette lives in its own
    // separate paletteSvg sibling (see styles.css), so a listener on
    // circuitSvg alone would never see palette clicks/drags.
    const stage = D.getElements().stage;

    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    if (!S.state.instances.some((instance) => instance.typeId === "breaker")) {
      createBuiltInBreakers();
    }

    renderInstances();
    renderSelection();
  }

  window.ESB.CanvasInteractions = {
    init,
    renderInstances,
    renderSelection
  };
})();
