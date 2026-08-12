/**
 * Link cards. A web address with a title you write yourself.
 *
 * Deliberately NOT a preview card. `SPEC.md` rules out scraping metadata, and
 * that rule is worth keeping: fetching a page to guess a title and a thumbnail
 * means every link on every board reaches out to the internet, quietly, on a
 * machine that otherwise never does.
 *
 * Double-click opens it in the real browser. Single click just selects.
 */

import { commitEdit, getCard, stashEdit, touch } from "../store.js";
import { isWebUrl, normaliseUrl } from "../url.js";

export async function openLink(card) {
  const url = normaliseUrl(card.url);
  if (!isWebUrl(url)) return false;
  return window.api.openExternal(url);
}

export function build(card, el, body) {
  const face = document.createElement("div");
  face.className = "ref-face";

  const text = document.createElement("div");
  text.className = "ref-text";

  const title = document.createElement("input");
  title.type = "text";
  title.className = "ref-title";
  title.placeholder = "Title";
  title.spellcheck = false;
  title.value = card.title || "";
  title.setAttribute("aria-label", "Link title");

  const url = document.createElement("input");
  url.type = "text";
  url.className = "ref-sub";
  url.placeholder = "example.com";
  url.spellcheck = false;
  url.value = card.url || "";
  url.setAttribute("aria-label", "Link address");

  bindField(title, card.id, "title");
  bindField(url, card.id, "url");

  /*
   * A single click on an obvious button, because double-clicking the card
   * announces itself to nobody. The card fields are inputs, so clicking those
   * has to keep putting the caret where you clicked — which leaves nothing on
   * the card that reads as "this goes somewhere" unless we add it.
   */
  const go = document.createElement("button");
  go.type = "button";
  go.className = "ref-open";
  go.textContent = "↗";
  go.title = "Open in your browser";
  go.setAttribute("aria-label", "Open link in your browser");
  go.addEventListener("click", () => {
    const target = getCard(card.id);
    if (target) openLink(target);
  });

  // Kept as a shortcut for anyone who tries it.
  face.addEventListener("dblclick", (event) => {
    if (event.target === title || event.target === url) return;
    const target = getCard(card.id);
    if (target) openLink(target);
  });

  text.append(title, url);
  face.append(text, go);
  body.appendChild(face);

  el.__linkTitle = title;
  el.__linkUrl = url;
  el.__linkOpen = go;
}

export function update(card, el) {
  if (document.activeElement !== el.__linkTitle && el.__linkTitle.value !== (card.title || "")) {
    el.__linkTitle.value = card.title || "";
  }

  if (document.activeElement !== el.__linkUrl && el.__linkUrl.value !== (card.url || "")) {
    el.__linkUrl.value = card.url || "";
  }

  const openable = isWebUrl(normaliseUrl(card.url));
  el.classList.toggle("is-openable", openable);
  el.__linkOpen.disabled = !openable;
}

function bindField(input, cardId, key) {
  input.addEventListener("focus", stashEdit);

  input.addEventListener("input", () => {
    const target = getCard(cardId);
    if (!target) return;
    stashEdit();
    target[key] = input.value;
    touch();
  });

  input.addEventListener("blur", commitEdit);
}
