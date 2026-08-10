# Notes

Decisions made and things deliberately deferred. `SPEC.md` is authoritative;
this records what we chose where the spec left room, and where we knowingly
departed from it.

---

## Decisions

### Stack

Vanilla JS + ES modules + Vite, per spec Principle 1. An earlier suggestion of
React was withdrawn — the spec's reason (following the state flow without a
framework's mental model first) holds.

What the handoff's §5.3 actually asks for is **keyed reconciliation**, not a
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

This departs from a literal reading of spec Principle 4, which puts nested
boards in Phase 4. Features still land in spec order — no board cards,
breadcrumbs or switcher before Phase 4. Only the container shape comes early,
because the prototype already paid for this refactor once (commit `7fa1c1b`)
and the handoff calls it the load-bearing decision. Doing it now makes Phase 4
additive instead of a rewrite of `applyChange`, undo, export and every card
lookup.

### Images

Never inline. Cards carry `{ imageId, mime, naturalW, naturalH, alt }` — the
intrinsic dimensions live on the card so layout never waits on a blob load.

Blobs are stored as native `Blob`s in IndexedDB (no base64, so no 33% encoding
tax and no string cloning) and in R2 on the server, fetched through
`URL.createObjectURL()` into an in-memory `Map<imageId, url>`. Object URLs are
runtime state and stay out of `state`.

**On import: downscale to max edge 1280px, re-encode WebP q0.8.** A 4 MB phone
photo lands around 150–250 KB. This is a planning tool, not a photo library,
and there is no zoom to expose the loss. Two details at import time:

- Honour EXIF rotation (`createImageBitmap(file, { imageOrientation: "from-image" })`),
  or portrait phone photos land sideways.
- If an original is already smaller than its re-encode, store the original.

### Undo

Whole-state `structuredClone` snapshots, capped at 50, as both documents say.

The handoff's §5.2 worry about snapshot cost was really §5.1 in disguise — once
images are references, a snapshot is just text, coordinates and ids, and 50 of
them is single-digit MB. Keeping the simple version.

**Undo is session-scoped and does not survive a reload** (handoff open question
2). Persisting history is what would force a command log; not worth it.

Typing coalesces on **blur only**, not the spec's "or after a ~500ms pause".
The pause variant fires a history entry while the caret is still in the box,
gives several entries per editing session, and re-opens the ordering bug the
handoff describes in §2.2.

### Blob lifetime

Duplicating a card copies the `imageId`, so two cards can share a blob —
refcounting on delete is therefore wrong, and undo holding states that
reference deleted blobs makes it worse. **Never delete a blob during a
session.** Sweep unreachable ones at startup, when both history stacks are
empty and reachability is unambiguous.

### Where the spec and the prototype handoff disagreed

| | Resolution |
|---|---|
| Board card carries a `title` (spec) vs id only (handoff §1) | **Id only.** Titles come from the `index` key, so an unloaded board still renders. |
| Typing pushes on blur or a 500ms pause (spec) vs blur only (handoff §2.1) | **Blur only** — see above. |
| Export the current board (spec) vs whole state (handoff) | **Whole state.** A backup that covers one board is not a backup. Keeps the legacy migration in handoff §5.4. |
| Canvas 5000 (spec) vs 3000 (prototype) | **5000**, per spec. |
| Board creation prompts for a title (spec) vs no modals (handoff, commit `adc3335`) | **No modal** — create immediately, rename inline. Add a hover cue, since handoff §6.6 flags the gesture is not discoverable. |
| Back via `history.pushState` (spec) vs a `backStack` array (handoff §3) | **pushState**, so the phone's back gesture works. `trail` stays separate — it cannot be computed from the data. |

---

## Phase 0 — sync spike

`worker/` is the API. `spike/` is a throwaway page that exercises it; delete it
once Phase 1 starts.

### One-time setup

```sh
cd worker
npm install -g wrangler        # or npx wrangler ... below
wrangler login

wrangler kv namespace create BOARDS      # paste the printed id into wrangler.toml
wrangler r2 bucket create noteapp-images

# Generate a secret and keep a copy — you paste the same string into each device.
wrangler secret put SHARED_SECRET

wrangler deploy
```

Then deploy `spike/` to Cloudflare Pages (Workers & Pages → Create → Pages →
connect this repo, build command empty, output directory `spike`). Hosting it
rather than opening the file locally is deliberate — the phone has to reach it,
and it proves the Pages deploy works now rather than at Phase 3.

### What must pass before Phase 1

1. **PUT board** on the laptop, **GET board** on the phone — the text names the
   device and time that wrote it.
2. **GET index** lists `b_spike`.
3. **No auth** and **wrong secret** both return 401.
4. **Stale PUT** returns 409, then the forced retry returns 200.
5. **Image round-trip** shows the preview and matching byte counts.

### Deferred

- KV index updates are read-modify-write. Safe for one user with debounced
  writes; two devices saving different boards inside KV's propagation window
  could drop an index entry. The board itself is never lost and the next save
  of it repairs the index.
- CORS is `*`. Fine because the bearer secret guards the data and we never
  authenticate with cookies.
- No confirmation on destructive actions yet (handoff §5.5). Revisit at
  Phase 5 — undo is one keystroke on a laptop but there is no Ctrl+Z on touch.
- Board deletion leaves cards pointing at the deleted board as visibly broken
  links, never a throw (handoff §4). Whether to warn first is open.
