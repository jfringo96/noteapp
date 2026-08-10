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

**Day to day:** double-click `Start Board App (dev).cmd`. It launches Vite and
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
same `Documents\Board App\` folder, so there is only ever one set of notes.

## Deferred

- **Confirmation on destructive actions** (handoff §5.5). Undo is one keystroke,
  so this was defensible in the prototype. Revisit at Phase 5, especially for
  deleting a board that has cards in it.
- **Warning when deleting a board that other cards link to** (handoff open
  question 4). Currently they'd become broken links, deliberately.
- **Undo landing on a board outside the current trail** resets the breadcrumb to
  just that board, losing the walked route (handoff open question 3). Truthful,
  possibly wrong.
- **List rows clip long text** rather than wrapping — they're single-line
  inputs, as specified (handoff open question 5).
- **Auto-update.** Needs somewhere to host updates. Add only if wanted.
- **Clearing a card's tint** back to the default. Right now you pick a pale
  colour instead. Fine until it isn't.
- **The card-type picker on double-click.** `SPEC.md` asks for a small picker at
  the click point. In Phase 1 there is only one card type, so double-click
  creates a text card directly — a picker offering one option is pure friction.
  The picker arrives in Phase 2, when there is a choice to make.
