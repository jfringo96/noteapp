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
   needs to function.
2. **Building the final app.** Producing a proper installed copy — `npm run
   pack` — rather than running it from this folder.
3. **Testing it.** Living in the installed version properly, on real boards,
   and finding what breaks.
4. **Done.** No feature work after that unless something is actually wrong.

Nothing here is urgent. Anything that isn't worth doing is worth deciding not
to do and writing down in `NOTES.md`.

---

## Using it day to day

Double-click **`Start Noteapp (dev).cmd`**. It starts everything and opens the
window. Leave the black console window open while you use the app; closing the
app window stops both.

First run installs dependencies on its own and takes a minute or two.

You never need a terminal to *use* Noteapp. Changing it needs a developer
setup; using it never does.

## Your boards live here

```
Documents\Noteapp\
  boards.json          every board, plain readable JSON
  images\
    img_7fq2xk9.webp   your pictures, ordinary image files
```

Open it, copy it, back it up like any other folder. Put it in OneDrive and
backup is solved — version history and an off-machine copy for free.

If Noteapp ever breaks, nothing is trapped inside it. The **Folder** button in
the app opens this folder.

(Boards made before the rename lived in `Documents\Board App\`. The app moves
that folder across by itself, once, the first time it starts.)

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
electron/     the window, and everything that touches disk
src/          the app itself
  cards/      one file per card type
  store.js    the single state object and applyChange()
prototype-tests/  frozen record of the Phase 1 prototype
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
