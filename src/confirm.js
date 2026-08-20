/**
 * The one dialog in the app.
 *
 * Everything else here is done in place, on purpose — the picker, the colour
 * chips, renaming — and that rule held for deleting a board too, as a button
 * that armed itself on the first click. It stopped holding when deleting a
 * board had to ask *which* of the boards inside it should go as well. That is
 * a question with a list attached, and a list is not something a button can
 * arm into.
 *
 * So: modal, but only for destroying something. Nothing else gets one.
 */

let backdrop = null;
let active = null; // the resolve of the promise currently open

export function initConfirm(element) {
  backdrop = element;

  // A click on the backdrop itself is a cancel; one inside the dialog is not.
  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop) close(null);
  });

  window.addEventListener("keydown", (event) => {
    if (!active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(null);
    }
  });
}

export const isConfirmOpen = () => !!active;

/**
 * Asks before destroying something.
 *
 * Resolves to `null` if cancelled, or to the list of ticked choice ids — an
 * empty array when there were no choices, or none were ticked. Cancel and
 * "confirm with nothing ticked" are genuinely different answers, which is why
 * one is null and the other is `[]`.
 */
export function confirmDelete({ title, message, choices = [], choicesLabel = "", confirmLabel = "Delete" }) {
  if (active) close(null); // never stack two of these

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const heading = document.createElement("h2");
  heading.className = "dialog-title";
  heading.textContent = title;
  dialog.appendChild(heading);

  if (message) {
    const body = document.createElement("p");
    body.className = "dialog-message";
    body.textContent = message;
    dialog.appendChild(body);
  }

  const boxes = [];

  if (choices.length) {
    const label = document.createElement("p");
    label.className = "dialog-message";
    label.textContent = choicesLabel;
    dialog.appendChild(label);

    const list = document.createElement("div");
    list.className = "dialog-choices";

    for (const choice of choices) {
      const row = document.createElement("label");
      row.className = "dialog-choice";
      row.style.setProperty("--depth", choice.depth || 0);

      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = choice.id;
      boxes.push(box);

      const name = document.createElement("span");
      name.className = "dialog-choice-name";
      name.textContent = choice.title || "Untitled";

      row.append(box, name);

      // Ticking this one reaches outside the branch being deleted, which is
      // not visible from here otherwise.
      if (choice.elsewhere) {
        const note = document.createElement("span");
        note.className = "dialog-choice-note";
        note.textContent = "also used elsewhere";
        row.appendChild(note);
      }

      list.appendChild(row);
    }

    dialog.appendChild(list);

    // Nothing is ticked to begin with: the safe answer should be the one you
    // get by not thinking about it.
    const bulk = document.createElement("div");
    bulk.className = "dialog-bulk";

    const all = document.createElement("button");
    all.type = "button";
    all.className = "dialog-link";
    all.textContent = "Select all";
    all.addEventListener("click", () => boxes.forEach((box) => (box.checked = true)));

    const none = document.createElement("button");
    none.type = "button";
    none.className = "dialog-link";
    none.textContent = "Select none";
    none.addEventListener("click", () => boxes.forEach((box) => (box.checked = false)));

    bulk.append(all, none);
    dialog.appendChild(bulk);
  }

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "dialog-button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => close(null));

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "dialog-button is-danger";
  confirm.textContent = confirmLabel;
  confirm.addEventListener("click", () =>
    close(boxes.filter((box) => box.checked).map((box) => box.value))
  );

  actions.append(cancel, confirm);
  dialog.appendChild(actions);

  backdrop.replaceChildren(dialog);
  backdrop.hidden = false;

  // Focus lands on Cancel, not on the destructive button. A stray Enter or
  // Space arriving right after the dialog opens should do nothing.
  cancel.focus();

  return new Promise((resolve) => {
    active = resolve;
  });
}

function close(answer) {
  const resolve = active;
  active = null;

  backdrop.hidden = true;
  backdrop.replaceChildren();

  if (resolve) resolve(answer);
}
