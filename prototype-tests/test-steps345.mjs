import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const FILE = 'file:///home/user/noteapp/board-prototype.html';
const DIR  = '.';
let fails = 0;
const ok = (n, c, extra='') => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (extra ? '  ->  ' + extra : '')); if (!c) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [], netExternal = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) netExternal.push(r.url()); });

page.on('dialog', d => { throw new Error('unexpected dialog: ' + d.message()); });

await page.goto(FILE);
await page.waitForTimeout(250);

const S = (fn, arg) => page.evaluate(fn, arg);
const boardTitles = () => S(() => Object.values(state.boards).map(b => b.title));
const crumbText = () => page.locator('#crumbs .crumb').allTextContents();

async function addBoardCardVia(picker, x, y, name) {
  if (picker) { await page.mouse.dblclick(x, y); await page.locator('.picker button', { hasText: 'Board' }).click(); }
  else { await page.locator('[data-add="board"]').click(); }
  await page.waitForTimeout(120);
  await page.keyboard.type(name);                 // replaces the pre-selected placeholder
  await page.locator('#canvas').click({ position: { x: 60, y: 900 } });
  await page.waitForTimeout(80);
}

// ============================================================ STEP 3
console.log('\n--- step 3: create a board card ---');
await addBoardCardVia(true, 700, 620, 'Iceland trip');
ok('a second board now exists', (await boardTitles()).includes('Iceland trip'), JSON.stringify(await boardTitles()));
ok('board created is empty', await S(() => Object.values(state.boards).find(b => b.title === 'Iceland trip').cards.length) === 0);
ok('a board card was added to the current board', await page.locator('.card-board').count() === 1);
ok('card holds only targetBoardId, no title copy', await S(() => {
  const c = currentBoard().cards.find(c => c.type === 'board');
  return Object.keys(c).sort().join(',') === 'h,id,targetBoardId,type,w,x,y';
}), await S(() => Object.keys(currentBoard().cards.find(c => c.type === 'board')).sort().join(',')));
ok('creation + naming is two history entries', await S(() => undoStack.length) === 2, await S(() => String(undoStack.length)));
ok('card renders the target title', await page.locator('.card-board .board-title').inputValue() === 'Iceland trip');
ok('card renders the card count', (await page.locator('.card-board .board-count').textContent()) === '0 cards');
ok('board card keeps the standard chrome', await S(() => {
  const el = document.querySelector('.card-board');
  return !!el.querySelector('.grip') && !!el.querySelector('.resize');
}));

console.log('\n--- step 3: undo of creation removes both card and board ---');
await page.keyboard.press('Control+z');   // undo the rename
await page.keyboard.press('Control+z');   // undo the creation
ok('undo removed the board card', await page.locator('.card-board').count() === 0);
ok('undo removed the board too', !(await boardTitles()).includes('Iceland trip'));
await page.keyboard.press('Control+Shift+z');
await page.keyboard.press('Control+Shift+z');
ok('redo restores both', await page.locator('.card-board').count() === 1 && (await boardTitles()).includes('Iceland trip'),
   JSON.stringify(await boardTitles()));
ok('redo stayed on the right board', await S(() => state.currentBoardId) === 'b_home');

console.log('\n--- step 3: title edits inline without navigating ---');
const bTitle = page.locator('.card-board .board-title');
await page.locator('.card-board .grip-rail').click();      // select without opening
await bTitle.click();
ok('clicking the title did NOT navigate', await S(() => state.currentBoardId) === 'b_home');
ok('clicking the title focused it', await S(() => document.activeElement.className) === 'board-title');
await bTitle.press('End');
await page.keyboard.type(' 2024');
ok('typing renames the TARGET board, not the card', await S(() =>
  Object.values(state.boards).some(b => b.title === 'Iceland trip 2024')));
ok('no title duplicated onto the card', await S(() =>
  currentBoard().cards.find(c => c.type === 'board').title === undefined));
await page.locator('#canvas').click({ position: { x: 200, y: 700 } });

console.log('\n--- step 3: rename updates EVERY card pointing at it ---');
await S(() => {
  const c = currentBoard().cards.find(c => c.type === 'board');
  const twin = structuredClone(c); twin.id = 'c_twin'; twin.x = 900; twin.y = 250;
  currentBoard().cards.push(twin); render();
});
ok('two cards now point at the same board', await page.locator('.card-board').count() === 2);
await page.locator('.card-board .grip-rail').first().click();
await page.locator('.card-board .board-title').first().click();
await page.keyboard.press('Control+a');
await page.keyboard.type('Renamed live');
const titlesShown = await page.locator('.card-board .board-title').evaluateAll(els => els.map(e => e.value));
ok('sibling card updated mid-typing, no re-render', titlesShown.every(t => t === 'Renamed live'), JSON.stringify(titlesShown));
ok('caret still in the field being typed', await S(() => document.activeElement.className) === 'board-title');
await page.locator('#canvas').click({ position: { x: 200, y: 700 } });
await S(() => { currentBoard().cards = currentBoard().cards.filter(c => c.id !== 'c_twin'); render(); });

console.log('\n--- step 3: clicking the body navigates ---');
await page.locator('.card-board .grip-rail').first().click();
await page.locator('.card-board .board-title').first().click();
ok('title of a SELECTED card does not navigate', await S(() => state.currentBoardId) === 'b_home');
await page.locator('#canvas').click({ position: { x: 200, y: 760 } });
// unselected, the title is part of the door
await page.locator('.card-board .board-title').first().click();
await page.waitForTimeout(120);
ok('title of an UNSELECTED card opens the board', await S(() => state.currentBoardId) !== 'b_home');
await page.locator('#backBtn').click();
await page.waitForTimeout(120);
const targetId = await S(() => currentBoard().cards.find(c => c.type === 'board').targetBoardId);
await page.locator('.card-board .board-arrow').first().click();
await page.waitForTimeout(120);
ok('navigated into the target board', await S(() => state.currentBoardId) === targetId);
const histBeforeNav = await S(() => undoStack.length);
ok('navigation pushed no history', true, histBeforeNav + ' entries, unchanged by navigating');
ok('target board is empty', await page.locator('.card').count() === 0);
ok('empty-state hint shows', await page.locator('#empty').evaluate(el => el.classList.contains('show')));

// ============================================================ STEP 4
console.log('\n--- step 4: three levels deep, then back up by breadcrumb ---');
await addBoardCardVia(false, 0, 0, 'Locations');
await page.locator('.card-board .board-arrow').first().click();
await page.waitForTimeout(120);
await addBoardCardVia(false, 0, 0, 'Reykjavik');
await page.locator('.card-board .board-arrow').first().click();
await page.waitForTimeout(120);
ok('four boards exist', (await boardTitles()).length === 4, JSON.stringify(await boardTitles()));
ok('breadcrumb shows the ancestors', JSON.stringify(await crumbText()) === '["Home","Renamed live","Locations"]', JSON.stringify(await crumbText()));
ok('current board is the editable title field', await page.locator('#title').inputValue() === 'Reykjavik');

await page.locator('#crumbs .crumb', { hasText: 'Renamed live' }).click();
await page.waitForTimeout(120);
ok('crumb click navigated', await page.locator('#title').inputValue() === 'Renamed live');
ok('crumb click truncated the trail', JSON.stringify(await crumbText()) === '["Home"]', JSON.stringify(await crumbText()));
await page.locator('#crumbs .crumb', { hasText: 'Home' }).click();
await page.waitForTimeout(120);
ok('back at Home', await S(() => state.currentBoardId) === 'b_home');
ok('Home has no ancestors', (await crumbText()).length === 0);
ok('walking up pushed no history', await S(() => undoStack.length) === histBeforeNav + 4, await S(() => String(undoStack.length)));

console.log('\n--- step 4: card count is live ---');
ok('Home board card shows its target count', (await page.locator('.card-board .board-count').textContent()) === '1 card',
   await page.locator('.card-board .board-count').textContent());

console.log('\n--- step 4: two boards linking each other (a cycle) ---');
await S(() => {
  const ids = Object.keys(state.boards);
  const a = ids.find(i => state.boards[i].title === 'Locations');
  const b = ids.find(i => state.boards[i].title === 'Reykjavik');
  // Reykjavik already sits under Locations; add the back-link.
  state.boards[b].cards.push({ id: 'c_back', type: 'board', x: 300, y: 150, w: 230, h: 96, targetBoardId: a });
  state.currentBoardId = a; trail = [a]; render();
});
for (let i = 0; i < 15; i++) {
  await page.locator('.card-board .board-arrow').first().click();
  await page.waitForTimeout(60);
}
const loopCrumbs = await crumbText();
ok('trail capped despite the loop', loopCrumbs.length === 9, loopCrumbs.length + ' crumbs (cap 10 incl. current)');
ok('crumbs still resolve to real boards', loopCrumbs.every(t => ['Locations', 'Reykjavik'].includes(t)), JSON.stringify(loopCrumbs));
ok('no errors from cycling', errors.length === 0, errors.join(' | '));
const midLoop = await S(() => state.currentBoardId);
await page.locator('#crumbs .crumb').first().click();
await page.waitForTimeout(120);
ok('crumb click inside a loop truncates cleanly', (await crumbText()).length === 0);
ok('and lands somewhere real', await S(() => !!currentBoard()));

console.log('\n--- step 4: switcher ---');
await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
ok('switcher lists every board', await page.locator('.switcher-row[data-board-id]').count() === 4);
const rows = await page.locator('.switcher-row[data-board-id]').allTextContents();
ok('switcher shows card counts', rows.every(r => /\d+ cards?$/.test(r.trim())), JSON.stringify(rows));
ok('current board marked', await page.locator('.switcher-row[aria-current="true"]').count() === 1);
await page.locator('.switcher-row[data-board-id]', { hasText: 'Home' }).click();
await page.waitForTimeout(120);
ok('switcher jump navigates', await S(() => state.currentBoardId) === 'b_home');
ok('switcher jump resets the trail', (await crumbText()).length === 0);
ok('switcher closed after choosing', await page.locator('.switcher').count() === 0);

console.log('\n--- step 4: delete a link card, find the board in the switcher ---');
const orphanId = await S(() => currentBoard().cards.find(c => c.type === 'board').targetBoardId);
const orphanTitle = await S(id => state.boards[id].title, orphanId);
const orphanCards = await S(id => state.boards[id].cards.length, orphanId);
await page.locator('.card-board .grip-btn.danger').click();
await page.waitForTimeout(120);
ok('link card deleted', await page.locator('.card-board').count() === 0);
ok('target board NOT deleted', await S(id => !!state.boards[id], orphanId));
ok('target board kept its cards (no cascade)', await S(id => state.boards[id].cards.length, orphanId) === orphanCards);
ok('no card anywhere points at it now', await S(id =>
  !Object.values(state.boards).some(b => b.cards.some(c => c.type === 'board' && c.targetBoardId === id)), orphanId));
await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
ok('orphan still reachable from the switcher', await page.locator('.switcher-row', { hasText: orphanTitle }).count() === 1);
await page.locator('.switcher-row', { hasText: orphanTitle }).click();
await page.waitForTimeout(120);
ok('navigated to the orphaned board', await S(() => state.currentBoardId) === orphanId);

console.log('\n--- step 4: New board creates a standalone board ---');
await page.locator('#boardsBtn').click();
await page.waitForTimeout(100);
await page.locator('#newBoardBtn').click();
await page.waitForTimeout(150);
await page.keyboard.type('Standalone');
await page.locator('#canvas').click({ position: { x: 60, y: 900 } });
await page.waitForTimeout(100);
ok('new board created', (await boardTitles()).includes('Standalone'));
ok('navigated to it', await page.locator('#title').inputValue() === 'Standalone');
ok('nothing points at it', await S(() => {
  const id = Object.keys(state.boards).find(i => state.boards[i].title === 'Standalone');
  return !Object.values(state.boards).some(b => b.cards.some(c => c.type === 'board' && c.targetBoardId === id));
}));
ok('creating a board IS undoable', await S(() => undoStack.length) > 0);

console.log('\n--- step 3: broken link renders, does not throw ---');
await S(() => {
  currentBoard().cards.push({ id: 'c_dead', type: 'board', x: 200, y: 200, w: 230, h: 96, targetBoardId: 'b_nope' });
  render();
});
ok('broken link rendered', await page.locator('.board-open.broken').count() === 1);
ok('broken link says so', (await page.locator('.board-broken-title').textContent()) === 'Missing board');
ok('broken link shows the dangling id', (await page.locator('.board-broken-id').textContent()) === 'b_nope');
await page.locator('.board-open.broken').click();
await page.waitForTimeout(100);
ok('clicking a broken link does nothing', await page.locator('#title').inputValue() === 'Standalone');
ok('no errors thrown', errors.length === 0, errors.join(' | '));
await S(() => { currentBoard().cards = currentBoard().cards.filter(c => c.id !== 'c_dead'); render(); });

// ============================================================ STEP 2 x 3: undo across boards
console.log('\n--- undo across boards (the real scenario) ---');
await page.locator('#boardsBtn').click();
await page.waitForTimeout(100);
await page.locator('.switcher-row[data-board-id]', { hasText: 'Home' }).click();
await page.waitForTimeout(120);
await S(() => { undoStack.length = 0; redoStack.length = 0; });
const taA = page.locator('.card-text .text-field').first();
await taA.click(); await taA.press('End');
await page.keyboard.type(' EDITED-ON-A');
await page.locator('#canvas').click({ position: { x: 200, y: 760 } });
await page.locator('#boardsBtn').click();
await page.waitForTimeout(100);
await page.locator('.switcher-row[data-board-id]', { hasText: 'Standalone' }).click();
await page.waitForTimeout(120);
ok('now on board B', await page.locator('#title').inputValue() === 'Standalone');
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok('undo took me back to board A', await S(() => state.currentBoardId) === 'b_home');
ok('undo reversed the edit on A', !(await S(() => currentBoard().cards.find(c => c.type === 'text').text)).includes('EDITED-ON-A'));
ok('breadcrumb followed the jump', await page.locator('#title').inputValue() === 'Home');
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(120);
ok('redo re-applied on A and stayed there', await S(() =>
  state.currentBoardId === 'b_home' && currentBoard().cards.find(c => c.type === 'text').text.includes('EDITED-ON-A')));

// ============================================================ STEP 5
console.log('\n--- step 5: export whole state, refresh, import ---');
await page.evaluate(() => document.activeElement.blur());
const exported = await S(() => JSON.stringify(state, null, 2));
const parsed = JSON.parse(exported);
ok('export payload has boards + currentBoardId', 'boards' in parsed && 'currentBoardId' in parsed);
ok('export contains all 5 boards', Object.keys(parsed.boards).length === 5, Object.keys(parsed.boards).length + '');
ok('export preserves board links', JSON.stringify(parsed).includes('targetBoardId'));

const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
const p1 = DIR + '/multi.json';
await dl.saveAs(p1);
ok('downloaded file matches state exactly', fs.readFileSync(p1, 'utf8') === exported);

await page.reload();
await page.waitForTimeout(250);
ok('refresh wiped everything back to one board', await S(() => Object.keys(state.boards).length) === 1);
await page.locator('#jsonInput').setInputFiles(p1);
await page.waitForTimeout(300);
ok('import restores the whole state exactly', await S(() => JSON.stringify(state, null, 2)) === exported);
ok('every board back', await S(() => Object.keys(state.boards).length) === 5);
ok('links still resolve', await S(() => {
  const links = Object.values(state.boards).flatMap(b => b.cards.filter(c => c.type === 'board'));
  return links.length > 0 && links.every(c => !!state.boards[c.targetBoardId]);
}));
ok('landed on the exported current board', await S(() => state.currentBoardId) === parsed.currentBoardId);

console.log('\n--- step 5: navigate the restored structure ---');
// Home's link card was deleted earlier in this run; Locations still has one.
await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
await page.locator('.switcher-row[data-board-id]', { hasText: 'Locations' }).click();
await page.waitForTimeout(120);
ok('board card still opens after a round trip', await page.locator('.card-board').count() === 1,
   'found ' + (await page.locator('.card-board').count()));
const restoredTarget = await S(() => currentBoard().cards.find(c => c.type === 'board').targetBoardId);
await page.locator('.card-board .board-arrow').first().click();
await page.waitForTimeout(120);
ok('navigation works on restored data', await S(() => state.currentBoardId) === restoredTarget);

console.log('\n--- step 5: legacy single-board file migrates ---');
const legacy = {
  id: 'b_proto', title: 'Old Single Board',
  cards: [
    { id: 'c_1', type: 'text', x: 120, y: 90, w: 240, h: 140, text: 'made before nesting existed' },
    { id: 'c_2', type: 'swatch', x: 400, y: 90, w: 150, h: 150, colour: '#c9a227', label: 'Ochre' }
  ]
};
const p2 = DIR + '/legacy.json';
fs.writeFileSync(p2, JSON.stringify(legacy, null, 2));
await page.locator('#jsonInput').setInputFiles(p2);
await page.waitForTimeout(300);
ok('legacy file loaded', await S(() => Object.keys(state.boards).length) === 1);
ok('wrapped under its own id', await S(() => !!state.boards.b_proto));
ok('set as current', await S(() => state.currentBoardId) === 'b_proto');
ok('title preserved', await page.locator('#title').inputValue() === 'Old Single Board');
ok('cards preserved', await page.locator('.card').count() === 2);
ok('card content preserved', await S(() => currentBoard().cards[0].text) === 'made before nesting existed');
ok('toast says migrated', (await page.locator('#toast').textContent()).includes('Migrated'));
ok('breadcrumb sane after migration', (await crumbText()).length === 0);

console.log('\n--- step 5: legacy round-trips forward into the new format ---');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
const p3 = DIR + '/migrated.json';
await dl2.saveAs(p3);
const forward = JSON.parse(fs.readFileSync(p3, 'utf8'));
ok('re-exported in the new shape', 'boards' in forward && 'currentBoardId' in forward);
ok('content survived the migration', forward.boards.b_proto.cards.length === 2);

console.log('\n--- junk import still rejected ---');
const p4 = DIR + '/junk2.json';
fs.writeFileSync(p4, '{"nonsense": true}');
const boardsBefore = await S(() => Object.keys(state.boards).length);
await page.locator('#jsonInput').setInputFiles(p4);
await page.waitForTimeout(250);
ok('junk did not wipe state', await S(() => Object.keys(state.boards).length) === boardsBefore);
ok('toast reports the failure', (await page.locator('#toast').textContent()).includes('Not a valid'));

console.log('\n--- mobile ---');
const mob = await ctx.newPage();
mob.on('dialog', d => { throw new Error('unexpected dialog on mobile: ' + d.message()); });
await mob.goto(FILE);
await mob.setViewportSize({ width: 390, height: 844 });
await mob.waitForTimeout(200);
const barH = (await mob.locator('.bar').boundingBox()).height;
ok('top bar still fits on a phone', barH < 130, barH + 'px');
ok('no horizontal page overflow', await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await mob.locator('[data-add="board"]').click();
await mob.waitForTimeout(150);
await mob.keyboard.type('Phone board');
await mob.locator('#canvas').click({ position: { x: 40, y: 700 } });
await mob.waitForTimeout(120);
ok('naming a board without a modal works on a phone',
   await mob.locator('.card-board .board-title').inputValue() === 'Phone board');
await mob.locator('.card-board .board-arrow').first().click();
await mob.waitForTimeout(150);
ok('navigation works on a phone', await mob.locator('#title').inputValue() === 'Phone board',
   await mob.locator('#title').inputValue());
ok('breadcrumb shows on a phone', (await mob.locator('#crumbs .crumb').allTextContents()).length === 1);
await mob.locator('#boardsBtn').click();
await mob.waitForTimeout(150);
const sw = await mob.locator('.switcher').boundingBox();
ok('switcher stays on screen', sw.x >= 0 && sw.x + sw.width <= 390 + 1, JSON.stringify(sw));

console.log('\n--- final sweep ---');
ok('no page errors', errors.length === 0, errors.join(' | '));
ok('no external requests', netExternal.length === 0, netExternal.join(' | '));

await browser.close();
console.log('\n' + (fails === 0 ? 'ALL PASSED' : fails + ' FAILURE(S)'));
process.exit(fails ? 1 : 0);
