/**
 * Swatch cards. A colour block with a label, for building palettes from photos.
 */

import { commitEdit, getCard, stashEdit, touch } from "../store.js";

export function build(card, el, body) {
  const block = document.createElement("div");
  block.className = "swatch-block";
  block.style.background = card.colour;

  // The native picker fills the block, so clicking anywhere on the colour
  // opens it. No custom colour UI to build or get wrong.
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "swatch-picker";
  picker.value = card.colour;
  picker.title = "Pick a colour";
  picker.setAttribute("aria-label", "Swatch colour");

  picker.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target) return;
    stashEdit();
    target.colour = picker.value;
    block.style.background = picker.value;
    hex.textContent = picker.value.toUpperCase();
    touch();
  });

  // Dragging around the colour wheel fires input continuously; change fires
  // once when the dialog is done. That is the end of the editing session.
  picker.addEventListener("change", commitEdit);

  block.appendChild(picker);

  const foot = document.createElement("div");
  foot.className = "swatch-foot";

  const label = document.createElement("input");
  label.type = "text";
  label.className = "swatch-label";
  label.value = card.label || "";
  label.placeholder = "Label";
  label.spellcheck = false;
  label.setAttribute("aria-label", "Swatch label");

  label.addEventListener("focus", stashEdit);
  label.addEventListener("input", () => {
    const target = getCard(card.id);
    if (!target) return;
    stashEdit();
    target.label = label.value;
    touch();
  });
  label.addEventListener("blur", commitEdit);

  const hex = document.createElement("span");
  hex.className = "swatch-hex";
  hex.textContent = (card.colour || "").toUpperCase();

  foot.append(label, hex);
  body.append(block, foot);

  el.__swatchBlock = block;
  el.__swatchPicker = picker;
  el.__swatchLabel = label;
  el.__swatchHex = hex;
}

export function update(card, el) {
  el.__swatchBlock.style.background = card.colour;
  el.__swatchPicker.value = card.colour;
  el.__swatchHex.textContent = (card.colour || "").toUpperCase();

  if (document.activeElement !== el.__swatchLabel && el.__swatchLabel.value !== card.label) {
    el.__swatchLabel.value = card.label || "";
  }
}
