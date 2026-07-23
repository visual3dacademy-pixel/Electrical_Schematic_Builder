// Version 0.2
// Centered four-option thermoswitch chooser. A selection remains a normal
// palette drag: press and hold an option, then drag it onto the schematic.

(function () {
  "use strict";

  window.ESB = window.ESB || {};

  const OPTIONS = [
    { typeId: "thermoswitch_close_fall", label: "Close on Fall" },
    { typeId: "thermoswitch_close_rise", label: "Close on Rise" },
    { typeId: "thermoswitch_open_rise", label: "Open on Rise" },
    { typeId: "thermoswitch_open_fall", label: "Open on Fall" }
  ];

  let overlay = null;

  function close() {
    if (overlay) {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  function create() {
    if (overlay) {
      return;
    }

    overlay = document.createElement("div");
    overlay.id = "thermoswitchPicker";
    overlay.className = "thermoswitch-picker";
    overlay.setAttribute("aria-hidden", "true");

    const dialog = document.createElement("div");
    dialog.className = "thermoswitch-picker__dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "thermoswitchPickerTitle");

    const header = document.createElement("div");
    header.className = "thermoswitch-picker__header";

    const title = document.createElement("h2");
    title.id = "thermoswitchPickerTitle";
    title.textContent = "Select Thermoswitch";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "thermoswitch-picker__close";
    closeButton.setAttribute("aria-label", "Close thermoswitch menu");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", close);

    header.appendChild(title);
    header.appendChild(closeButton);
    dialog.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "thermoswitch-picker__grid";

    OPTIONS.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "thermoswitch-picker__option";
      button.textContent = option.label;
      button.dataset.typeId = option.typeId;

      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        if (!window.ESB.CanvasInteractions || !window.ESB.CanvasInteractions.placeAtCenter) {
          return;
        }

        close();
        window.ESB.CanvasInteractions.placeAtCenter(option.typeId);
      });

      grid.appendChild(button);
    });

    dialog.appendChild(grid);
    overlay.appendChild(dialog);

    overlay.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (event.target === overlay) {
        close();
      }
    });

    document.getElementById("stage").appendChild(overlay);

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
      }
    });
  }

  function open() {
    create();
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }

  window.ESB.ThermoswitchPicker = { open, close };
})();
