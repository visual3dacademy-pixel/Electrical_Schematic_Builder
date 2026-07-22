// Version 1.2

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const MENU_ITEMS = ["Instructions", "Demo", "Diagnostics", "Print"];

  function createButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    return button;
  }

  function init() {
    const overlays = document.getElementById("overlays");
    if (!overlays || document.getElementById("mainMenuButton")) {
      return;
    }

    const menuButton = document.createElement("button");
    menuButton.id = "mainMenuButton";
    menuButton.type = "button";
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-controls", "mainMenuPanel");
    menuButton.innerHTML =
      '<span class="menu-bars" aria-hidden="true"><span></span><span></span><span></span></span>';

    const menuPanel = document.createElement("section");
    menuPanel.id = "mainMenuPanel";
    menuPanel.setAttribute("aria-label", "Main menu");
    menuPanel.hidden = true;

    const menuList = document.createElement("div");
    menuList.className = "main-menu-list";

    MENU_ITEMS.forEach((label) => {
      const item = createButton(label, "main-menu-item");
      item.addEventListener("click", () => {
        openComingSoon(label);
      });
      menuList.appendChild(item);
    });

    const exitButton = createButton("Exit", "main-menu-exit");
    exitButton.addEventListener("click", closeMenu);

    menuPanel.appendChild(menuList);
    menuPanel.appendChild(exitButton);

    const modal = document.createElement("div");
    modal.id = "comingSoonModal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="coming-soon-dialog" role="dialog" aria-modal="true" aria-labelledby="comingSoonTitle">' +
        '<button id="comingSoonClose" class="coming-soon-close" type="button" aria-label="Close">×</button>' +
        '<div id="comingSoonSection" class="coming-soon-section"></div>' +
        '<h2 id="comingSoonTitle">Coming Soon</h2>' +
      '</div>';

    overlays.appendChild(menuButton);
    overlays.appendChild(menuPanel);
    overlays.appendChild(modal);

    menuButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    menuButton.addEventListener("click", () => {
      if (menuPanel.hidden) {
        openMenu();
      } else {
        closeMenu();
      }
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeComingSoon();
      }
    });

    document.getElementById("comingSoonClose").addEventListener("click", closeComingSoon);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!modal.hidden) {
        closeComingSoon();
      } else if (!menuPanel.hidden) {
        closeMenu();
      }
    });
  }

  function openMenu() {
    const button = document.getElementById("mainMenuButton");
    const panel = document.getElementById("mainMenuPanel");
    if (!button || !panel) return;

    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-open");
  }

  function closeMenu() {
    const button = document.getElementById("mainMenuButton");
    const panel = document.getElementById("mainMenuPanel");
    if (!button || !panel) return;

    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.classList.remove("is-open");
  }

  function openComingSoon(sectionName) {
    const modal = document.getElementById("comingSoonModal");
    const section = document.getElementById("comingSoonSection");
    if (!modal || !section) return;

    section.textContent = sectionName;
    modal.hidden = false;
    closeMenu();
  }

  function closeComingSoon() {
    const modal = document.getElementById("comingSoonModal");
    if (modal) modal.hidden = true;
  }

  window.ESB.Menu = { init };
})();
