import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';

const FILE = 'file://' + path.resolve('/home/user/noteapp/board-prototype.html');
let fails = 0;
const ok = (n, c, extra='') => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (extra ? '  ->  ' + extra : '')); if (!c) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();

const errors = [], netExternal = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) netExternal.push(r.url()); });

await page.goto(FILE);
await page.waitForTimeout(300);

console.log('\n--- load ---');
ok('no page errors', errors.length === 0, errors.join(' | '));
ok('no external network requests', netExternal.length === 0, netExternal.join(' | '));
ok('5 seed cards rendered', await page.locator('.card').count() === 5);
const scroll = await page.evaluate(() => ({ l: scroller.scrollLeft, t: scroller.scrollTop }));
ok('scrolled near top-left of used area', scroll.l === 124 && scroll.t === 94, JSON.stringify(scroll));

// ---------------------------------------------------------------- selection
console.log('\n--- selection & z-order ---');
const first = page.locator('.card').first();
const firstId = await first.getAttribute('data-id');
await first.click({ position: { x: 10, y: 10 } });
ok('card gets .selected', await first.evaluate(el => el.classList.contains('selected')));
ok('selected moved to end of cards array', await page.evaluate(id => currentBoard().cards[currentBoard().cards.length-1].id === id, firstId));
ok('resize handle visible when selected', await first.locator('.resize').isVisible());
ok('selection is not a history entry', await page.evaluate(() => undoStack.length) === 0);
await page.mouse.click(900, 700); // empty canvas
ok('click empty canvas deselects', await page.evaluate(() => selectedId === null));
ok('resize handle hidden when deselected', !(await first.locator('.resize').isVisible()));

// ---------------------------------------------------------------- drag
console.log('\n--- drag ---');
const before = await page.evaluate(id => { const c = currentBoard().cards.find(x=>x.id===id); return {x:c.x,y:c.y}; }, firstId);
const gripBox = await first.locator('.grip').boundingBox();
await page.mouse.move(gripBox.x + 40, gripBox.y + 8);
await page.mouse.down();
const atGrab = await first.evaluate(el => el.style.transform);
ok('no jump on grab (transform empty/none at pointerdown)', atGrab === '' || atGrab === 'none', JSON.stringify(atGrab));
await page.mouse.move(gripBox.x + 140, gripBox.y + 78, { steps: 8 });
const midHistory = await page.evaluate(() => undoStack.length);
const midTransform = await first.evaluate(el => el.style.transform);
ok('moves via transform during gesture', /translate\(100px,\s*70px\)/.test(midTransform), midTransform);
ok('no history pushed during pointermove', midHistory === 0);
await page.mouse.up();
const after = await page.evaluate(id => { const c = currentBoard().cards.find(x=>x.id===id); return {x:c.x,y:c.y}; }, firstId);
ok('x/y committed on pointerup', after.x === before.x + 100 && after.y === before.y + 70, JSON.stringify({before, after}));
ok('exactly one history entry for the drag', await page.evaluate(() => undoStack.length) === 1);
ok('transform cleared after commit', await first.evaluate(el => el.style.transform) === '');

console.log('\n--- undo/redo of drag ---');
await page.keyboard.press('Control+z');
const undone = await page.evaluate(id => { const c = currentBoard().cards.find(x=>x.id===id); return {x:c.x,y:c.y}; }, firstId);
ok('undo restores position', undone.x === before.x && undone.y === before.y, JSON.stringify(undone));
await page.keyboard.press('Control+Shift+z');
const redone = await page.evaluate(id => { const c = currentBoard().cards.find(x=>x.id===id); return {x:c.x,y:c.y}; }, firstId);
ok('redo re-applies position', redone.x === after.x && redone.y === after.y, JSON.stringify(redone));

// ---------------------------------------------------------------- typing
console.log('\n--- typing history ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
const ta = page.locator('.card-text .text-field').first();
const origText = await ta.inputValue();
await ta.click();
await ta.press('End');
await page.keyboard.type('HELLO');
ok('typing does not push history per keystroke', await page.evaluate(() => undoStack.length) === 0);
ok('typing writes straight into state', (await page.evaluate(() => currentBoard().cards.find(c=>c.type==='text').text)).includes('HELLO'));
ok('focus retained while typing', await page.evaluate(() => document.activeElement.className) === 'text-field');
await page.locator('#canvas').click({ position: { x: 900, y: 700 } });
ok('one history entry on blur', await page.evaluate(() => undoStack.length) === 1);
await page.keyboard.press('Control+z');
ok('undo reverts the whole editing session', await page.evaluate(() => currentBoard().cards.find(c=>c.type==='text').text) === origText);

console.log('\n--- typing then Ctrl+Z without blurring ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
await ta.click(); await ta.press('End');
await page.keyboard.type('ZZZ');
await page.keyboard.press('Control+z');
ok('in-flight edit is sealed then undone', await page.evaluate(() => currentBoard().cards.find(c=>c.type==='text').text) === origText);

// ---------------------------------------------------------------- auto-grow
console.log('\n--- text auto-grow ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
const hBefore = await page.evaluate(() => currentBoard().cards.find(c=>c.type==='text').h);
await ta.click(); await ta.press('End');
await page.keyboard.type('\nline\nline\nline\nline\nline\nline\nline\nline');
const hAfter = await page.evaluate(() => currentBoard().cards.find(c=>c.type==='text').h);
ok('card height grows when content overflows', hAfter > hBefore, `${hBefore} -> ${hAfter}`);
ok('growth does not push history', await page.evaluate(() => undoStack.length) === 0);
await page.locator('#canvas').click({ position: { x: 900, y: 700 } });
await page.keyboard.press('Control+z');
ok('undo restores both text and height', await page.evaluate(() => currentBoard().cards.find(c=>c.type==='text').h) === hBefore);

// ---------------------------------------------------------------- list
console.log('\n--- list Enter / Backspace ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
const listCard = page.locator('.card-list').first();
const listId = await listCard.getAttribute('data-id');
const nItems = () => page.evaluate(id => currentBoard().cards.find(c=>c.id===id).items.length, listId);
ok('list starts with 3 rows', await nItems() === 3);
await listCard.locator('.row-input').first().click();
await page.keyboard.press('End');
await page.keyboard.press('Enter');
ok('Enter adds a row', await nItems() === 4);
ok('new row inserted directly below', await page.evaluate(id => currentBoard().cards.find(c=>c.id===id).items[1].text === '', listId));
const focusedIdx = await page.evaluate(() => {
  const row = document.activeElement.closest('.row');
  return [...row.parentElement.children].indexOf(row);
});
ok('focus moves to the new row', focusedIdx === 1, 'index ' + focusedIdx);
await page.keyboard.type('typed into new row');
ok('typed text lands in the new row', await page.evaluate(id => currentBoard().cards.find(c=>c.id===id).items[1].text, listId) === 'typed into new row');

// backspace on non-empty row should NOT delete
await page.keyboard.press('Backspace');
ok('Backspace on non-empty row just edits text', await nItems() === 4);
// clear the row then backspace
await page.keyboard.press('Control+a');
await page.keyboard.press('Backspace');
ok('row emptied, still present', await nItems() === 4 && await page.evaluate(() => document.activeElement.value) === '');
await page.keyboard.press('Backspace');
ok('Backspace on empty row deletes it', await nItems() === 3);
const caret = await page.evaluate(() => ({
  v: document.activeElement.value,
  s: document.activeElement.selectionStart,
  idx: [...document.activeElement.closest('.row').parentElement.children].indexOf(document.activeElement.closest('.row'))
}));
ok('focus lands at END of the row above', caret.idx === 0 && caret.s === caret.v.length, JSON.stringify(caret));

// first row guard
await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
ok('Backspace on empty FIRST row does not delete it', await nItems() === 3);

console.log('\n--- list checkbox toggle ---');
await page.evaluate(() => document.activeElement.blur());
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
await listCard.locator('.grip-btn').first().click();
ok('toggle switches to checkable', await page.evaluate(id => currentBoard().cards.find(c=>c.id===id).checkable === true, listId));
ok('checkboxes rendered', await listCard.locator('input[type=checkbox]').count() === 3);
await listCard.locator('input[type=checkbox]').first().check();
ok('checked state stored', await page.evaluate(id => currentBoard().cards.find(c=>c.id===id).items[0].checked === true, listId));
ok('strikethrough class applied', await listCard.locator('.row').first().evaluate(el => el.classList.contains('checked')));
ok('toggle + check are 2 history entries', await page.evaluate(() => undoStack.length) === 2);

// ---------------------------------------------------------------- delete guard
console.log('\n--- delete guard ---');
const countBefore = await page.locator('.card').count();
await listCard.locator('.row-input').first().click();
await page.keyboard.press('Delete');
ok('Delete inside a text field does NOT delete the card', await page.locator('.card').count() === countBefore);
await page.locator('#canvas').click({ position: { x: 900, y: 700 } });
await listCard.locator('.grip-rail').click();
await page.keyboard.press('Delete');
ok('Delete with card selected removes it', await page.locator('.card').count() === countBefore - 1);
await page.keyboard.press('Control+z');
ok('undo restores the deleted card', await page.locator('.card').count() === countBefore);

// ---------------------------------------------------------------- resize
console.log('\n--- resize ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
const swId = await page.locator('.card-swatch').first().getAttribute('data-id');
const sw = page.locator(`.card[data-id="${swId}"]`);
await sw.locator('.grip-rail').click();
const rBox = await sw.locator('.resize').boundingBox();
const wBefore = await page.evaluate(id => currentBoard().cards.find(c=>c.id===id).w, swId);
await page.mouse.move(rBox.x + 10, rBox.y + 10);
await page.mouse.down();
await page.mouse.move(rBox.x + 70, rBox.y + 50, { steps: 6 });
ok('no history during resize move', await page.evaluate(() => undoStack.length) === 0);
await page.mouse.up();
const wAfter = await page.evaluate(id => currentBoard().cards.find(c=>c.id===id).w, swId);
ok('resize commits once on pointerup', await page.evaluate(() => undoStack.length) === 1 && wAfter === wBefore + 60, `${wBefore} -> ${wAfter}`);
// min size
const rBox2 = await sw.locator('.resize').boundingBox();
await page.mouse.move(rBox2.x + 10, rBox2.y + 10);
await page.mouse.down();
await page.mouse.move(rBox2.x - 400, rBox2.y - 400, { steps: 6 });
await page.mouse.up();
const minDims = await page.evaluate(id => { const c = currentBoard().cards.find(x=>x.id===id); return {w:c.w,h:c.h}; }, swId);
ok('minimum size enforced', minDims.w === 112 && minDims.h === 96, JSON.stringify(minDims));

// ---------------------------------------------------------------- picker
console.log('\n--- double-click picker ---');
await page.mouse.dblclick(760, 620);
ok('picker opens on dblclick of empty canvas', await page.locator('.picker').count() === 1);
const pickPt = await page.evaluate(() => {
  const r = canvas.getBoundingClientRect();
  return { x: 760 - r.left, y: 620 - r.top };
});
await page.locator('.picker button', { hasText: 'Text' }).click();
const newCard = await page.evaluate(() => currentBoard().cards[currentBoard().cards.length-1]);
ok('picker closes after choosing', await page.locator('.picker').count() === 0);
ok('new card top-left is at the click point', Math.abs(newCard.x - pickPt.x) <= 1 && Math.abs(newCard.y - pickPt.y) <= 1, JSON.stringify({newCard:{x:newCard.x,y:newCard.y}, pickPt}));
ok('new text card is focused for typing', await page.evaluate(() => document.activeElement.className) === 'text-field');
await page.keyboard.press('Escape');
await page.mouse.dblclick(760, 620);
await page.keyboard.press('Escape');
ok('Escape closes the picker', await page.locator('.picker').count() === 0);

console.log('\n--- toolbar add places at viewport centre ---');
await page.locator('[data-add="swatch"]').click();
const centred = await page.evaluate(() => {
  const c = currentBoard().cards[currentBoard().cards.length-1];
  const ex = scroller.scrollLeft + scroller.clientWidth/2 - 150/2;
  const ey = scroller.scrollTop + scroller.clientHeight/2 - 150/2;
  return Math.abs(c.x - ex) <= 1 && Math.abs(c.y - ey) <= 1;
});
ok('toolbar card lands in viewport centre', centred);

// ---------------------------------------------------------------- swatch
console.log('\n--- swatch ---');
await page.evaluate(() => { undoStack.length = 0; redoStack.length = 0; });
const swatchId = await page.evaluate(() => currentBoard().cards[currentBoard().cards.length-1].id);
await page.evaluate(id => {
  const el = elements.get(id);
  const picker = el.querySelector('.swatch-colour');
  picker.value = '#3366aa';
  picker.dispatchEvent(new Event('input', { bubbles: true }));
}, swatchId);
ok('colour input writes live without history', await page.evaluate(() => undoStack.length) === 0);
ok('colour in state', await page.evaluate(id => currentBoard().cards.find(c=>c.id===id).colour, swatchId) === '#3366aa');
ok('block background follows', await page.evaluate(id => elements.get(id).querySelector('.swatch-block').style.background, swatchId) === 'rgb(51, 102, 170)');
await page.evaluate(id => elements.get(id).querySelector('.swatch-colour').dispatchEvent(new Event('change', { bubbles: true })), swatchId);
ok('change commits exactly one history entry', await page.evaluate(() => undoStack.length) === 1);

// ---------------------------------------------------------------- images
console.log('\n--- image via paste ---');
const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABLCAIAAAAJerXgAAAAkUlEQVR4nO3QQQkAIADAQIMZzIjGsoK+hnCwAOPGXlOXjfzgo2DBgpUHCxasPFiwYOXBggUrDxYsWHmwYMHKgwULVh4sWLDyYMGClQcLFqw8WLBg5cGCBSsPFixYebBgwcqDBQtWHixYsPJgwYKVBwsWrDxYsGDlwYIFKw8WLFh5sGDByoMFC1YeLFiw8mA9dAB0BX9WXbXhWgAAAABJRU5ErkJggg==';
await page.evaluate(async (url) => {
  const res = await fetch(url);              // data: URL, not network
  const blob = await res.blob();
  const file = new File([blob], 'test.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, pngDataUrl);
await page.waitForTimeout(400);
const img = await page.evaluate(() => currentBoard().cards.filter(c => c.type === 'image').pop());
ok('paste creates an image card', !!img, JSON.stringify(img && {w:img.w,h:img.h}));
ok('image stored as a data URL', img && img.dataUrl.startsWith('data:image/png'));
ok('image sized from natural dimensions', img && img.w === 100 && img.h === 75, img && `${img.w}x${img.h}`);

console.log('\n--- image resize keeps aspect ---');
const imgId = await page.locator('.card-image').first().getAttribute('data-id');
const imgEl = page.locator(`.card[data-id="${imgId}"]`);
await imgEl.locator('.grip-rail').click();
const ib = await imgEl.locator('.resize').boundingBox();
await page.mouse.move(ib.x + 10, ib.y + 10);
await page.mouse.down();
await page.mouse.move(ib.x + 110, ib.y + 12, { steps: 6 });
await page.mouse.up();
const img2 = await page.evaluate(() => currentBoard().cards.filter(c => c.type === 'image').pop());
const ratioBefore = img.w / img.h, ratioAfter = img2.w / img2.h;
ok('aspect ratio preserved on resize', Math.abs(ratioBefore - ratioAfter) < 0.02, `${ratioBefore.toFixed(3)} -> ${ratioAfter.toFixed(3)} (${img2.w}x${img2.h})`);

// ---------------------------------------------------------------- export/import
console.log('\n--- export -> reload -> import round trip ---');
await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
await page.locator('#title').fill('Round Trip Board');
await page.locator('#canvas').click({ position: { x: 950, y: 700 } });
const exported = await page.evaluate(() => JSON.stringify(state, null, 2));
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#exportBtn').click()
]);
ok('export filename slugged from the root board', download.suggestedFilename() === 'round-trip-board.json', download.suggestedFilename());
const dlPath = './exported.json';
await download.saveAs(dlPath);
const fs = await import('fs');
const onDisk = fs.readFileSync(dlPath, 'utf8');
ok('downloaded file matches in-memory state exactly', onDisk === exported);

// hard reload = total state loss, then import
await page.reload();
await page.waitForTimeout(200);
ok('refresh loses everything (back to seed)', await page.evaluate(() => currentBoard().title) === 'Home');
await page.locator('#jsonInput').setInputFiles(dlPath);
await page.waitForTimeout(300);
const reimported = await page.evaluate(() => JSON.stringify(state, null, 2));
ok('import restores the board EXACTLY', reimported === exported, reimported === exported ? '' : 'mismatch');
ok('title restored in the top bar', await page.locator('#title').inputValue() === 'Round Trip Board');
ok('all cards re-rendered', await page.locator('.card').count() === JSON.parse(exported).boards[JSON.parse(exported).currentBoardId].cards.length);

console.log('\n--- import rejects junk ---');
const badPath = './bad.json';
fs.writeFileSync(badPath, 'this is not json at all');
await page.locator('#jsonInput').setInputFiles(badPath);
await page.waitForTimeout(250);
ok('junk file does not wipe the board', await page.evaluate(() => currentBoard().cards.length) > 0);
ok('toast shown for bad import', (await page.locator('#toast').textContent()).includes('Not a valid'));

const remotePath = './remote.json';
fs.writeFileSync(remotePath, JSON.stringify({ id:'x', title:'Remote', cards:[{id:'a',type:'image',x:10,y:10,w:100,h:100,dataUrl:'https://example.com/x.png'}] }));
await page.locator('#jsonInput').setInputFiles(remotePath);
await page.waitForTimeout(250);
ok('remote image URL in an import is stripped', await page.evaluate(() => currentBoard().cards[0].dataUrl) === '');

// ---------------------------------------------------------------- history cap
console.log('\n--- history cap ---');
await page.evaluate(() => {
  undoStack.length = 0; redoStack.length = 0;
  for (let i = 0; i < 70; i++) applyChange(() => { currentBoard().title = 'n' + i; });
});
ok('undo stack capped at 50', await page.evaluate(() => undoStack.length) === 50);

// ---------------------------------------------------------------- mobile
console.log('\n--- mobile viewport ---');
const mob = await ctx.newPage();
await mob.goto(FILE);
await mob.setViewportSize({ width: 390, height: 844 });
await mob.waitForTimeout(200);
const bar = await mob.locator('.bar').boundingBox();
ok('top bar fits and stays thin on a phone', bar.height < 110, bar.height + 'px');
const overflowX = await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
ok('no horizontal page overflow', overflowX);
const touchAction = await mob.evaluate(() => getComputedStyle(document.querySelector('.grip')).touchAction);
ok('grip has touch-action:none', touchAction === 'none', touchAction);
const raTouch = await mob.evaluate(() => getComputedStyle(document.querySelector('.card').querySelector('.resize')).touchAction);
ok('resize handle has touch-action:none', raTouch === 'none', raTouch);

console.log('\n--- touch drag (pointer events) ---');
const cdp = await mob.context().newCDPSession(mob);
const g = await mob.locator('.card').first().locator('.grip').boundingBox();
const idb = await mob.evaluate(() => currentBoard().cards[0].id);
const pos0 = await mob.evaluate(() => ({ x: currentBoard().cards[0].x, y: currentBoard().cards[0].y }));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x + 20, y: g.y + 8 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + 70, y: g.y + 48 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mob.waitForTimeout(150);
const pos1b = await mob.evaluate(id => { const c = currentBoard().cards.find(x=>x.id===id); return { x: c.x, y: c.y }; }, idb);
ok('touch drag moves the card', pos1b.x === pos0.x + 50 && pos1b.y === pos0.y + 40, JSON.stringify({pos0, pos1b}));

console.log('\n--- double-tap picker on touch ---');
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 700 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mob.waitForTimeout(80);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 700 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mob.waitForTimeout(150);
ok('double-tap opens the picker', await mob.locator('.picker').count() === 1);

console.log('\n--- reduced motion ---');
const rm = await ctx.newPage();
await rm.emulateMedia({ reducedMotion: 'reduce' });
await rm.goto(FILE);
const dur = await rm.evaluate(() => getComputedStyle(document.querySelector('.card')).transitionDuration);
ok('transitions suppressed under prefers-reduced-motion', parseFloat(dur) < 0.01, dur);

console.log('\n--- final error sweep ---');
ok('still no page errors', errors.length === 0, errors.join(' | '));
ok('still no external requests', netExternal.length === 0, netExternal.join(' | '));

await browser.close();
console.log('\n' + (fails === 0 ? 'ALL PASSED' : fails + ' FAILURE(S)'));
process.exit(fails ? 1 : 0);
