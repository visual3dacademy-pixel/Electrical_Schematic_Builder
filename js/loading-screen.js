// Version 1
//
// Self-contained opening screen: shows the V3D Academy title card
// (SVG/V3D academy_home_screen.svg) full-screen for a fixed 5 seconds,
// then fades it out to reveal the app underneath. Ported from
// ph-chart-storyline-main's js/loading-screen.js — same timing/fade
// mechanism, adapted to this project's single full-bleed title image
// instead of a small logo with a separate spinner overlay. Touches
// nothing else: no circuit-builder state, no other module's init order.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const MIN_VISIBLE_MS = 5000;

  function hideLoadingScreen() {
    const screen = document.getElementById("loading-screen");

    if (!screen) {
      return;
    }

    screen.classList.add("hidden");
  }

  function startTimer() {
    window.setTimeout(hideLoadingScreen, MIN_VISIBLE_MS);
  }

  window.ESB.LoadingScreen = { hide: hideLoadingScreen };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startTimer, { once: true });
  } else {
    startTimer();
  }
})();
