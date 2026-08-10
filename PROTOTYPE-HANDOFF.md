# Phase 1 prototype — handoff

What `board-prototype.html` established, what it deliberately fakes, and what
is still undecided. Written at the end of the prototype so the real build does
not have to re-derive any of it.

**This is not the app spec.** `SPEC.md` is. This document records only what the
prototype proved or exposed. Where the two disagree, the spec wins — but the
disagreement is worth a conversation first, because most of what is below came
out of something actually breaking.

Reference implementation: `board-prototype.html` on branch
`claude/board-app-prototype-pywvqz`. One file, no build step, no network, no
storage APIs. Open it in a browser to feel any behaviour described here.

---

## 1. State model

The entire document is one plain object. Nothing else is authoritative.

```js
let state = {
  currentBoardId: "b_home",
  boards: {
    b_home: { id: "b_home", title: "Home", cards: [] }
  }
};

const currentBoard = () => state.boards[state.currentBoardId];
```

**Boards are flat, keyed by id. A board never contains another board's cards.**
Nesting is by reference only — a card holding a `targetBoardId`. This is the
load-bearing decision. It is what lets a board be linked from several places,
lets two boards point at each other in a cycle, and makes moving a card between
boards a splice and a push with no re-parenting.

### Cards

```js
{ id, type, x, y, w, h }              // common; x/y = top-left in canvas coords

{ type: "text",   text: "plain string, newlines allowed" }
{ type: "list",   items: [{ id, text, checked }], checkable: false }
{ type: "image",  dataUrl: "data:image/...", alt: "" }
{ type: "swatch", colour: "#c9a227", label: "" }
{ type: "board",  targetBoardId: "b_iceland" }
```

A board card holds **only** the target id. Title and card count are read from
the target board on every render. Nothing is duplicated, so renaming a board
updates every card pointing at it for free.

### What is NOT in state

Deliberately, and it matters — anything here would end up in every history
snapshot, every export, and every `structuredClone`:

| Value | What it is |
|---|---|
| `selectedId` | single selection |
| `trail` | breadcrumb route, capped at `TRAIL_MAX` (10) |
| `backStack` | Back-button route, capped at `BACK_MAX` (50) |
| `scrollMemory` | `Map<boardId, {x,y}>` — scroll position per board |
| `displayedBoardId` | which board `render()` last drew |
| `editSnapshot` | in-flight typing snapshot |
| `cardClipboard` | cut/copy buffer |
| `undoStack` / `redoStack` | history |

The test for whether something belongs in `state`: would you want it in the
exported file, and would you want undo to restore it? Scroll position fails
both.

### Constants

`CANVAS_SIZE` 3000 · `HISTORY_LIMIT` 50 · `TRAIL_MAX` 10 · `BACK_MAX` 50 ·
`IMAGE_MAX_EDGE` 320 · per-type `MIN_SIZE` and `DEFAULT_SIZE`.

---

## 2. The mutation contract

Every change to the document goes through one function.

```js
function applyChange(mutator) {
  commitEdit();                       // seal any in-flight typing first
  const before = structuredClone(state);
  mutator();
  undoStack.push(before);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  render();
}
```

Three rules hang off this, and each exists because the naive version was wrong:

### 2.1 Typing never touches history and never re-renders

Text and list inputs write straight into the state object on `input`. No
history push, no `render()` — the DOM is already correct, and re-rendering
mid-keystroke destroys focus and the caret.

- On `focus`: stash a whole-state snapshot (`stashEdit`, idempotent).
- On `input`: `stashEdit()` **before** the write, so the snapshot is
  pre-change even if focus was missed.
- On `blur`: push the stashed snapshot, but only if the content actually
  changed (`commitEdit`). One history entry per editing session.

`commitEdit()` does **not** render.

### 2.2 `applyChange()` seals the in-flight edit first

Without the `commitEdit()` on line one, this sequence produces out-of-order
history: focus a card, type, then drag a different card. The drag's snapshot
captures the typed text, and the pending edit snapshot lands on the stack
*after* it — so undo replays the typing forwards. Sealing first gives two
correctly ordered entries.

### 2.3 Gestures move pixels, then commit once

Drag and resize update the element visually during the gesture and call
`applyChange()` exactly once, on `pointerup`. Never per `pointermove`.

Drag uses `transform: translate()` starting from `translate(0,0)`, which is
what makes there be no jump on grab regardless of where in the handle you grab.
Both compensate for scroll changes mid-gesture.

---

## 3. Navigation

**Navigating is not an undoable action.** It never goes through
`applyChange()`.

But `navigateTo()` must call `commitEdit()` before switching. Otherwise a
pending edit snapshot — taken on the board you are leaving — later differs from
live state by `currentBoardId` alone, and merely walking between boards lands
in the undo stack.

### Three separate notions of "where I am"

| | Purpose |
|---|---|
| `state.currentBoardId` | the board on screen; the only one in the document |
| `trail` | breadcrumbs — a record of the route *clicked*, not a tree path |
| `backStack` | Back button — survives a switcher jump clearing the trail |

The trail is not computed from the data and must not be. A board can be linked
from several places, and two boards can point at each other, so there is no
canonical path. Clicking a crumb truncates; a switcher jump resets to a single
crumb; the cap stops a cycle growing it forever. `normaliseTrail()` repairs it
against reality after an import or a board deletion.

### Undo across boards lands on the board that changed

Undoing an edit made on another board navigates you back to that board to show
you the change. Silently undoing something off-screen is worse.

This took two attempts. Snapshots carry `currentBoardId`, so undo gets it free
— that snapshot was taken by `applyChange()` at the moment of the edit. **Redo
does not**: its entry is built at undo time from live state, which names
wherever you were standing then, so redo would re-apply a change on a board you
were not looking at. The fix is one line — when pushing the inverse entry,
stamp it with `currentBoardId` from the entry being undone:

```js
const target  = undoStack[undoStack.length - 1];
const inverse = structuredClone(state);
inverse.currentBoardId = target.currentBoardId;   // redo shows the change too
redoStack.push(inverse);
state = undoStack.pop();
```

An earlier version diffed the two states to find the changed board. It worked
but cost a `JSON.stringify` per board per jump and needed a heuristic for
changes touching two boards at once. The stamp replaces both. **Keep the
stamp, not the diff.**

---

## 4. Interaction rules worth preserving

- **Drag handle is a grip bar on the card's top edge**, not the body — dragging
  from the body fights text selection inside textareas. `touch-action: none` on
  the grip and the resize handle only, so the canvas still pans by touch
  everywhere else.
- **Selection is single**, and brings the card to the end of `cards` (= front).
  Not a history entry — it is treated as a view operation. Consequence: a
  z-order change rides along inside the next real change's snapshot.
- **Selection changes never rebuild the DOM.** Rebuilding on `pointerdown`
  destroys the element the click is landing on and swallows focus for
  textareas. Selection updates `z-index` and classes in place.
- **Delete/Backspace only when focus is outside a text field.** Same guard for
  Cmd/Ctrl+X/C/V/D, so they never shadow the browser's own text editing.
- **Move a card between boards** by dragging it onto a board card. Hit-test the
  *pointer*, not the card, front-to-back so the topmost target wins — the aim
  should match the finger. A board card is never its own drop target, nor is
  one pointing back at the board you are already on.
- **Board card click rule.** Unselected, the whole body opens the board,
  including over the title. Once selected, the title becomes the rename field
  and swallows the click. Armed at `pointerdown`, because the card selects
  itself before the click event lands.
- **Deleting never cascades.** Deleting a board card leaves the board; deleting
  a board leaves the cards pointing at it, which render as visibly broken
  links. An unresolvable `targetBoardId` must render, never throw.
- **Cards grow to fit content but never shrink**, so a height set by dragging
  is respected.

---

## 5. Deliberately faked — do not carry across

### 5.1 Images as data URLs — the top scaling risk

Images are inlined on the card so the whole document is one JSON blob. This is
now the worst thing in the prototype, because it compounds with §5.2: every
image is cloned into every history entry, up to 50, across two stacks. A few
photographs will make undo visibly stutter.

The real app must store binary separately — blob store keyed by id, with only
a reference on the card. This is not a later cleanup; it decides whether the
history model survives real content, so settle it before building on undo.

### 5.2 Whole-state snapshots

`structuredClone(state)` per change. Simple, correct, and much easier than
diffing — the right call at prototype scale and I would make it again. It will
not scale to a large board or to sync. Revisit alongside §5.1.

### 5.3 Full re-render

`render()` rebuilds the entire card layer. Safe only because it never runs
mid-keystroke or mid-gesture. Fine here; a real app wants keyed reconciliation
or a framework doing it.

### 5.4 Import replaces state

Open-a-file semantics, not merge. Legacy single-board exports are detected and
migrated (wrapped into `boards` under their own id). Imported image `src`
values that are not `data:` URLs are stripped — a remote one would break the
no-network rule.

### 5.5 No confirmation on destructive actions

Deleting a board with cards in it just does it, with a toast and undo. Defensible
in a prototype where undo is one keystroke; probably not in the real app,
especially on touch where there is no Ctrl+Z.

### 5.6 Other shortcuts

- A per-card delete `×` in the grip bar — touch has no Delete key.
- Moving a card carries its x/y across unchanged, so it can land overlapping
  something on the destination board. No auto-placement.
- `New board` navigates to the board it creates.
- Export is named after the first board in the map, which is arbitrary once
  you have imported.
- Seed content on load; replace `seed()` with an empty `cards` array.

---

## 6. Open questions for Phase 2

1. **Persistence and blob storage.** The whole of §5.1. What is the store, and
   what does a card reference look like?
2. **History under persistence.** Does undo survive a reload? If so,
   whole-state snapshots are definitely out.
3. **Undo landing on a board not in your trail** resets the breadcrumb to just
   that board, losing the route you walked. Truthful, but possibly wrong.
4. **Board deletion with links pointing at it.** The prototype leaves broken
   links deliberately. Real app might want to warn, or list what will break.
5. **List rows clip long text** rather than wrapping — they are single-line
   `<input>`s, as specified. Readable while editing, less so at a glance.
6. **Board card rename discoverability.** Select-then-click is the standard
   OS file-rename gesture but is not obvious without a hover cue.

---

## 7. Behavioural test suites

Four Playwright suites under `prototype-tests/`, 176 assertions, all passing
against `board-prototype.html`:

| File | Covers |
|---|---|
| `test.mjs` | Phase 1 — drag, resize, undo, list keys, export/import, touch, reduced motion |
| `test-steps12.mjs` | flat state refactor, whole-state snapshots |
| `test-steps345.mjs` | board cards, breadcrumbs, switcher, whole-state export, legacy migration |
| `test-round4.mjs` | card move between boards, clipboard, board delete, back, scroll memory |

They drive the prototype's globals directly, so they will **not** run against
the real app. Keep them as an executable record of the behaviour above — when
you are unsure what the prototype did in some corner, the assertion names are
the fastest answer.

Run with `node prototype-tests/test.mjs` (needs Playwright and a Chromium
path — see the top of each file).
