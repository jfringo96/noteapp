/**
 * The File menu.
 *
 * Deliberately four things. This is a personal tool with one document open at
 * a time, and a menu you can read without looking is worth more than one that
 * covers every case.
 */

import { createPanel, menuItem, menuSeparator } from "./panel.js";
import {
  collectionName,
  listCollections,
  newCollection,
  openCollection,
  openCollectionPath,
  saveCollectionAs,
} from "./collection.js";

let panel = null;

export function initFileMenu(panelEl, buttonEl) {
  panel = createPanel(panelEl, buttonEl, build);
  return panel;
}

async function build(el) {
  el.replaceChildren();

  const run = (action) => async () => {
    panel.hide();
    await action();
  };

  el.append(
    menuItem("New collection…", null, run(newCollection)),
    menuItem("Open collection…", null, run(openCollection)),
    menuItem("Save as…", null, run(saveCollectionAs)),
    menuSeparator(),
    menuItem("Open the folder on disk", null, () => {
      panel.hide();
      window.api.revealDataFolder();
    })
  );

  // Everything above works without this list; it just saves a trip through the
  // folder picker for collections sitting where they normally live.
  const others = (await listCollections()).filter((one) => one.name !== collectionName());
  if (!others.length) return;

  const heading = document.createElement("div");
  heading.className = "menu-heading";
  heading.textContent = "Other collections";

  el.append(menuSeparator(), heading);

  for (const one of others.slice(0, 8)) {
    el.appendChild(
      menuItem(one.name, null, () => {
        panel.hide();
        openCollectionPath(one.path);
      })
    );
  }
}
