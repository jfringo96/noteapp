# Notes

Decisions made and things deliberately deferred.

`SPEC.md` was written for a browser app synced through Cloudflare. **That model
was abandoned on 2026-08-10** in favour of a standalone desktop application —
see "Shape of the app" below. Where this file and `SPEC.md` disagree, this file
is the current one; `SPEC.md` still governs everything the change did not touch
(the state model, interactions, card types, undo, the phase ordering).

---

## Shape of the app

**A standalone desktop application. No server, no accounts, no sync.**

The owner's actual use is: ideate at the desk, then in the field look at a
gallery of images for inspiration. That is not two devices sharing a document —
it is one device that occasionally emits a read-only artefact. Once the phone
only receives a gallery, everything that existed to serve two-way sync stops
earning its place.

### Why not a browser app

Browser storage is evictable and the owner cannot recover from a silent wipe
without help. A file on disk can be copied, inspected, and backed up by any
ordinary means.

### What this removed

The Cloudflare Worker, both KV namespaces, the shared secret, bidirectional
sync, the 409 conflict prompt, "Reload theirs / Keep mine", the offline
fallback, PWA installability, and the iOS 7-day storage eviction problem.

`worker/` and `spike/` are **superseded and no longer part of the build.** They
are left in the tree for now rather than deleted; git history has them either
way. The deployed Worker and Pages project still exist on Cloudflare, cost
nothing, and can be torn down whenever.

### Storage on disk

Default `Documents\Board App\`:

```
Board App/
  boards.json        all boards, human-readable
  images/            one file per image, content-typed extension
```

Backup is "put that folder in OneDrive" — version history and off-machine
copies for free, nothing to configure. The format is deliberately inspectable:
if the app breaks, the notes are still text and the images are still images.

Export/Import JSON stays as a feature per `SPEC.md`, but it is an escape hatch,
not the backup strategy.

### The phone gallery

Desktop writes a **single self-contained HTML file** with images embedded, which
the owner AirDrops to the phone. Fully offline, fully private, nothing on the
internet. Re-exported when the board changes.

The size arithmetic works because images are already downscaled on import —
roughly 200 KB each, so thirty images is about 6 MB. Fine for AirDrop.

---

## Decisions

### Operating constraint: no terminal, ever, to use the app

Stated explicitly by the owner. The finished app has to keep working with no
command line and no help. Going standalone satisfies most of this by
construction — there is no login, no token, and no storage that expires.

Two residual costs, both accepted:

- Windows SmartScreen warns "unknown publisher" on first install. One click
  through *More info → Run anyway*. Code signing is not worth it for one user.
- Updates mean running a new installer. The data folder is untouched by this.
  Auto-update needs somewhere to host updates; add only if wanted.

Changing the app still needs a developer environment. Using it never does.

### Stack

**Electron, with a Vite + vanilla JS renderer.**

Vanilla JS per `SPEC.md` Principle 1 — an earlier suggestion of React was
withdrawn, and Electron does not disturb that, since the renderer is an ordinary
web page.

Electron over Tauri because Tauri needs a Rust toolchain installed before it can
build anything, and Electron needs only the Node already present. A 200 MB app
is irrelevant for a personal tool.

What `PROTOTYPE-HANDOFF.md` §5.3 asks for is **keyed reconciliation**, not a
framework: the card layer diffs `cards` against a `Map<id, element>` and reuses
elements rather than rebuilding them. Full rebuilds are what destroy focus and
swallow gesture targets. Everything else stays imperative.

### State shape from Phase 1

Phase 1 uses the flat multi-board shape with exactly one board in it:

```js
let state = {
  currentBoardId: "b_home",
  boards: { b_home: { id: "b_home", title: "Home", lastModified: 0, cards: [] } }
};
```

This departs from a literal reading of `SPEC.md` Principle 4, which puts nested
boards in Phase 4. Features still land in spec order — no board cards,
breadcrumbs or switcher before Phase 4. Only the container shape comes early,
because the prototype already paid for this refactor once (commit `7fa1c1b`)
and the handoff calls it the load-bearing decision. Doing it now makes Phase 4
additive instead of a rewrite of `applyChange`, undo, export and every card
lookup.

### Images

Never inline in `boards.json`. Cards carry
`{ imageId, mime, naturalW, naturalH, alt }` — the intrinsic dimensions live on
the card so layout never waits on a file read.

Files on disk under `images/`, loaded into an in-memory `Map<imageId, objectUrl>`
for rendering. Object URLs are runtime state and stay out of `state`.

**On import: downscale to max edge 1280px, re-encode WebP q0.8.** A 4 MB phone
photo lands around 150–250 KB. This is a planning tool, not a photo library, and
there is no zoom to expose the loss. Two details at import time:

- Honour EXIF rotation (`createImageBitmap(file, { imageOrientation: "from-image" })`),
  or portrait photos land sideways.
- If an original is already smaller than its re-encode, store the original.

### Undo

Whole-state `structuredClone` snapshots, capped at 50, as both documents say.

The handoff's §5.2 worry about snapshot cost was really §5.1 in disguise — once
images are references, a snapshot is just text, coordinates and ids, and 50 of
them is single-digit MB. Keeping the simple version.

**Undo is session-scoped and does not survive a restart** (handoff open question
2). Persisting history is what would force a command log; not worth it.

Typing coalesces on **blur only**, not the spec's "or after a ~500ms pause". The
pause variant fires a history entry while the caret is still in the box, gives
several entries per editing session, and re-opens the ordering bug the handoff
describes in §2.2.

### Image lifetime

Duplicating a card copies the `imageId`, so two cards can share a file —
refcounting on delete is therefore wrong, and undo holding states that reference
deleted images makes it worse. **Never delete an image file during a session.**
Sweep unreferenced ones at startup, when both history stacks are empty and
reachability is unambiguous.

### Where `SPEC.md` and `PROTOTYPE-HANDOFF.md` disagreed

Resolved before the desktop change; all still stand.

| | Resolution |
|---|---|
| Board card carries a `title` (spec) vs id only (handoff §1) | **Id only.** Titles are read from the target board, so renaming updates every card pointing at it. |
| Typing pushes on blur or a 500ms pause (spec) vs blur only (handoff §2.1) | **Blur only** — see above. |
| Export the current board (spec) vs whole state (handoff) | **Whole state.** A backup covering one board is not a backup. Keeps the legacy migration in handoff §5.4. |
| Canvas 5000 (spec) vs 3000 (prototype) | **5000**, per spec. |
| Board creation prompts for a title (spec) vs no modals (handoff, commit `adc3335`) | **No modal** — create immediately, rename inline. Add a hover cue, since handoff §6.6 flags the gesture is not discoverable. |
| Back via `history.pushState` (spec) vs a `backStack` array (handoff §3) | **`backStack`** now. `pushState` was chosen to make the phone's back gesture work, and there is no phone any more. `trail` stays separate — it cannot be computed from the data. |

---

## Revised phases

`SPEC.md`'s Phase 0 and Phase 3 were both about the server and are gone.

| | |
|---|---|
| **Phase 1** | Electron shell, scrollable canvas, text cards, drag, resize, select, delete, create. One state object, `applyChange()`, undo/redo, save to `boards.json`. |
| **Phase 2** | List, image and swatch cards. Image files on disk. |
| **Phase 3** | Gallery export — the self-contained HTML file. |
| **Phase 4** | Nested boards: board cards, breadcrumbs, back, board switcher. |
| **Phase 5** | Polish, keyboard shortcuts, empty states, packaging the installer. |

---

## Superseded: Phase 0 sync spike

Kept for the record. The Worker at
`https://noteapp-api.photostoneman.workers.dev` and the spike page at
`https://noteapp-spike.pages.dev` were built, deployed and verified: auth
guards, board round-trip, the 409 conflict guard and its force escape, body
validation, and image upload/dedupe/download with byte-identical results.

Two traps hit there, worth remembering if anything Cloudflare ever comes back:

- Piping a secret from PowerShell appends a newline, producing an intermittent
  401. Use `printf '%s'` from bash.
- Changing a Worker secret does not restart live isolates, so auth flaps between
  200 and 401 until they recycle. A `wrangler deploy` forces new isolates.
