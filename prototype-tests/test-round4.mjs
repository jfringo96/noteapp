import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const FILE = 'file:///home/user/noteapp/board-prototype.html';
let fails = 0;
const ok = (n, c, extra='') => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (extra ? '  ->  ' + extra : '')); if (!c) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => { throw new Error('MODAL SHOULD BE GONE: ' + d.message()); });
await page.goto(FILE);
await page.waitForTimeout(250);
const S = (fn, arg) => page.evaluate(fn, arg);

// Build a two-board fixture: Home with content + a link card to "Archive".
async function fixture() {
  await S(() => {
    state = {
      currentBoardId: 'b_home',
      boards: {
        b_home: { id:'b_home', title:'Home', cards:[
          { id:'c_note',  type:'text',   x:200, y:150, w:240, h:130, text:'move me' },
          { id:'c_list',  type:'list',   x:200, y:320, w:240, h:130, checkable:false,
            items:[{id:'i1',text:'one',checked:false},{id:'i2',text:'two',checked:false}] },
          { id:'c_link',  type:'board',  x:600, y:150, w:230, h:96, targetBoardId:'b_arch' },
          { id:'c_self',  type:'board',  x:600, y:320, w:230, h:96, targetBoardId:'b_home' }
        ]},
        b_arch: { id:'b_arch', title:'Archive', cards:[] }
      }
    };
    trail = ['b_home']; backStack.length = 0; scrollMemory.clear();
    displayedBoardId = null; selectedId = null;
    undoStack.length = 0; redoStack.length = 0;
    render();
  });
  await page.waitForTimeout(120);
}

// ============================================================ MOVE BY DRAG
console.log('\n--- drag a card onto a board card to move it ---');
await fixture();
const gripOf = id => page.locator(`.card[data-id="${id}"] .grip-rail`);
const boxOf  = id => page.locator(`.card[data-id="${id}"]`).boundingBox();

let g = await gripOf('c_note').boundingBox();
let link = await boxOf('c_link');
await page.mouse.move(g.x + 20, g.y + 6);
await page.mouse.down();
await page.mouse.move(link.x + link.width/2, link.y + link.height/2, { steps: 10 });
await page.waitForTimeout(80);
ok('board card highlights as a drop target', await S(() =>
  document.querySelector('.card[data-id="c_link"]').classList.contains('drop-into')));
ok('dragged card signals it will move', await S(() =>
  document.querySelector('.card[data-id="c_note"]').classList.contains('will-move')));
ok('nothing committed mid-drag', await S(() => undoStack.length) === 0);
await page.mouse.up();
await page.waitForTimeout(150);
ok('card left the source board', await S(() => !currentBoard().cards.some(c => c.id === 'c_note')));
ok('card arrived on the target board', await S(() => state.boards.b_arch.cards.some(c => c.id === 'c_note')));
ok('content survived the move', await S(() => state.boards.b_arch.cards.find(c => c.id === 'c_note').text) === 'move me');
ok('the move is exactly one history entry', await S(() => undoStack.length) === 1);
ok('link card count updated', (await page.locator('.card[data-id="c_link"] .board-count').textContent()) === '1 card');
ok('selection cleared (it lives elsewhere now)', await S(() => selectedId) === null);
ok('toast names the destination', (await page.locator('#toast').textContent()).includes('Archive'));

console.log('\n--- undo of a move ---');
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok('undo returns the card', await S(() => currentBoard().cards.some(c => c.id === 'c_note')));
ok('and removes it from the target', await S(() => state.boards.b_arch.cards.length) === 0);
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(120);
ok('redo re-applies the move', await S(() => state.boards.b_arch.cards.some(c => c.id === 'c_note')));

console.log('\n--- drop rules ---');
await fixture();
// a self-linking board card must not be a drop target
g = await gripOf('c_note').boundingBox();
const self = await boxOf('c_self');
await page.mouse.move(g.x + 20, g.y + 6);
await page.mouse.down();
await page.mouse.move(self.x + self.width/2, self.y + self.height/2, { steps: 8 });
await page.waitForTimeout(80);
ok('a card linking to THIS board is not a drop target', await S(() =>
  !document.querySelector('.card[data-id="c_self"]').classList.contains('drop-into')));
await page.mouse.up();
await page.waitForTimeout(120);
ok('that drop was an ordinary move', await S(() => currentBoard().cards.length) === 4);

// dragging a board card onto itself
await fixture();
g = await gripOf('c_link').boundingBox();
link = await boxOf('c_link');
await page.mouse.move(g.x + 20, g.y + 6);
await page.mouse.down();
await page.mouse.move(g.x + 30, g.y + 16, { steps: 4 });
await page.waitForTimeout(60);
ok('a board card is not its own drop target', await S(() =>
  !document.querySelector('.card[data-id="c_link"]').classList.contains('drop-into')));
await page.mouse.up();
await page.waitForTimeout(120);

// moving a board card into another board (nesting a link)
await fixture();
g = await gripOf('c_self').boundingBox();
link = await boxOf('c_link');
await page.mouse.move(g.x + 20, g.y + 6);
await page.mouse.down();
await page.mouse.move(link.x + link.width/2, link.y + link.height/2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
ok('a board card can itself be moved into a board', await S(() =>
  state.boards.b_arch.cards.some(c => c.id === 'c_self')));
ok('the moved link still points where it did', await S(() =>
  state.boards.b_arch.cards.find(c => c.id === 'c_self').targetBoardId) === 'b_home');

// ============================================================ CUT / COPY / PASTE
console.log('\n--- cut, copy, paste, duplicate ---');
await fixture();
await gripOf('c_note').click();
await page.keyboard.press('Control+x');
await page.waitForTimeout(120);
ok('cut removes the card', await S(() => !currentBoard().cards.some(c => c.id === 'c_note')));
await page.locator('.card[data-id="c_link"] .board-arrow').click();
await page.waitForTimeout(150);
ok('navigated to Archive', await S(() => state.currentBoardId) === 'b_arch');
await page.keyboard.press('Control+v');
await page.waitForTimeout(150);
ok('paste lands the card on this board', await S(() => currentBoard().cards.length) === 1);
ok('pasted card kept its content', await S(() => currentBoard().cards[0].text) === 'move me');
ok('pasted card got a fresh id', await S(() => currentBoard().cards[0].id) !== 'c_note');
ok('paste is undoable', await S(() => undoStack.length) > 0);

await fixture();
await gripOf('c_list').click();
await page.keyboard.press('Control+c');
await page.waitForTimeout(100);
ok('copy leaves the original', await S(() => currentBoard().cards.some(c => c.id === 'c_list')));
await page.keyboard.press('Control+v');
await page.waitForTimeout(150);
ok('copy+paste adds a card', await S(() => currentBoard().cards.length) === 5);
ok('list item ids are regenerated', await S(() => {
  const a = currentBoard().cards.find(c => c.id === 'c_list').items.map(i => i.id);
  const b = currentBoard().cards[currentBoard().cards.length-1].items.map(i => i.id);
  return a.every(id => !b.includes(id));
}));

await fixture();
await gripOf('c_note').click();
await page.keyboard.press('Control+d');
await page.waitForTimeout(150);
ok('duplicate adds a card', await S(() => currentBoard().cards.length) === 5);
ok('duplicate is offset from the original', await S(() => {
  const src = currentBoard().cards.find(c => c.id === 'c_note');
  const dup = currentBoard().cards[currentBoard().cards.length-1];
  return dup.x === src.x + 24 && dup.y === src.y + 24;
}));
ok('duplicate is selected', await S(() => selectedId === currentBoard().cards[currentBoard().cards.length-1].id));
ok('duplicating a board card copies the LINK not the board', await S(() => {
  const before = Object.keys(state.boards).length;
  selectedId = 'c_link'; duplicateSelected();
  const dup = currentBoard().cards[currentBoard().cards.length-1];
  return Object.keys(state.boards).length === before && dup.targetBoardId === 'b_arch';
}));

console.log('\n--- clipboard shortcuts must not shadow text editing ---');
await fixture();
await page.locator('.card[data-id="c_note"] .text-field').click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+d');
await page.waitForTimeout(120);
ok('Cmd+C / Cmd+D inside a textarea do not touch cards', await S(() => currentBoard().cards.length) === 4);

// ============================================================ SCROLL MEMORY
console.log('\n--- scroll position remembered per board ---');
await fixture();
await S(() => {
  state.boards.b_arch.cards.push({ id:'far', type:'text', x:1500, y:1300, w:200, h:120, text:'far' });
  // Keep the link card inside the viewport: Playwright scrolls a click
  // target into view, which would move the very scroll we are testing.
  scroller.scrollLeft = 320; scroller.scrollTop = 120;
});
const homeScroll = await S(() => ({ l: scroller.scrollLeft, t: scroller.scrollTop }));
await page.locator('.card[data-id="c_link"] .board-arrow').click();
await page.waitForTimeout(200);
const archScroll = await S(() => ({ l: scroller.scrollLeft, t: scroller.scrollTop }));
ok('a first visit scrolls to that board content', archScroll.l > 1000 && archScroll.t > 1000, JSON.stringify(archScroll));
await S(() => { scroller.scrollLeft = 1200; scroller.scrollTop = 900; });
await page.locator('#backBtn').click();
await page.waitForTimeout(200);
const homeAgain = await S(() => ({ l: scroller.scrollLeft, t: scroller.scrollTop }));
ok('returning restores where you were', homeAgain.l === homeScroll.l && homeAgain.t === homeScroll.t,
   JSON.stringify({ homeScroll, homeAgain }));
await page.locator('.card[data-id="c_link"] .board-arrow').click();
await page.waitForTimeout(200);
const archAgain = await S(() => ({ l: scroller.scrollLeft, t: scroller.scrollTop }));
ok('and the other board remembers its own', archAgain.l === 1200 && archAgain.t === 900, JSON.stringify(archAgain));
ok('scroll memory is not in state', await S(() => !('scrollMemory' in state) && !JSON.stringify(state).includes('scrollLeft')));

// ============================================================ BACK
console.log('\n--- in-app back ---');
await fixture();
ok('back disabled at the start', await page.locator('#backBtn').isDisabled());
await page.locator('.card[data-id="c_link"] .board-arrow').click();
await page.waitForTimeout(150);
ok('back enabled after navigating', !(await page.locator('#backBtn').isDisabled()));
await page.locator('#backBtn').click();
await page.waitForTimeout(150);
ok('back returns to the previous board', await S(() => state.currentBoardId) === 'b_home');
ok('back pushed no history', await S(() => undoStack.length) === 0);

console.log('\n--- back works after a switcher jump reset the trail ---');
await fixture();
await page.locator('.card[data-id="c_link"] .board-arrow').click();
await page.waitForTimeout(150);
await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
await page.locator('.switcher-row[data-board-id="b_home"]').click();
await page.waitForTimeout(150);
ok('switcher jump cleared the crumb trail', (await page.locator('#crumbs .crumb').allTextContents()).length === 0);
await page.locator('#backBtn').click();
await page.waitForTimeout(150);
ok('back still finds the way to Archive', await S(() => state.currentBoardId) === 'b_arch');

// ============================================================ DELETE A BOARD
console.log('\n--- delete a board ---');
await fixture();
await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
ok('every row has a delete control', await page.locator('.switcher-del').count() === 2);
await page.locator('.switcher-item', { hasText: 'Archive' }).locator('.switcher-del').click();
await page.waitForTimeout(200);
ok('board removed', await S(() => !state.boards.b_arch));
ok('cards pointing at it are NOT removed', await S(() => currentBoard().cards.some(c => c.id === 'c_link')));
ok('that card now renders as a broken link', await page.locator('.board-open.broken').count() === 1);
ok('broken link names the dangling id', (await page.locator('.board-broken-id').textContent()) === 'b_arch');
ok('deletion is undoable', await S(() => undoStack.length) === 1);
ok('toast mentions undo', (await page.locator('#toast').textContent()).toLowerCase().includes('undo'));
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
ok('undo brings the board back', await S(() => !!state.boards.b_arch));
ok('and the link resolves again', await page.locator('.board-open.broken').count() === 0);

console.log('\n--- deleting the board you are standing on ---');
await fixture();
await page.locator('.card[data-id="c_link"] .board-arrow').click();
await page.waitForTimeout(150);
await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
await page.locator('.switcher-item', { hasText: 'Archive' }).locator('.switcher-del').click();
await page.waitForTimeout(200);
ok('moved to a surviving board', await S(() => state.currentBoardId) === 'b_home');
ok('still renders', await page.locator('.card').count() === 4);
ok('crumbs sane', (await page.locator('#crumbs .crumb').allTextContents()).length === 0);
ok('no errors', errors.length === 0, errors.join(' | '));

console.log('\n--- the last board cannot be deleted ---');
await S(() => {
  state = { currentBoardId:'b_only', boards:{ b_only:{ id:'b_only', title:'Only', cards:[] } } };
  trail = ['b_only']; displayedBoardId = null; render();
});
await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
ok('its delete control is disabled', await page.locator('.switcher-del').first().isDisabled());
ok('exactly one board remains', await S(() => Object.keys(state.boards).length) === 1);

// ============================================================ NO MODALS / FOCUS
console.log('\n--- board creation without a modal ---');
await fixture();
await page.locator('[data-add="board"]').click();
await page.waitForTimeout(150);
ok('board created immediately', await S(() => Object.keys(state.boards).length) === 3);
ok('its title field is focused', await S(() => document.activeElement.className) === 'board-title');
ok('placeholder is pre-selected', await S(() =>
  document.activeElement.selectionStart === 0 &&
  document.activeElement.selectionEnd === document.activeElement.value.length));
await page.keyboard.type('Typed straight in');
ok('typing replaces it', await S(() =>
  Object.values(state.boards).some(b => b.title === 'Typed straight in')));

await page.locator('#boardsBtn').click();
await page.waitForTimeout(120);
await page.locator('#newBoardBtn').click();
await page.waitForTimeout(200);
ok('New board focuses the top-bar title', await S(() => document.activeElement.id) === 'title');
await page.keyboard.type('From the switcher');
ok('and typing renames it', await S(() => currentBoard().title) === 'From the switcher');

console.log('\n--- focus lands on the canvas after navigating ---');
await fixture();
await page.locator('.card[data-id="c_link"] .board-arrow').click();
await page.waitForTimeout(150);
ok('focus is on the canvas, not body', await S(() => document.activeElement.id) === 'canvas');
ok('navigation is announced', (await page.locator('#announce').textContent()).includes('Archive'));

console.log('\n--- history: redo lands on the changed board (no diffing) ---');
ok('changedBoardIds is gone', await S(() => typeof changedBoardIds === 'undefined'));
await fixture();
await S(() => { state.currentBoardId = 'b_arch'; trail=['b_arch']; displayedBoardId=null; render(); });
await S(() => applyChange(() => { currentBoard().title = 'Archive edited'; }));
await S(() => { state.currentBoardId = 'b_home'; trail=['b_home']; displayedBoardId=null; render(); });
await page.keyboard.press('Control+z');
await page.waitForTimeout(120);
ok('undo lands on the changed board', await S(() => state.currentBoardId) === 'b_arch');
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(120);
ok('redo lands on the changed board too', await S(() => state.currentBoardId) === 'b_arch');
ok('and re-applied the change', await S(() => state.boards.b_arch.title) === 'Archive edited');

console.log('\n--- touch: drag-to-move works with touch events ---');
const mob = await ctx.newPage();
mob.on('pageerror', e => errors.push('mobile: ' + String(e)));
await mob.goto(FILE);
await mob.setViewportSize({ width: 390, height: 844 });
await mob.evaluate(() => {
  state = { currentBoardId:'b_home', boards:{
    b_home:{ id:'b_home', title:'Home', cards:[
      { id:'c_note', type:'text', x:40, y:60, w:180, h:90, text:'touch me' },
      { id:'c_link', type:'board', x:40, y:220, w:200, h:96, targetBoardId:'b_arch' }
    ]},
    b_arch:{ id:'b_arch', title:'Archive', cards:[] }
  }};
  trail=['b_home']; displayedBoardId=null; scrollMemory.clear(); render(); scrollToContent();
});
await mob.waitForTimeout(200);
const cdp = await mob.context().newCDPSession(mob);
const mg = await mob.locator('.card[data-id="c_note"] .grip-rail').boundingBox();
const ml = await mob.locator('.card[data-id="c_link"]').boundingBox();
await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x: mg.x+20, y: mg.y+5 }] });
await cdp.send('Input.dispatchTouchEvent', { type:'touchMove',  touchPoints:[{ x: ml.x+ml.width/2, y: ml.y+ml.height/2 }] });
await mob.waitForTimeout(80);
ok('touch drag highlights the drop target', await mob.evaluate(() =>
  document.querySelector('.card[data-id="c_link"]').classList.contains('drop-into')));
await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
await mob.waitForTimeout(150);
ok('touch drop moves the card', await mob.evaluate(() => state.boards.b_arch.cards.length) === 1);

console.log('\n--- final sweep ---');
ok('no page errors anywhere', errors.length === 0, errors.join(' | '));

await browser.close();
console.log('\n' + (fails === 0 ? 'ALL PASSED' : fails + ' FAILURE(S)'));
process.exit(fails ? 1 : 0);
