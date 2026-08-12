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

/** Only ever hand the OS something we are sure is a web address. */
export function isOpenable(url) {
  try {
    const parsed = new URL(String(url).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Adds https:// to something typed as "example.com". */
function normalise(url) {
  const trimmed = String(url).trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

export async function openLink(card) {
  const url = normalise(card.url);
  if (!isOpenable(url)) return false;
  return window.api.openExternal(url);
}

export function build(card, el, body) {
  const face = document.createElement("div");
  face.className = "link-face";

  const title = document.createElement("input");
  title.type = "text";
  title.className = "link-title";
  title.placeholder = "Title";
  title.spellcheck = false;
  title.value = card.title || "";
  title.setAttribute("aria-label", "Link title");

  const url = document.createElement("input");
  url.type = "text";
  url.className = "link-url";
  url.placeholder = "example.com";
  url.spellcheck = false;
  url.value = card.url || "";
  url.setAttribute("aria-label", "Link address");

  bindField(title, card.id, "title");
  bindField(url, card.id, "url");

  // Double-click to open, matching board cards. A single click has to stay
  // free for selecting, and for putting the caret in either field.
  face.addEventListener("dblclick", (event) => {
    if (event.target === title || event.target === url) return;
    const target = getCard(card.id);
    if (target) openLink(target);
  });

  face.append(title, url);
  body.appendChild(face);

  el.__linkTitle = title;
  el.__linkUrl = url;
}

export function update(card, el) {
  if (document.activeElement !== el.__linkTitle && el.__linkTitle.value !== (card.title || "")) {
    el.__linkTitle.value = card.title || "";
  }

  if (document.activeElement !== el.__linkUrl && el.__linkUrl.value !== (card.url || "")) {
    el.__linkUrl.value = card.url || "";
  }

  el.classList.toggle("is-openable", isOpenable(normalise(card.url)));
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
