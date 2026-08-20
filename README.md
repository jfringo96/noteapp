# Noteapp

A personal, single-user Milanote-style board app. Cards on a large canvas, drag
to arrange, boards inside boards. It runs as a standalone desktop application
and keeps everything in an ordinary folder on disk — no server, no account, no
sync, nothing to sign into.

Built for one person on one machine. The point is a place to ideate at the desk
and then walk out with a folder of inspiration pictures on a phone.

---

## Where this is up to

**The app works.** Everything in the original plan is built: the canvas, all
seven card types, nested boards, columns, undo/redo, saving to disk, and the
picture export.

The stages from here:

1. **Refining — where we are now.** The app is fine as it is. What's left is
   polish and nice-to-haves: smoothing off anything that irritates in daily use
   and adding the small things that would make it nicer, not the things it
   needs to function. Collections, the File menu and the Map came out of this
   stage.
2. **Building the final app.** Producing a proper installed copy — `npm run
   pack` — rather than running it from this folder.
3. **Testing it.** Living in the installed version properly, on real boards,
   and finding what breaks.
4. **Done.** No feature work after that unless something is actually wrong.

Nothing here is urgent. Anything that isn't worth doing is worth deciding not
to do and writing down in `NOTES.md`.

---

## The gestures, in one place

| | |
|---|---|
| **Right-drag** | Move the board around, from anywhere |
| **Left-drag** empty space | Draw a selection box over several cards |
| **Double-click** empty space | Add a card here |
| **Drag from the left rail** | Place a card exactly where you drop it |
| **Double-click** a board tile | Open that board |
| **Ctrl+Z / Ctrl+Shift+Z** | Undo / redo |

## Using it day to day

Double-click **`Start Noteapp (dev).cmd`**. It starts everything and opens the
window. Leave the black console window open while you use the app; closing the
app window stops both.

First run installs dependencies on its own and takes a minute or two.

You never need a terminal to *use* Noteapp. Changing it needs a developer
setup; using it never does.

## Collections, boards, and Home

A **collection** is everything: the whole set of boards you're working in. Open
one at a time. Inside it, **Home** is the board everything hangs off — it's
always called Home and can't be renamed or deleted. Every other board nests
underneath, as deep as you like.

The top bar tells you where you are — `Home › Macro › Inspo` — and every part of
it is clickable.

**Map**, next to File, opens a nested list of every board in the collection, so
you can see the whole shape of it and jump anywhere. Clicking a board there also
sets your breadcrumbs to the route it just showed you.

Boards can link to each other freely, including in circles, so the Map plays it
straight: a board linked from two places shows up in both, a branch that loops
back on itself stops and says so, and any board nothing links to gets its own
section at the bottom rather than quietly vanishing.

**Drag a board out of the Map** and drop it on any board to put a tile there.
That's how an unlinked board finds a home again.

## Deleting

**Deleting a board tile deletes the board.** A tile isn't a shortcut or a copy —
it's where that board lives. Delete it from the inspector, from the Map, or with
the Delete key; all three do the same thing and all three ask first.

It takes everything on that board with it — notes, lists, links, pictures — and
removes every other tile pointing at it, wherever those are.

If there are boards nested inside, you get a list and tick which should go too,
with Select all and Select none. Nothing starts ticked. **Anything you leave
stays in the Map, unlinked**, ready to be dragged back onto a board — and that's
the only way a board ever ends up unlinked.

Ctrl+Z undoes any of it. Pictures are only deleted from disk when nothing else
is using them, so a photo on two boards survives losing one of them.

## Your collections live here

```
Documents\Noteapp\
  My Boards\
    collection.json      every board in it, plain readable JSON
    images\
      img_7fq2xk9.webp   your pictures, ordinary image files
  Iceland 2027\
    collection.json
    images\
```

Each collection is a **folder**, which means it's self-contained — copy that one
folder and the boards and their pictures go together. Renaming a collection is
just renaming the folder.

Inside a collection, a picture used on five boards is still **one file**. It's
only ever stored once.

Back it up by putting `Documents\Noteapp\` in OneDrive — version history and an
off-machine copy for free. If Noteapp ever breaks, nothing is trapped inside it.
The **Folder** button opens the collection you're in.

## Saving, and the File menu

**There is no Save button, on purpose.** Your work is written to disk as you go,
and the collection you had open last opens by itself next time you start.

**File** has four things:

- **New collection…** — a fresh, empty one.
- **Open collection…** — swap to a different one.
- **Save as…** — copy this collection, pictures and all, somewhere new and carry
  on working *there*. It moves where your work is saved from that point on.
- **Open the folder on disk.**

Below those, any other collection you already have, so you can hop straight to
it.

Want a frozen snapshot to come back to? Copy the collection's folder in
Explorer. That works precisely because a collection is just a folder.

(Older versions kept boards in `Documents\Board App\`, then loose in
`Documents\Noteapp\`. Both are moved into place for you, once, on first start.)

## Pictures

**Image** in the left rail slides out the collection's **gallery** — every
picture it holds, whether a board is using it or not. It stays open while you
work, so you can place several in a row; press Image again to close it.

**Click a picture** to drop it in the middle of the view, or **drag it** onto the
board to put it exactly where you want.

Add pictures with **Add pictures…**, or just drop them straight onto a board;
either way they end up in the gallery. Copying a picture from anywhere and
pasting it works too.

A picture used on five boards is still one file.

Select a picture on a board and the rail offers two deletes: **Delete** takes
that copy off that board and leaves the picture in the gallery, and **Delete
all** removes it from every board and from the collection. Delete all asks by
turning into "Sure?" — click it again to confirm.

Deleting from the gallery itself does the same as Delete all, and tells you
which boards are using it first. Ctrl+Z undoes any of it.

*Dragging an image out of a web page won't work: that hands over a web address,
and Noteapp never goes online. Copy the picture and paste it instead.*

## Drawing

**Draw** in the rail offers a **line** or an **arrow**. Pick one and drag on the
board to draw it point to point. Click a line to select it — the two ends become
handles you can drag — and the rail offers its colour, thickness, a dashed
option, whether it has an arrowhead, and delete.

Lines aren't attached to anything. They're strokes on the board, not connectors
between cards.

## Getting around a board

**Right-drag anywhere** — over a card or over empty space — to move the board
around.

**Left-drag** empty space to draw a selection box — everything it touches gets
outlined. Drag the group to move it all at once, drop it onto a board to file it
there, or use Delete in the left rail to remove the lot. Clicking empty space
deselects, and double-clicking still opens the card picker.

## Adding cards

Click anything in the left rail to drop it in the middle of the view, or **drag
it out onto the board** to choose where it lands. Double-clicking empty canvas
works too.

A **column** holds text, lists, pictures, links, places and boards — but not
another column, and not a line. A line is drawn between two points on the board,
so inside a stack it would have nothing to be drawn between.

## Sending pictures to your phone

**Export** writes every picture on the current board into a folder of JPEGs,
numbered in reading order — top to bottom, then left to right. Export into
OneDrive, open the folder on the phone, save them to the gallery. From then on
they're normal photos: swipe, pinch, fully offline, no app needed.

Exports never overwrite each other — "Iceland", then "Iceland 2".

---

## Making an installed copy

```
npm run pack
```

Builds a Windows installer into `release/`. Windows will warn "unknown
publisher" the first time — *More info → Run anyway*. Code signing isn't worth
it for one user.

The installed copy and the dev copy read the same `Documents\Noteapp\` folder,
so there's only ever one set of notes.

## How it's built

Vanilla JS with ES modules, Vite, plain CSS, in an Electron shell. No
framework, on purpose — the state flow should be followable without learning
someone else's mental model first.

```
electron/          the window, and everything that touches disk
src/
  store.js         the single state object and applyChange() — read this first
  canvas.js        the board: rendering, panning, the marquee, drawing lines
  cards/           one file per card type, plus line.js for strokes
  boards.js        boards, the Map tree, and what deleting one does
  collection.js    opening, creating and saving-as collections
  gallery.js       the collection's pictures; gallerypanel.js is its drawer
  gestures.js      dragging and resizing, including dragging a group
  drop.js          where a dragged card would land
  inspector.js     the left rail
prototype-tests/   frozen record of the Phase 1 prototype
```

The whole document is one plain object, every mutation goes through one
`applyChange()`, and that's what makes undo/redo simple.

## The other documents

- **`SPEC.md`** — what to build and, just as importantly, what not to.
- **`NOTES.md`** — why it's built that way. Decisions and their reasons, plus
  everything deliberately deferred. Read this before changing anything that
  looks arbitrary; it usually isn't.
- **`PROTOTYPE-HANDOFF.md`** — what the original prototype established. A
  historical record; stale wherever it discusses saving to disk.
- **`board-prototype.html`** — the prototype itself. Reference, not foundation.
