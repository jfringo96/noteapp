# Prototype behaviour suites

176 assertions recording how `board-prototype.html` behaves. They drive the
prototype's module globals (`state`, `currentBoard()`, `undoStack`) directly,
so they will **not** run against the real app — keep them as an executable
record of Phase 1 behaviour, not as a suite to port.

Each file hardcodes two paths at the top: the Chromium binary and the location
of `board-prototype.html`. Adjust both for your machine, then:

    npm i -D playwright
    node prototype-tests/test.mjs
