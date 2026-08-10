# Board App — Build Spec

A personal, single-user Milanote-style board app. Cards on a large canvas, drag to arrange, synced across my devices.

I'm the only user. There is no signup, no multi-user anything, no collaboration. Optimise for something I can read and debug myself, not for scale.

---

## Principles

1. **No framework.** Vanilla JS with ES modules, built with Vite. I want to be able to follow the state flow without learning a framework's mental model first.
2. **One state object.** The entire board is a single plain JS object. Every mutation goes through one `applyChange()` function. This is what makes undo/redo and sync trivial.
3. **Small files.** Split by concern (`canvas.js`, `cards/`, `store.js`, `sync.js`). No file over ~300 lines.
4. **Build in the phases below, in order.** Don't start a phase until the previous one works end to end. Ask me to test before moving on.

---

## Explicit non-goals

Do not build these. If a design decision would only make sense in service of one of these, take the simpler path instead.

- Zoom. The canvas is fixed-scale.
- Infinite canvas. It's a fixed 5000×5000px area inside a scrollable container.
- Rich text. No bold, italic, fonts, colours, or headings inside cards.
- Connector arrows between cards.
- Link preview cards that scrape metadata.
- Multi-select or marquee selection.
- Snapping or alignment guides.
- Real-time sync, conflict merging, or operational transforms.
- User accounts, login, permissions.

---

## Stack

- **Frontend:** vanilla JS + ES modules, Vite, plain CSS. Hosted on Cloudflare Pages.
- **Local storage:** IndexedDB (use the `idb` package — the raw IndexedDB API is unpleasant). Stores board JSON and cached image blobs.
- **Backend:** a single Cloudflare Worker.
- **Board storage:** Cloudflare KV.
- **Image storage:** Cloudflare R2.
- **Auth:** a shared secret in an `Authorization` header. I'll generate a random string and paste it into each device once; store it in localStorage.

I already use Cloudflare Pages and GitHub for another project, so keep the deploy setup conventional.

---

## Data model

Boards are stored individually, keyed by id. A board never contains another board's cards — nesting is by reference.

```js
// Board
{
  id: "b_home",              // string; "b_home" is the root board
  title: "Home",
  lastModified: 1730000000000, // epoch ms, set on every save
  cards: [ /* Card */ ]
}

// Card — common fields
{
  id: "c_abc123",
  type: "text" | "list" | "image" | "swatch" | "board",
  x: 400, y: 220,            // top-left, canvas coordinates
  w: 240, h: 160,
  // ...type-specific fields below
}

// type: "text"
{ text: "plain string, newlines allowed" }

// type: "list"
{
  items: [{ id: "i_1", text: "buy film", checked: false }],
  checkable: false           // false = bullet list, true = checklist
}

// type: "image"
{ imageId: "img_xyz", alt: "" }   // blob lives in R2 / IndexedDB, never inline

// type: "swatch"
{ colour: "#c8a45e", label: "" }

// type: "board"
{ targetBoardId: "b_trip2026", title: "Iceland trip" }
```

**Images are never embedded in board JSON.** They are separate objects referenced by `imageId`. Board JSON must stay in the low kilobytes.

Board index — a separate KV key `index` listing all boards, so I can see what exists:

```js
{ boards: [{ id, title, lastModified }] }
```

---

## Worker API

```
GET    /board/:id       → board JSON, or 404
PUT    /board/:id       → save board JSON, update index, return { lastModified }
GET    /index           → board index
GET    /image/:id       → image blob (long cache headers, images are immutable)
PUT    /image/:id       → store blob in R2
DELETE /board/:id       → delete board and remove from index
```

Every route requires `Authorization: Bearer <secret>`, compared against a Worker secret. Anything else returns 401. Keep the whole Worker in one file.

---

## Sync behaviour

Last-write-wins, with a guard. No merging.

- On load: fetch from server. If unreachable, fall back to the IndexedDB copy and show an offline indicator.
- On change: write to IndexedDB immediately (synchronously as far as the user is concerned), then debounce a server PUT by ~2 seconds.
- Track the `lastModified` value the client loaded. Send it with the PUT. If the server's stored value is newer, respond 409.
- On 409: show a non-destructive prompt — "This board was changed on another device." with **Reload theirs** / **Keep mine**. Never auto-resolve, never silently discard.
- Images upload immediately on drop (they're immutable, so no conflicts), and are cached in IndexedDB by `imageId` so boards render offline and instantly.

Also add an **Export JSON** button that downloads the current board, and an **Import JSON** that loads one. This is my backup and escape hatch.

---

## Canvas and interaction

- Container is a scrollable div; inner canvas is 5000×5000px. Panning is native browser scroll — do not implement custom panning.
- Cards are absolutely positioned divs. Dragging moves the element via `transform: translate()` during the gesture for smoothness, then commits `x`/`y` to state on pointerup. Only commit to state once, on release — not on every pointermove, or undo history will fill with hundreds of entries.
- Use pointer events (not mouse events) so touch works.
- Resize via a handle in the bottom-right corner of a selected card. Same commit-on-release rule.
- Single selection only: click a card to select, click empty canvas to deselect. Delete/Backspace deletes the selected card when not editing text.
- Cards render in array order; bring-to-front on select by moving the card to the end of the array.
- Double-click empty canvas opens a small card-type picker at that position.
- Drag an image file from the desktop onto the canvas to create an image card there.

---

## Undo/redo

Implement in Phase 1, not later. Retrofitting this is miserable.

Keep two stacks of full board snapshots (`structuredClone` of the state object). Push the previous state onto the undo stack inside `applyChange()`, clear the redo stack. Ctrl/Cmd+Z pops undo, Ctrl/Cmd+Shift+Z pops redo. Cap the stacks at 50 entries.

Boards are small; snapshotting the whole thing is fine and far simpler than tracking diffs. Text and list typing should coalesce — don't push a snapshot per keystroke; push on blur or after a ~500ms pause.

---

## Card types

**text** — an auto-growing textarea filling the card. Click to focus, blur to commit. No formatting.

**list** — rows of single-line inputs. Enter creates a new row below and focuses it. Backspace on an empty row deletes it and focuses the row above (cursor at end). A per-card toggle switches between bullets and checkboxes. Optional: drag rows to reorder, but only after everything else works.

**image** — displays the cached blob. Preserve aspect ratio on resize.

**swatch** — a solid colour block with an optional one-line label. Colour set via a native `<input type="color">`. This is for building palettes from photos, so also let me pick a colour from an image card if that's straightforward — otherwise skip it.

**board** — a card showing a title and the target board's card count. Clicking it navigates to that board. Creating one prompts for a title and creates the new empty board immediately.

---

## Navigation

A breadcrumb bar at the top: `Home / Iceland trip / Locations`. Clicking any crumb navigates there. Browser back should work — push board ids into `history.pushState`.

A board switcher (dropdown or simple sidebar) listing all boards from the index, so I can jump anywhere without walking the tree.

---

## Build phases

**Phase 0 — sync spike.** Before any UI. Build the Worker, deploy it, and write a throwaway page with two buttons that PUT and GET a hardcoded JSON object. Verify it round-trips between my laptop and my phone. Confirm auth rejects an unauthenticated request. Do not proceed until this works — I'd rather find deploy problems now than after the canvas exists.

**Phase 1 — canvas core.** Scrollable canvas, text cards only, drag, resize, select, delete, create. One state object, `applyChange()`, undo/redo, IndexedDB persistence. No server yet.

**Phase 2 — card types.** List, image, swatch. Image blobs in IndexedDB only at this stage.

**Phase 3 — sync.** Wire in the Worker. Debounced saves, 409 handling, offline fallback, image upload to R2, export/import buttons.

**Phase 4 — nested boards.** Board cards, board index, breadcrumbs, history integration, board switcher.

**Phase 5 — polish.** Touch behaviour on the phone, keyboard shortcuts, empty states, whatever's annoying by then.

---

## Notes on working with me

- I've built a static site from scratch but I'm not a professional developer. Explain the state flow when you introduce it, and flag anywhere I'm likely to get confused later.
- Prefer boring, readable code over clever code.
- After each phase, tell me what to test and what "working" should look like.
- Keep a short `NOTES.md` recording decisions made and anything deliberately deferred.