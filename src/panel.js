/**
 * A dropdown hanging off a button in the top bar.
 *
 * The File menu and the Map are the same object with different contents, and
 * getting the open/close behaviour subtly different between them would be the
 * kind of bug nobody reports and everybody notices.
 */

/**
 * `build` fills the panel and is called every time it opens, so a panel always
 * shows the document as it is now rather than as it was when it was last built.
 */
export function createPanel(panelEl, buttonEl, build) {
  buttonEl.addEventListener("click", () => (panelEl.hidden ? show() : hide()));

  window.addEventListener("pointerdown", (event) => {
    if (panelEl.hidden) return;

    // The button has to be excluded, or clicking it while open would close the
    // panel here and its own click handler would immediately reopen it.
    if (event.target.closest("#" + buttonEl.id)) return;
    if (!panelEl.contains(event.target)) hide();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panelEl.hidden) {
      hide();
      buttonEl.focus();
    }
  });

  function show() {
    build(panelEl);
    panelEl.hidden = false;

    const box = buttonEl.getBoundingClientRect();
    panelEl.style.left = box.left + "px";
    panelEl.style.top = box.bottom + 4 + "px";

    // Panels are anchored from the left, so a wide one near the right edge
    // would otherwise run off screen.
    const overflow = panelEl.getBoundingClientRect().right - window.innerWidth + 8;
    if (overflow > 0) panelEl.style.left = Math.max(8, box.left - overflow) + "px";
  }

  function hide() {
    panelEl.hidden = true;
  }

  return {
    show,
    hide,
    isOpen: () => !panelEl.hidden,
    /** Rebuild in place, but only while open — otherwise it's wasted work. */
    refresh: () => {
      if (!panelEl.hidden) build(panelEl);
    },
  };
}

/** A row in a menu: a button with a label, and optionally a hint beside it. */
export function menuItem(label, hint, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "menu-item";

  const text = document.createElement("span");
  text.className = "menu-label";
  text.textContent = label;
  button.appendChild(text);

  if (hint) {
    const note = document.createElement("span");
    note.className = "menu-hint";
    note.textContent = hint;
    button.appendChild(note);
  }

  button.addEventListener("click", onClick);
  return button;
}

export function menuSeparator() {
  const line = document.createElement("div");
  line.className = "menu-sep";
  line.setAttribute("aria-hidden", "true");
  return line;
}
