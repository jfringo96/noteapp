import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const FILE = 'file:///home/user/noteapp/board-prototype.html';
let fails = 0;
const ok = (n, c, extra='') => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (extra ? '  ->  ' + extra : '')); if (!c) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(FILE);
await page.waitForTimeout(250);

console.log('\n--- step 1: state shape ---');
const shape = await page.evaluate(() => ({
  topKeys: Object.keys(state).sort(),
  currentBoardId: state.currentBoardId,
  boardIds: Object.keys(state.boards),
  homeKeys: Object.keys(state.boards.b_home).sort(),
  cardCount: state.boards.b_home.cards.length,
  noLegacyGlobal: typeof window.board === 'undefined'
}));
ok('state has exactly {currentBoardId, boards}', JSON.stringify(shape.topKeys) === '["boards","currentBoardId"]', JSON.stringify(shape.topKeys));
ok('currentBoardId is b_home', shape.currentBoardId === 'b_home');
ok('boards is a flat map keyed by id', JSON.stringify(shape.boardIds) === '["b_home"]', JSON.stringify(shape.boardIds));
ok('board object is {id,title,cards}', JSON.stringify(shape.homeKeys) === '["cards","id","title"]', JSON.stringify(shape.homeKeys));
ok('prototype content migrated into b_home', shape.cardCount === 5, shape.cardCount + ' cards');
ok('no legacy global `board` left behind', shape.noLegacyGlobal);
ok('currentBoard() resolves through the map', await page.evaluate(() => currentBoard() === state.boards[state.currentBoardId]));
ok('top bar shows the board title', await page.locator('#title').inputValue() === 'Home');

console.log('\n--- step 1: no board holds another board\'s cards ---');
ok('every card lives in exactly one board', await page.evaluate(() => {
  const seen = new Set();
  return Object.values(state.boards).every(b => b.cards.every(c => !seen.has(c.id) && seen.add(c.id)));
}));
ok('no board object nests another board object', await page.evaluate(() =>
  Object.values(state.boards).every(b => !b.cards.some(c => c.cards || c.boards))
));

console.log('\n--- step 2: snapshots clone the whole state ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
await page.evaluate(() => applyChange(() => { currentBoard().cards[0].x += 5; }));
const snap = await page.evaluate(() => ({
  keys: Object.keys(undoStack[0]).sort(),
  hasCurrentBoardId: 'currentBoardId' in undoStack[0],
  hasBoards: 'boards' in undoStack[0],
  isNotABoard: !('cards' in undoStack[0])
}));
ok('undo entry is a full state clone', JSON.stringify(snap.keys) === '["boards","currentBoardId"]', JSON.stringify(snap.keys));
ok('snapshot includes currentBoardId', snap.hasCurrentBoardId);
ok('snapshot is state, not a bare board', snap.isNotABoard && snap.hasBoards);
ok('snapshot is a deep clone, not a live reference', await page.evaluate(() =>
  undoStack[0] !== state && undoStack[0].boards.b_home !== state.boards.b_home
));

console.log('\n--- step 2: undo across boards navigates back ---');
// Navigation UI does not exist yet (step 4). Move currentBoardId directly —
// that is exactly what navigate() will do.
await page.evaluate(() => {
  state.boards.b_two = { id: 'b_two', title: 'Second', cards: [
    { id: 'c_x', type: 'text', x: 100, y: 100, w: 200, h: 120, text: 'original' }
  ]};
  undoStack.length = 0; redoStack.length = 0;
});
await page.evaluate(() => { state.currentBoardId = 'b_two'; render(); });          // "navigate" to B
ok('navigating pushed no history', await page.evaluate(() => undoStack.length) === 0);
await page.evaluate(() => applyChange(() => { currentBoard().cards[0].text = 'edited on B'; }));
await page.evaluate(() => { state.currentBoardId = 'b_home'; render(); });         // "navigate" back to A
ok('now viewing b_home', await page.evaluate(() => state.currentBoardId) === 'b_home');
await page.keyboard.press('Control+z');
ok('undo navigated back to the board that changed', await page.evaluate(() => state.currentBoardId) === 'b_two');
ok('undo reversed the right thing', await page.evaluate(() => state.boards.b_two.cards[0].text) === 'original');
ok('the on-screen canvas followed', await page.locator('.card').count() === 1);
await page.keyboard.press('Control+Shift+z');
ok('redo re-applies and stays on that board', await page.evaluate(() =>
  state.currentBoardId === 'b_two' && state.boards.b_two.cards[0].text === 'edited on B'));

console.log('\n--- step 2: edits on other boards survive an undo on this one ---');
await page.evaluate(() => { state.currentBoardId = 'b_home'; render(); undoStack.length = 0; redoStack.length = 0; });
await page.evaluate(() => applyChange(() => { currentBoard().title = 'Renamed'; }));
await page.keyboard.press('Control+z');
ok('b_two untouched by an undo on b_home', await page.evaluate(() => state.boards.b_two.cards[0].text) === 'edited on B');
ok('b_home title restored', await page.evaluate(() => state.boards.b_home.title) === 'Home');

console.log('\n--- step 2: typing coalescing unchanged ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
const ta = page.locator('.card-text .text-field').first();
await ta.click(); await ta.press('End');
await page.keyboard.type('abc');
ok('still no history per keystroke', await page.evaluate(() => undoStack.length) === 0);
ok('edit snapshot is a full state clone too', await page.evaluate(() =>
  editSnapshot !== null && 'currentBoardId' in editSnapshot.snap && 'boards' in editSnapshot.snap));
await page.locator('#canvas').click({ position: { x: 900, y: 700 } });
ok('one entry on blur', await page.evaluate(() => undoStack.length) === 1);

console.log('\n--- no errors ---');
ok('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log('\n' + (fails === 0 ? 'ALL PASSED' : fails + ' FAILURE(S)'));
process.exit(fails ? 1 : 0);
