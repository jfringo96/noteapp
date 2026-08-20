# Notes

Decisions and their reasons, plus anything deliberately deferred. `SPEC.md`
says *what* to build; this says *why it's that way*, so the reasoning doesn't
have to be re-derived.

---

## Reference material

- `board-prototype.html` — the Phase 1 prototype. A reference implementation,
  not a foundation. The state model, `applyChange()`, the typing-coalescing rule
  and the gesture handlers are meant to be lifted; the DOM building below the
  "wiring" comment is scaffolding and gets rewritten.
- `PROTOTYPE-HANDOFF.md` — what the prototype established, faked, and left open.
  Still accurate about behaviour. Stale wherever it discusses persistence.
- `prototype-tests/` — four Playwright suites, 176 assertions. They drive the
  prototype's globals and will **not** run against the real app. Kept as an
  executable record: when it's unclear what the prototype did in some corner,
  the assertion names are the fastest answer.

---

## Decisions

### Standalone desktop app, no server (2026-08-10)

The original spec was a browser app synced through Cloudflare Workers, KV and
R2. Phase 0 was built, deployed and verified before being abandoned.

The real use is ideating at the desk and browsing images for inspiration in the
field. That's one device emitting a read-only artefact, not two devices sharing
a document — so sync never earned its place. Dropping it removed the Worker,
KV, the shared secret, the 409 conflict prompt, the offline fallback, PWA
installability, and iOS Safari's 7-day storage eviction problem.

Browser storage was also a silent data-loss risk with no self-service recovery.
A folder on disk is the honest fix.

All Cloudflare resources have been deleted. `worker/` and `spike/` are removed;
git history has them if ever needed. Two traps worth remembering if anything
Cloudflare ever comes back: piping a secret from PowerShell appends a newline
and causes a baffling 401, and changing a Worker secret doesn't restart live
isolates, so auth flaps until a redeploy forces new ones.

### Operating constraint: no terminal to *use* the app

Stated explicitly by the owner, who isn't a professional developer and can't
recover from a broken setup alone. Going standalone satisfies this by
construction — no login, no token, no expiring storage.

Two residual costs, both accepted:

- Windows SmartScreen warns "unknown publisher" on first install. One click
  through *More info → Run anyway*. Code signing isn't worth it for one user.
- Updates mean running a new installer. The data folder is untouched by this.

Changing the app still needs a developer environment. Using it never does.

### Electron over Tauri

Tauri needs a Rust toolchain installed before it can build anything. Electron
needs only Node. A 200MB app is irrelevant for one user on one machine.

The renderer stays vanilla JS + Vite, so `SPEC.md` Principle 1 is undisturbed —
an Electron window is an ordinary web page.

### Flat multi-board state shape from Phase 1

Phase 1 uses `{ version, currentBoardId, boards: {} }` with exactly one board in
it, which departs from a literal reading of Principle 4 (nested boards are
Phase 4).

Features still land in spec order — no board cards, breadcrumbs or switcher
before Phase 4. Only the container shape comes early, because the prototype
already paid for this refactor once (commit `7fa1c1b`) and the handoff calls it
the load-bearing decision. Doing it now makes Phase 4 additive instead of a
rewrite of `applyChange`, undo, export and every card lookup.

### Whole-state undo snapshots survive the scale worry

`PROTOTYPE-HANDOFF.md` §5.2 flagged `structuredClone` snapshots as a scaling
risk. That was really §5.1 in disguise: the cost was images being inlined. Once
images are references, a snapshot is text, coordinates and ids, and 50 of them
is single-digit MB. The simple version stays.

### Swatch cards dropped; tinting added instead

Swatches existed to pull palettes out of photographs. The owner had no use for
them. Removed entirely rather than left in as dead weight.

What replaced them is smaller and more useful: text and list cards can have
their top bar tinted from a colour chip in that bar, for colour-coding a board
by eye. It reuses the swatch's one good idea — a native `<input type="color">`
beats anything worth hand-building.

Cards of a removed type render as "Unsupported card — delete it" rather than
blank or throwing, so an older `boards.json` still opens.

### Cream ground, and frameless image cards

`SPEC.md` originally specified a dark slate canvas, so photographs and colours
would read accurately against it. The owner asked for cream. Done — this is a
notes surface first and text reads better on it. Worth revisiting only if
images start looking washed out.

Image cards lost their frame at the same time: no paper, no letterbox fill, and
the grip floats over the top edge on hover instead of taking a strip out of the
card. An image card is now the photograph and nothing else.

### Columns own their items; boards reference theirs

Two kinds of containment in the same app, deliberately different.

A **board** card holds only a `targetBoardId`. Boards are a flat map, so one
board can be linked from several places and two can point at each other.

A **column** holds full cards in its `items` array. It owns them outright.

The alternative — keeping every card in `board.cards` with a `parentColumnId` —
was rejected. Cards in a column have no meaningful x/y, so a flat list would
carry two kinds of card that obey different layout rules, and every render
would have to filter and re-sort. Ownership makes the containment visible in
`boards.json` and makes each move a splice out and a splice in.

The cost is that a card now lives in one of two places, so `getCard` has to
look in both. `findCardEntry()` in `store.js` is the single place that knows
this, and it returns the list and index so callers can splice without
re-deriving it. **Always call it fresh inside a mutator** — `applyChange`
clones the whole state, so an entry found beforehand points into the old
object.

**Columns never contain columns.** Milanote's own rule, and it is what keeps
this bounded: one level, no recursion, no cycle detection.

### Creating a board doesn't navigate into it

`SPEC.md` originally said creating a board navigates to it, inherited from the
prototype. Changed: it now creates the board and card, leaves you where you
are, and selects the name for typing.

Teleporting away from the board you were working on to an empty one is
disorienting, and you usually want to name the thing you just made. This is
also what Milanote does.

### Selection-dependent behaviour must live in CSS, not `update()`

Selection deliberately never re-renders — it only toggles `is-selected` and the
z-index (see the note in `store.js`). So anything that depends on whether a card
is selected has to be expressed as a CSS rule keyed off that class.

The board card's rename gesture is the case that exposed this. Making the name
editable inside `update()` looked right and could never work, because the click
that selects the card is the same click that needs the name to already be live.
`pointer-events` keyed off `.is-selected` does work.

### Image sizing

1280px max edge, WebP q0.8 — chosen deliberately small. This is for inspiration
and planning, not a photo library, and there's no zoom to expose the loss. Also
keeps gallery exports AirDroppable: ~200KB an image, so thirty images is ~6MB.

### Where `SPEC.md` and `PROTOTYPE-HANDOFF.md` disagreed

Resolved and folded into the rewritten spec. Recorded because each came out of
something actually breaking.

| | Resolution |
|---|---|
| Board card carries a `title` vs id only (handoff §1) | **Id only** — renaming a board then updates every card pointing at it. |
| Typing pushes on blur or a 500ms pause vs blur only (handoff §2.1) | **Blur only.** The pause fires while the caret is still in the box and re-opens the ordering bug in §2.2. |
| Export the current board vs the whole document | **Whole document.** A backup covering one board isn't a backup. |
| Canvas 5000 vs the prototype's 3000 | **5000.** |
| Board creation prompts for a title vs no modals (commit `adc3335`) | **No modal** — create immediately, rename inline, with a hover cue since handoff §6.6 flags the gesture isn't discoverable. |
| Back via `history.pushState` vs a `backStack` array (handoff §3) | **`backStack`.** `pushState` was for the phone's back gesture, and there's no phone now. |

---

## Working on it

**Day to day:** double-click `Start Noteapp (dev).cmd`. It launches Vite and
Electron together. Edit a file, save, and the window updates on its own —
usually instantly, without losing what's on the board. No reinstalling.

Close the app window to stop everything; the black console window closes with
it.

**Nothing is installed in this mode.** The app runs from this folder. That means
it disappears if the folder moves, which is fine while we're building.

**One gotcha worth knowing.** Changes under `src/` appear instantly. Changes to
`electron/` — the window itself, or anything it exposes to the page — only take
effect when the app is closed and reopened. If a new feature does nothing at
all and the console mentions something being undefined, that's usually why.

**Making a real installed copy** — `npm run pack` builds an installer into
`release/`. Worth doing once the app is genuinely useful, and again whenever
there's a version worth keeping. The installed copy and the dev copy read the
same `Documents\Noteapp\` folder, so there is only ever one set of notes.

### Controls moved off the cards into a left inspector

Colour chips, the bullets/tick-boxes toggle and the board Picture button all
started life on the cards. That put a row of tiny targets on top of the content,
made the grips crowded, and left the controls hard to find.

They now live in a rail down the left that changes with the selection, like
Milanote's. The rail is always rendered, even when nothing is selected, so the
canvas never shifts sideways under the pointer when you click something.

The inspector is rebuilt wholesale on every selection change. That is fine here
and nowhere else in the app: it is a handful of buttons, it holds no caret, and
nothing in it is mid-gesture when the selection changes.

The colour tool calls `render()` directly rather than going through the store's
render hook, because dragging around the colour wheel fires continuously and
rebuilding the chrome would rebuild the inspector the pointer is inside.

### The phone export is a folder of JPEGs, not a clever file

Considered: one self-contained HTML gallery, a PDF, and a plain folder of
images. The folder won.

The constraint was "over the internet, then readable offline with no signal".
All three satisfy that, but only the folder ends up in the phone's own photo
app — which is a far better viewer than anything worth building, and needs no
app, no account and no file management. It is also the most durable output: a
folder of photos is still readable in ten years with no software at all.

Two details that are easy to get wrong:

- **Re-encode to JPEG.** Stored images are WebP and phone galleries handle it
  badly. Flatten onto white first, or a transparent PNG exports black.
- **Never overwrite a previous export.** The folder gets a suffix instead.

`SPEC.md` originally called for the single-HTML version, from when the phone was
an iPhone being AirDropped to. Android plus OneDrive makes the folder simpler.

### A gesture nothing advertises may as well not exist

Links and places opened on double-click, and nobody found it. There was nothing
on the card saying anything would happen — and the obvious thing to try, a
single click on the address, has to keep putting the caret where you clicked,
because the address is an editable field.

So both now carry a visible button. Double-click still works for anyone who
tries it, but it is a shortcut rather than the mechanism. The button disables
itself when there is nothing valid to open.

Same lesson as the board rename gesture: select-then-click was correct and
undiscoverable. If a behaviour has no visible affordance, it needs one.

### Two colours, each with one job

The palette went cream to Milanote's white and grey. Alongside that, the
selection colour became near-black rather than a hue.

The rule worth keeping: **near-black means "selected", blue means "this goes
somewhere"**. Nothing decorative uses blue, so it always means the same thing
when it appears. The old accent was doing both jobs and neither was legible.

### Maps: build a URL, hand it over, fetch nothing

Three options were weighed for a map card: a live tile map (Leaflet plus
OpenStreetMap), a static map image cached to disk, and simply opening the
location in the browser.

The first two need an account with a mapping provider and an API key pasted
into the app, and the live one needs the network every time you look at it. The
owner ruled both out — no signups, no keys.

So a place card holds text and builds a Google Maps URL on double-click. It
costs nothing, works with no account, and cannot break when a provider changes
its terms. A pasted Maps link is used as-is, which covers the fallback of
grabbing a URL by hand.

Worth remembering if this comes up again: **the constraint that made this easy
was accepting that the map lives in the browser, not in the card.** Every
expensive option came from wanting to render the map inside the app.

### Link cards fetch nothing

`SPEC.md` lists link preview cards that scrape metadata as a non-goal, and that
survived the rewrite deliberately. A preview card means every link on every
board reaches out to the internet, quietly, from a machine that otherwise never
does — for a title you could type in two seconds.

So a link card is a URL and a title you write. Opening one goes through the
main process, which checks the scheme is `http:` or `https:` before handing it
to the OS. Without that check a `file:` or a Windows shell scheme sitting in a
`boards.json` would be enough to launch something.

### Deleting a board is armed, not instant

Two clicks in the inspector rather than a one-shot `×` on the card, because a
board card is the only route back to everything inside it.

Arming in place rather than opening a dialog keeps the no-modal rule the
prototype established, and it disarms itself after a few seconds if you wander
off. Note the message afterwards is honest about what happened: the *link* went,
the board did not. Deleting never cascades.

### Selection rings go on the visible thing

A board card is a small tile in a larger, mostly empty box. Ringing the box drew
a rectangle around nothing and read as a bug. The ring goes on the thumbnail
instead — except inside a column, where the row really is the visible object, so
there it goes back on the card.

### A drag threshold is what makes whole-card dragging possible

Pictures and boards drag from anywhere on the card. That only works because a
drag now waits for the pointer to travel ~4px before it starts.

The earlier version captured the pointer and called `preventDefault()` on
`pointerdown`, which is what swallowed clicks on buttons inside the grip. Doing
that across an entire card would have killed its click and double-click
outright — so a board could never both drag from anywhere and open on
double-click. Waiting for movement means a plain click is never interfered with
at all.

It also stops a 1px twitch committing a reposition and putting a pointless
entry in the undo stack.

### Dragging has two visual modes

A card on the canvas is moved with `transform: translate()` from (0,0), which
is what stops it jumping when you grab it.

A card inside a column can't use that — the column clips it. So it is lifted to
`position: fixed` with its size frozen first, and flown under the pointer.
Both modes hit-test the same way and resolve to the same destination
descriptor, so `move.js` doesn't know or care which happened.

Reorder positions are read from **DOM order**, not from the element map. The
map keeps insertion order, which stops matching what you see the first time
anything is reordered — and reordering is the entire feature.

### Renamed to Noteapp, with the data folder moved for you (2026-08-20)

The repo, the product name, the launcher and the window title were all some mix
of "Board App" and "board-app" while the GitHub repo was `noteapp`. One name
now: **Noteapp**.

The only part with teeth was `Documents\Board App\`, which already had real
boards in it. `storage.js` renames that folder to `Documents\Noteapp\` once, on
first launch, and only when the new folder doesn't already exist. A rename on
one volume is atomic, so it either happens or it doesn't — it cannot half-move
and lose notes. If it fails, the app starts on an empty folder and the old one
is untouched next to it.

The `appId` changed too, which is normally the sort of thing that strands an
installed copy. Safe here only because no installer has ever been built.

### The window's background colour had drifted off the ground

Electron painted `#1b1e24` — the original dark slate — with a comment claiming
it matched the canvas. The ground has been `#eef0f2` since the Milanote palette
landed, so every launch opened dark and then flashed light. Now `#eef0f2`, with
a comment saying to change it alongside `--ground`.

A colour duplicated in two languages is going to drift again; it's noted rather
than solved, because the alternative is plumbing CSS into the main process for
one value.

## Deferred

- **Confirmation on ordinary card deletes** (handoff §5.5). Undo is one
  keystroke, so a card going instantly is fine. Deleting a *board* is the case
  that mattered and it is done — see "Deleting a board is armed, not instant"
  above. Nothing further is planned here.
- **Warning when deleting a board that other cards link to** (handoff open
  question 4). Currently they'd become broken links, deliberately.
- **Undo landing on a board outside the current trail** resets the breadcrumb to
  just that board, losing the walked route (handoff open question 3). Truthful,
  possibly wrong.
- **List rows clip long text** rather than wrapping — they're single-line
  inputs, as specified (handoff open question 5).
- **Auto-update.** Needs somewhere to host updates. Add only if wanted.
- **Board cards inside a column are not drop targets.** The hit-test only walks
  top-level cards, so you cannot drag a card onto a board that is sitting in a
  column. Drag it out first.
- **No "group these into a column"** gesture. Milanote has one; make a column
  and drag things in for now.
- **Clearing a card's tint** back to the default. Right now you pick a pale
  colour instead. Fine until it isn't.
