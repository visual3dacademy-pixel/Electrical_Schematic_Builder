// Version 1
//
// "Under development" notice, shown behind the opening title card (see
// js/loading-screen.js) — same full-bleed z-index-layering trick that card
// itself uses, so it's already revealed the instant the title card's own
// 5-second timer fades it away. No coordination with that file's timing
// needed. Dismissing just hides this overlay; nothing else is gated on it.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  function hideDisclaimer() {
    const modal = document.getElementById("disclaimer-modal");

    if (modal) {
      modal.classList.add("hidden");
    }
  }

  function init() {
    const button = document.getElementById("disclaimer-ack-btn");

    if (button) {
      button.addEventListener("click", hideDisclaimer, { once: true });
    }
  }

  window.ESB.Disclaimer = { hide: hideDisclaimer };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
