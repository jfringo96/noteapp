# Board App — Build Spec

A personal, single-user Milanote-style board app. Cards on a large canvas, drag
to arrange. A standalone desktop application that keeps its data in an ordinary
folder on disk.

I'm the only user. There is no signup, no server, no multi-user anything, no
collaboration. Optimise for something I can read and debug myself, not for
scale.

How I actually use this: I ideate at the desk, and then in the field I want to
look at a gallery of images for inspiration. The phone is not a second client —
it receives an exported file. Nothing syncs.

---

## Principles

1. **No framework.** Vanilla JS with ES modules, built with Vite. I want to be
   able to follow the state flow without learning a framework's mental model
   first. Electron's window is an ordinary web page, so this still holds.
2. **One state object.** The entire document is a single plain JS object. Every
   mutation goes through one `applyChange()` function. This is what makes
   undo/redo trivial.
3. **Small files.** Split by concern (`canvas.js`, `cards/`, `store.js`,
   `storage.js`). No file over ~300 lines.
4. **My data is mine.** Boards are readable JSON and images are ordinary image
   files, in a folder I can open, copy, and back up by any normal means. If the
   app breaks, nothing is trapped inside it.
5. **Build in the phases below, in order.** Don't start a phase until the
   previous one works end to end. Ask me to test before moving on.

---

## Explicit non-goals

Do not build these. If a design decision would only make sense in service of
one of these, take the simpler path instead.

- Zoom. The canvas is fixed-scale.
- Infinite canvas. It's a fixed 5000×5000px area inside a scrollable container.
- Rich text. No bold, italic, fonts, colours, or headings inside cards.
- Connector arrows between cards.
- Link preview cards that scrape metadata.
- Multi-select or marquee selection.
- Snapping or alignment guides.
- Any server, sync, accounts, login, or permissions.
- A mobile version of the app. The phone gets an exported gallery, nothing more.
- Auto-update. I'll run a new installer when there's something worth having.

---

## Stack

- **Shell:** Electron.
- **Renderer:** vanilla JS + ES modules, Vite, plain CSS.
- **Storage:** a plain folder on disk. No database, no browser storage.
- **Packaging:** electron-builder, producing a Windows installer.

Electron rather than Tauri because Tauri needs a Rust toolchain installed
before it can build anything, and Electron needs only Node. The app being
larger doesn't matter for one user on one machine.

---

## Storage on disk

Default location `Documents\Board App\`:

```
Board App/
  boards.json          all boards, human-readable
  images/
    img_7fq2xk9.webp
    img_m3v81ba.webp
```

Backup is "put that folder in OneDrive" — version history and off-machine
copies for free, with nothing to configure.

Write `boards.json` atomically: write a temp file alongside it, then rename
over the original. A crash mid-write must never leave a truncated file where my
notes used to be.

Save on a short debounce after changes, and again on window close.

---

## Data model

Boards are kept in one flat map, keyed by id. **A board never contains another
board's cards** — nesting is by reference only, a card holding a
`targetBoardId`. This is what lets a board be linked from several places, lets
two boards point at each other, and makes moving a card between boards a splice
and a push.

```js
// The whole document
{
  version: 1,
  currentBoardId: "b_home",
  boards: {
    b_home: {
      id: "b_home",
      title: "Home",
      cards: [ /* Card */ ]
    }
  }
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
{ imageId: "img_xyz", mime: "image/webp", naturalW: 1280, naturalH: 853, alt: "" }

// type: "swatch"
{ colour: "#c8a45e", label: "" }

// type: "board"
{ targetBoardId: "b_trip2026" }
```

**Images are never embedded in `boards.json`.** They are files in `images/`,
referenced by `imageId`. The intrinsic dimensions live on the card so layout
never has to wait for a file read.

A board card holds **only** the target id. Its title and card count are read
from the target board on every render, so renaming a board updates every card
pointing at it for free. An unresolvable `targetBoardId` must render as a
visibly broken link, never throw.

### What is NOT in the state object

Anything here would end up in every history snapshot and every export. The test
is: would I want it in the exported file, and would I want undo to restore it?

`selectedId` · `trail` (breadcrumbs) · `backStack` · scroll position per board ·
the in-flight typing snapshot · the cut/copy buffer · undo and redo stacks ·
the `imageId → object URL` cache.

---

## Images

On import — dropped, pasted, or chosen — downscale to **max edge 1280px** and
re-encode as **WebP at quality 0.8**. A 4MB phone photo lands around 200KB.
This is a planning tool, not a photo library, and there's no zoom to expose the
loss.

Two things to get right at import:

- Honour EXIF rotation, or portrait photos land sideways.
- If an original is already smaller than its re-encode, keep the original.

Two cards can share an `imageId` (duplicating a card copies the reference), and
undo can hold states referencing an image whose card is currently deleted. So
**never delete an image file during a session.** Sweep unreferenced ones at
startup, when the history stacks are empty and reachability is unambiguous.

---

## Canvas and interaction

- Container is a scrollable div; inner canvas is 5000×5000px with a subtle dot
  grid. Panning is native browser scroll — do not implement custom panning.
- Cards are absolutely positioned divs. Dragging moves the element via
  `transform: translate()` during the gesture, then commits `x`/`y` to state on
  pointerup. **Only commit once, on release** — never per pointermove, or undo
  history fills with hundreds of entries.
- The drag handle is a slim grip bar along the card's top edge, not the body.
  Dragging from the body fights text selection inside textareas.
- Resize via a handle in the bottom-right corner of a selected card. Same
  commit-on-release rule. Image cards preserve aspect ratio.
- Single selection only: click a card to select, click empty canvas to deselect.
  Selecting brings the card to the end of the `cards` array (= front) and is
  treated as a view operation, not a history entry.
- **Selection changes must never rebuild the DOM.** Rebuilding on pointerdown
  destroys the element the click is landing on and swallows focus.
- Delete/Backspace deletes the selected card, but only when focus is outside a
  text field. Same guard for Ctrl+X/C/V/D.
- Double-click empty canvas opens a small card-type picker at that position. A
  toolbar button for each type places one in the centre of the viewport.
- Drag an image file onto the canvas to create an image card there. Accept
  paste from the clipboard too.
- Cards grow to fit content but never shrink, so a height set by dragging is
  respected.

The card layer is rebuilt by diffing against a `Map<id, element>` and reusing
elements — not by rebuilding it wholesale. Wholesale rebuilds are what destroy
focus and swallow gestures.

---

## Undo/redo

Implement in Phase 1, not later. Retrofitting this is miserable.

Every change goes through one function:

```js
function applyChange(mutator) {
  commitEdit();                       // seal any in-flight typing first
  const before = structuredClone(state);
  mutator();
  undoStack.push(before);
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  render();
}
```

Ctrl+Z undoes, Ctrl+Shift+Z redoes. Both stacks hold whole-document snapshots,
capped at 50. The document is small once images are references, so this is fine
and far simpler than diffing. **Undo does not survive a restart.**

Three rules hang off this:

1. **Typing never touches history and never re-renders.** Text and list inputs
   write straight into the state object on `input`. Stash a snapshot on focus,
   push it on blur only if the content actually changed. One history entry per
   editing session. Do not push on a timer — that fires while the caret is still
   in the box.
2. **`applyChange()` seals the in-flight edit first.** Without it, typing in one
   card and then dragging another produces out-of-order history.
3. **Gestures move pixels, then commit once.**

Undoing a change made on another board navigates back to that board to show it.
Snapshots carry `currentBoardId` so undo gets this for free; when pushing the
inverse entry for redo, stamp it with the `currentBoardId` of the entry being
undone, or redo re-applies a change on a board I'm not looking at.

---

## Card types

**text** — an auto-growing textarea filling the card. Plain text only.

**list** — rows of single-line inputs. Enter creates a new row below and focuses
it. Backspace on an empty row deletes it and focuses the row above, cursor at
end. A per-card toggle switches between bullets and checkboxes; checked rows get
strikethrough.

**image** — displays the file, `object-fit: contain`.

**swatch** — a solid colour block with an optional one-line label, set via a
native `<input type="color">`. This is for building palettes from photos, so
also let me pick a colour from an image card if that's straightforward —
otherwise skip it.

**board** — a card showing the target board's title and card count. Clicking it
navigates there. Creating one makes the new empty board immediately and
navigates to it — no dialog. Renaming is select-then-click on the title, with a
hover cue so the gesture is discoverable.

---

## Navigation

A breadcrumb bar at the top: `Home / Iceland trip / Locations`. Clicking a crumb
navigates there and truncates the trail.

The trail is a record of the route I clicked, **not** a computed tree path — a
board can be linked from several places and two boards can point at each other,
so there is no canonical path. Cap it, and repair it against reality after an
import or a board deletion.

A Back button, kept separately from the trail so it survives a switcher jump.

A board switcher listing all boards, so I can jump anywhere without walking the
tree.

Navigating is never an undoable action, but it must seal any in-flight edit
first — otherwise merely walking between boards lands in the undo stack.

Deleting never cascades. Deleting a board card leaves the board; deleting a
board leaves cards pointing at it as broken links.

---

## Gallery export

A button that writes a **single self-contained HTML file** containing every
image on the current board — or all boards, my choice at export time — with the
images embedded. I AirDrop it to my phone and open it in Safari.

It must work with no network and no app installed. Simple, big, tappable
images; dark background so photographs read accurately. Nothing else.

Also keep **Export JSON** and **Import JSON** for the whole document. That's an
escape hatch, not the backup strategy — the backup strategy is the folder.

---

## Build phases

**Phase 1 — canvas core.** Electron shell, scrollable canvas, text cards only,
drag, resize, select, delete, create. One state object, `applyChange()`,
undo/redo, saving to `boards.json`.

**Phase 2 — card types.** List, image, swatch. Image files on disk, downscaling
on import.

**Phase 3 — gallery export.** The self-contained HTML file. Export/Import JSON.

**Phase 4 — nested boards.** Board cards, breadcrumbs, back, board switcher,
moving cards between boards.

**Phase 5 — polish and packaging.** Keyboard shortcuts, empty states, the
installer, whatever's annoying by then.

---

## Visual direction

Don't leave this on browser defaults, but keep it quiet — this is a tool, not a
landing page.

The canvas is dark: a deep slate ground with a low-contrast dot grid, so
photographs and colour swatches read accurately rather than being washed out by
a white page. Cards are warm off-white paper with a real drop shadow, sitting
clearly above the ground. One accent colour only, for selection rings and focus
states — muted and slightly earthy rather than a saturated UI blue.

System font stacks. A proper type scale rather than everything at 16px, and
comfortable line height in cards — I'll be reading notes in these.

Visible keyboard focus states. Respect `prefers-reduced-motion`.

---

## Notes on working with me

- I've built a static site from scratch but I'm not a professional developer.
  Explain the state flow when you introduce it, and flag anywhere I'm likely to
  get confused later.
- Prefer boring, readable code over clever code.
- After each phase, tell me what to test and what "working" should look like.
- Keep a short `NOTES.md` recording decisions made and anything deliberately
  deferred.
- I need to be able to run and test the app as we go without reinstalling it
  each time.
