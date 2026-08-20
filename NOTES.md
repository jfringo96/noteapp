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

### A collection is a folder, not a file (2026-08-20)

Collections are the layer above boards — the whole document, with Home at its
root. The question was what one is on disk.

Considered a single `.json` file that could live anywhere, with every picture
staying in one shared `images/` pool. Rejected. Two things killed it:

- **No collection would be complete on its own.** A file copied to a USB stick
  opens with every picture missing, because the pictures never came with it.
- **The image sweep becomes unsafe.** Deleting unreferenced pictures at startup
  is only sound if "unreferenced" can be decided. With a shared pool it would
  mean "unreferenced by every collection that exists" — and the first
  collection the app had never been shown would lose all of its images. The
  fallback was to stop cleaning up at all.

A folder makes both go away: copy it and the whole thing travels, and the sweep
is correct again because its scope is the collection it belongs to.

The worry that prompted the question was duplicate pictures, and it is worth
being clear about what was never at risk: **inside** a collection, one picture
on five boards is one file. Cards hold an `imageId` and the file is stored once.
Duplication only happens across two different collections, which are separate
documents by definition. One extra copy in that case beats every collection
being incomplete.

The name of a collection is its folder name, deliberately. Storing it inside
the file as well would mean two names that could disagree, and renaming would
need the app. This way it's Explorer.

### There is no Save, and Save As is not a snapshot

Work has always saved continuously, and a File menu is not a reason to stop.
So the menu changes *where* the writes go rather than whether they happen:
Save As copies the collection somewhere new and carries on working there.

That's the document-app convention and it is worth stating out loud, because
the other reading — Save As writes a copy and leaves you in the original — is
what "save a state" sounds like it means. Anyone wanting a frozen snapshot
copies the folder in Explorer, which works precisely because a collection is a
folder.

Save As does not reload anything. The document on screen is already the one
being saved; only its destination changed. Reloading would throw away the undo
history and flicker the canvas to redraw the identical thing.

### Home is fixed, and the trail is rooted at it

Every collection has a Home board. It cannot be renamed or deleted, because the
Map draws outward from it and every breadcrumb trail starts there — a collection
with no root leaves the Map with nothing to hang boards off.

The rule is enforced when a document *loads*, not merely when one is created.
The file is deliberately readable, which makes it deliberately editable, and a
document from before Home existed is exactly what the current collection was.
A repaired document is written straight back rather than waiting for the next
edit, so the file agrees with the screen even if the app is killed rather than
closed.

Rooting the trail at Home is a separate thing from the trail being a walked
route, and both are true: Home is a fixed root, the crumbs after it are only
boards actually walked through. Landing somewhere by undo or a Map jump gives
`Home / Wherever` rather than a lone crumb with no context.

### The Map draws a tree over a graph

Boards nest by reference, so the board structure is a graph — one board can be
linked from several places, and two can point at each other. A nested list has
to make a tree of that without lying:

- A board linked twice appears twice. It really is in both places.
- A branch that loops back to a board already above it in the same line stops
  there and is labelled, rather than recursing until the stack gives out.
- Depth is capped as a backstop.

Each row carries the path the Map walked to reach it, which is the nice part:
clicking a board sets the breadcrumbs to the route the Map just showed you,
instead of throwing away a route it was holding all along. That's what the
`"path"` navigation mode is for.

Boards nothing links to get a section of their own at the bottom. Deleting a
board card leaves the board it pointed at alive and deliberately so — without
that section, those boards would exist with no way to reach them.

### Deleting a board now cascades, on purpose (2026-08-20)

This reverses "Deleting never cascades", recorded above. That rule said a
deleted board left its tiles behind as visible "Missing board" links, on the
grounds that showing the breakage beat hiding it. In use it just meant tidying
up by hand afterwards, in places you had to go and find. Deleting a board now
removes every tile pointing at it, wherever they are.

What a board delete does, exactly:

- **Everything on it goes** — notes, lists, links, places, columns, and the
  image *cards*.
- **Every tile pointing at it goes**, on any board, including inside columns.
- **Nested boards go only if named.** They are separate documents that happen
  to be linked from here, so the dialog asks. Anything left out survives
  unlinked and turns up in the Map.

The old rule is still right about one thing, so `board.js` keeps rendering a
"Missing board" tile: a hand-edited file can still point at a board that isn't
there, and that has to draw rather than throw.

### Image files are still swept at startup, not at the moment of deletion

The rule wanted was "delete the file if this was the only copy of that picture,
keep it if the picture is used elsewhere". That is exactly what `sweepImages`
already does — it keeps anything referenced anywhere in the collection.

Doing it eagerly, the moment a board is deleted, would break undo: the card
would come back and the photograph would not. So the space comes back on the
next launch instead, which is the one moment the history stacks are empty and
"unreferenced" is a stable idea. Same outcome, no window where Ctrl+Z lies.

### One modal, and only for destroying something

The no-modal rule held everywhere, including for deleting a board, which used a
button that armed itself on the first click and disarmed after four seconds.

It stopped holding when deleting a board had to ask *which* of the boards inside
it should go too. That is a question with a list attached, and a list is not
something a button can arm into. Once one of the two deletions was a dialog,
having the other be a self-relabelling button meant two different answers to the
same question, so both are dialogs now.

Focus lands on Cancel, never on the destructive button, so a stray Enter
arriving just as the dialog opens does nothing.

### A tile IS the board

Briefly there were two named actions — Remove, which took away the tile and
left the board alive in the Map, and Delete, which ended the board. Wrong.
Deleting a board tile deletes the board.

The distinction only looks reasonable if you think of a tile as a shortcut to a
board. It isn't: it is where that board *is*. Being able to take one away and
have the board persist somewhere else meant deleting something never actually
deleted it, which is the opposite of what the word does everywhere else.

So there is one rule with three ways in — the × in the inspector, the × in the
Map, the Delete key on a selected tile — sharing `deleteboard.js` so they can't
drift. The **only** thing that leaves a board alive but unlinked is choosing to
keep it when its parent is deleted.

Two tiles still have to be removable without deleting anything, and both are
about a board that can't be deleted rather than shouldn't: a tile pointing at
Home, and a tile left by a hand-edited file whose board is already gone. Those
offer "Remove tile" and say why.

### Boards drag out of the Map to be re-linked

This is what makes it safe to leave boards unlinked after a deletion. Without a
way back, "it stays in the Map" would be a slow way of saying "it's gone" —
the Map could show it, and there would be nothing you could do with it.

Dragging a row out of the Map and dropping it on a canvas points a NEW tile at
that board. Nesting is by reference, so this only ever adds a card: the board
is untouched, and every other tile pointing at it carries on working. That is
also why the same board can be dropped in several places.

HTML5 drag-and-drop here rather than the pointer-based gestures the canvas uses
internally, because this drag starts in a floating panel and ends on the canvas,
and the file-drop target it lands on already speaks that protocol.

### The gallery: a picture belongs to the collection, not to a board

Before this, an image existed only as a card. A picture nothing pointed at was
rubbish, and the startup sweep deleted it. That is a coherent design and it is
the wrong one: it means you cannot import a set of photographs and place them
later, and taking a picture off a board destroys it.

So the collection has a gallery — every picture it holds, whether a board uses
one or not. The sweep's question changes from "does a card use this file?" to
"is this file in the gallery?", and removing a picture from the gallery becomes
the only thing that makes a file disposable.

It lives in the document rather than being read off the images folder, because a
picture needs its mime type and natural size to become a card and a folder
listing knows neither.

Deleting from the gallery cascades to the boards using it, the same way deleting
a board cascades to its tiles, and for the same reason. It says which boards
first — but only when there are any. Asking about a picture nothing is using is
asking for the sake of it.

### Adopting loose files, exactly once

The upgrade has a trap in it. At the moment a collection gains a gallery there
can be photographs on disk that no board mentions — pictures taken off a board
before the gallery existed, not yet swept. Building the gallery only from cards
would leave them unlisted, and the sweep would delete them minutes later. The
change meant to stop pictures being thrown away would have thrown some away.

So on the load that first creates a gallery, every readable file in the images
folder is adopted into it, dimensions measured by decoding each one. Before the
sweep, or there would be nothing left to adopt.

**Only on that load.** `galleryWasCreated()` is true exactly when the document
had no `gallery` key at all — not when it has an empty one. On any later launch
a file the gallery does not list is a picture that was deliberately deleted and
is waiting to be swept, and adopting it would bring it back from the dead.

### Hiding the drag source cancels the drag

The gallery started as a sheet over the middle of the screen, and dragging a
picture out of it did not work at all. The panel was covering the board, so
`dragstart` closed it — and closing it removed the element being dragged, which
Chromium treats as the drag being cancelled. The gesture died on the frame it
started.

Any panel you have to get out of the way before you can drop something can
never be dragged from. So the gallery is a drawer beside the rail instead: it
slides out over the left of the board, sits next to what you are dropping onto,
and simply stays put. The layout was also what was asked for, but it is the
only version that works.

It stays open while you place several pictures, which is what you are usually
doing, and the rail's Image button toggles it shut again.

One consequence worth remembering: the drawer covers the left of the scroller,
so "the middle of the view" is no longer the middle of the scroller. Clicking a
picture asks the drawer how wide it is and centres on what is actually visible.

### Everything dropped on the canvas centres on the pointer

Dropped image files were the exception: the drop point became the card's
top-left corner, which put every photo down and to the right of where it was
aimed by half a card — 140px for a 280px image, which reads as the app being
slightly wrong rather than as a rule you could learn.

Board tiles, gallery pictures and card types dragged from the rail all centred
already. Now files do too, and several at once fan out from the drop rather
than stacking exactly on it.

### Dragging replaces clicking where the position matters

Three things are dragged now that were not: a card type out of the left rail, a
board out of the Map, and a picture out of the gallery. All three used to be a
click that put something in the middle of the view.

Clicking still does that, because it is right when you don't care where the
thing lands. Dragging is for when you do — and for the gallery it is the only
gesture, since a picture you are placing is one you have an opinion about.

All three use HTML5 drag-and-drop rather than the pointer-based gestures the
canvas uses internally, because all three start outside the canvas — in a rail
or a floating panel — and the canvas already speaks that protocol for file
drops.

### An image dragged from a web page is a URL, not a picture

Copying an image and pasting it works: the clipboard carries the bitmap, and
nothing goes online. Dragging one out of a browser does not — what arrives is a
`text/uri-list`, and turning that into a picture means fetching it.

The app makes no outbound requests, which is a stated principle and the reason
places and links open in the real browser rather than being previewed. So the
drop says so and points at paste instead, rather than failing silently or
quietly becoming the first thing here that goes online.

### A new board starts nameless

It used to arrive called "Untitled board" with the text selected, so the first
thing you saw was a block of blue to type over. Now the field is empty with the
caret in it, and "Untitled board" is only applied on blur if nothing was typed.

The placeholder says "Untitled board" too, so what you will get if you walk away
is on screen before you walk away.

### Two ways to delete a picture, without leaving the board

Selecting a picture puts both in the rail:

- **Delete** takes this copy off this board. The picture stays in the gallery.
- **Delete all** removes it from every board, out of the gallery, and — at the
  next launch — off the disk.

"Delete all" is **armed**, not modal: the first click turns it into "Sure?", the
second does it, and it disarms itself after a few seconds. The rule elsewhere is
that a dialog is right when the answer needs a list attached — which boards go
too, which nested boards go too. Here the question really is just "sure?", and a
second click on the same button answers it without anything jumping in front of
the board you are looking at. The same pattern the board delete used before it
grew a checklist, kept where it still fits.

The file still goes at the next restart rather than immediately, for the reason
it always has: undo has to be able to bring the card back with its photograph
still there. The status message says so rather than implying the disk is already
clear.

### The gallery grid was stretching its rows

Rows had a tile-sized gap between them. Not spacing: `.gallery-grid` is a flex
child filling the drawer, and a grid container with leftover height and the
default `align-content: stretch` shares that height out among its auto-sized
rows. Five pictures in a tall drawer meant a lot of leftover height.

`align-content: start` and the rows sit where they should. Worth remembering
for any grid that fills a flex column.

### The drawer stays live, without rebuilding on every keystroke

A picture dropped or pasted onto a board goes into the gallery, and the open
drawer has to show it. The obvious fix — rebuild alongside the rest of the
chrome — rebuilds every `<img>` on every state change, which flickers, and
would rebuild mid-drag and cancel the drag exactly the way hiding the panel used
to.

So it compares the list of picture ids it is currently showing against the
current one and only rebuilds when they differ. That is true precisely when a
picture is added or deleted, and false while you are typing on a card.

## Deferred

- **Confirmation on ordinary card deletes** (handoff §5.5). Undo is one
  keystroke, so a card going instantly is fine. Deleting a *board* is the case
  that mattered and it is done — see "Deleting a board is armed, not instant"
  above. Nothing further is planned here.
- ~~Warning when deleting a board that other cards link to.~~ Answered: the
  tiles are deleted along with the board, so there is nothing to warn about.
  See "Deleting a board now cascades" above.
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
