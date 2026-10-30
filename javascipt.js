'use strict';
/* kcal - Calorie Tracker. Vanilla JS, data kept in localStorage.
   Each food entry has: name, calories, protein (g) and a date. */
const KEY = 'thali.calorieTracker.v1';
const DEFAULT_GOALS = { cal: 2000, p: 100 };


/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const r1 = n => Math.round(n * 10) / 10;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nonNeg = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const dateOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(parseD(d));
const fmtDate = s => parseD(s).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const fmtShort = s => parseD(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Symbols as unicode escapes so the file works even if it is not saved as UTF-8.
const I_EDIT = '\u270F\uFE0F', I_DUP = '\u29C9', I_DEL = '\uD83D\uDDD1\uFE0F', I_X = '\u2715';
const I_SUN = '\u2600\uFE0F', I_MOON = '\uD83C\uDF19', I_CHECK = '\u2713', DOT = '\u00B7', DASH = '\u2013';

// Safe DOM creation: user text always goes through textContent.
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(text, label, fn) { const b = el('button', 'icon-btn', text); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.onclick = fn; return b; }
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }
function ask(msg, ok = 'Delete') {
  return new Promise(res => {
    const d = $('#dlg'); $('#dlgMsg').textContent = msg; $('#dlgOk').textContent = ok; d.returnValue = '';
    d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }); d.showModal();
  });
}


/* ---------- storage ---------- */
// Rebuilds a valid state from any (possibly corrupted, old or imported) object.
function clean(raw) {
  const s = { goals: { ...DEFAULT_GOALS }, theme: null, foods: [], quick: [] };
  if (!raw || typeof raw !== 'object') return s;
  for (const k in s.goals) { const v = parseFloat(raw.goals && raw.goals[k]); if (v > 0 && v < 100000) s.goals[k] = v; }
  if (raw.theme === 'light' || raw.theme === 'dark') s.theme = raw.theme;
  if (Array.isArray(raw.foods)) raw.foods.forEach(f => {
    if (f && typeof f.name === 'string' && f.name.trim() && dateOk(f.date)) {
      const q = nonNeg(f.qty, 1) || 1; // older backups stored per-serving values
      s.foods.push({ id: String(f.id || uid()), name: f.name.trim().slice(0, 60), cal: nonNeg(f.cal) * q, p: nonNeg(f.p) * q, date: f.date });
    }
  });
  // Saved quick-add foods persist on their own. Older data without them is seeded from logged foods.
  if (Array.isArray(raw.quick)) raw.quick.forEach(q => { if (q && typeof q.name === 'string' && q.name.trim()) upsertQuick(s.quick, { id: String(q.id || uid()), name: q.name.trim().slice(0, 60), cal: nonNeg(q.cal), p: nonNeg(q.p) }); });
  else s.foods.forEach(f => upsertQuick(s.quick, { id: uid(), name: f.name, cal: f.cal, p: f.p }));
  return s;
}
// Adds a quick-add item, or updates the values if a food with the same name is already saved.
function upsertQuick(list, item) {
  const i = list.findIndex(q => q.name.toLowerCase() === item.name.toLowerCase());
  if (i >= 0) list[i] = { ...item, id: list[i].id, name: list[i].name }; else list.push(item);
}
// Use localStorage if the browser allows it, otherwise fall back to window.name (survives reloads in the same tab).
const store = (() => {
  try { const k = '__kcal_test'; localStorage.setItem(k, k); localStorage.removeItem(k); return localStorage; }
  catch (e) { return null; }
})();
function load() {
  try {
    const txt = store ? store.getItem(KEY) : (window.name.startsWith('kcal:') ? window.name.slice(5) : null);
    return clean(JSON.parse(txt));
  } catch (e) { return clean(null); }
}
function save() {
  const json = JSON.stringify(state);
  try {
    if (store) store.setItem(KEY, json);
    else window.name = 'kcal:' + json;
  } catch (e) { toast('Could not save ' + DASH + ' browser storage is unavailable.'); }
}
let state = load();
let sel = today();   // date shown in Food and History
let view = 'home';


/* ---------- calculations ---------- */
function dayTotals(date) {
  const t = { cal: 0, p: 0 };
  state.foods.filter(f => f.date === date).forEach(f => { t.cal += f.cal; t.p += f.p; });
  return t;
}
const status = cal => cal <= 0 ? 'none' : cal > state.goals.cal * 1.05 ? 'over' : 'met';
const emptyState = text => el('p', 'empty-state', text);

/* ---------- food library + Menu module ---------- */
const ICONS = new Map((typeof FOOD_DB !== 'undefined' ? FOOD_DB : []).map(f => [f[1].toLowerCase(), f[0]]));
const withIcon = n => { const i = ICONS.get(n.toLowerCase()); return i ? i + ' ' + n : n; };

function updateMenuSummary() {
  const t = dayTotals(today());
  $('#mSum').textContent = `${Math.round(t.cal)} / ${Math.round(state.goals.cal)} kcal ${DOT} ${r1(t.p)} g protein`;
}
// Tap a card: log the food to today, update the badge and totals in place (list is not re-rendered).
function addMenu(f, node) {
  const [, name, cal, p] = f, toQuick = $('#mSave').checked;
  state.foods.push({ id: uid(), name, cal, p, date: today() });
  if (toQuick) upsertQuick(state.quick, { id: uid(), name, cal, p });
  save();
  const n = state.foods.filter(x => x.date === today() && x.name === name).length, c = node.querySelector('.cnt');
  c.textContent = '\u00D7' + n; c.hidden = false;
  node.classList.remove('added'); void node.offsetWidth; node.classList.add('added');
  const fl = el('span', 'floater', '+' + Math.round(cal) + ' kcal'); node.append(fl); fl.addEventListener('animationend', () => fl.remove());
  updateMenuSummary(); toast(toQuick ? `Added ${name} and saved to Quick add` : `Added ${name}`);
}
function renderMenu() {
  const grid = $('#mGrid'); grid.replaceChildren();
  if (typeof FOOD_DB === 'undefined') { grid.append(emptyState('foods-data.js is not loaded.')); return; }
  const q = $('#mSearch').value.trim().toLowerCase(), list = FOOD_DB.filter(f => f[1].toLowerCase().includes(q));
  const counts = new Map(); state.foods.forEach(x => { if (x.date === today()) counts.set(x.name, (counts.get(x.name) || 0) + 1); });
  $('#mCount').textContent = `${list.length} foods`; updateMenuSummary();
  if (!list.length) { grid.append(emptyState('No foods match your search.')); return; }
  list.forEach(f => {
    const [icon, name, cal, p] = f, d = el('div', 'mitem'), info = el('div', 'minfo'), cnt = el('span', 'cnt'), n = counts.get(name) || 0;
    d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', `Add ${name} to today`);
    info.append(el('b', '', name), el('small', '', `${cal} kcal ${DOT} ${r1(p)} g protein`));
    cnt.textContent = '\u00D7' + n; cnt.hidden = !n;
    d.append(el('span', 'micon', icon), info, cnt);
    d.onclick = () => addMenu(f, d);
    d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addMenu(f, d); } };
    grid.append(d);
  });
}


function entryRow(f, full) {
  const li = el('li', 'entry'), info = el('div', 'einfo');
  info.append(el('b', '', withIcon(f.name)), el('small', '', `Protein ${r1(f.p)} g${full ? ' ' + DOT + ' ' + fmtShort(f.date) : ''}`));
  li.append(info, el('span', 'kcal', Math.round(f.cal) + ' kcal'));
  if (full) { const a = el('div', 'acts'); a.append(btn(I_EDIT, 'Edit ' + f.name, () => editFood(f.id)), btn(I_DUP, 'Duplicate ' + f.name + ' to today', () => dupFood(f.id)), btn(I_DEL, 'Delete ' + f.name, () => delFood(f.id))); li.append(a); }
  return li;
}


/* ---------- animation helpers ---------- */
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Counts a number up or down smoothly instead of jumping.
function setNum(sel, to) {
  const e = $(sel), from = +e.dataset.v || 0; e.dataset.v = to;
  if (from === to || reduceMotion()) { e.textContent = to; return; }
  const t0 = performance.now();
  (function step(t) { const k = Math.min(1, (t - t0) / 600); e.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
}
// Bounce a quick-add button and float "+kcal" above it.
function celebrate(id, cal) {
  const w = document.querySelector(`[data-qid="${id}"]`); if (!w) return;
  const b = w.querySelector('.qmain'); b.classList.remove('added'); void b.offsetWidth; b.classList.add('added');
  const fl = el('span', 'floater', '+' + Math.round(cal) + ' kcal'); w.append(fl); fl.addEventListener('animationend', () => fl.remove());
}
const seenRows = new Set(), seenQuick = new Set(); let rowsInit = false, quickDragging = false, suppressClick = false;


/* ---------- Home ---------- */
function renderHome() {
  const t = dayTotals(today()), g = state.goals, pct = t.cal / g.cal;
  $('#todayDate').textContent = fmtDate(today());
  const fg = $('#ringFg'); fg.style.strokeDashoffset = 326.7 * (1 - Math.min(1, pct)); fg.classList.toggle('over', pct > 1);
  setNum('#ringVal', Math.round(t.cal)); $('#sGoal').textContent = Math.round(g.cal); setNum('#sEaten', Math.round(t.cal));
  const left = g.cal - t.cal;
  $('#sLeftLbl').textContent = left >= 0 ? 'Remaining' : 'Over by'; setNum('#sLeft', Math.round(Math.abs(left)));
  $('#motive').textContent = t.cal === 0 ? 'A fresh day. Log your first food to get started.'
    : pct < 0.5 ? 'Good start. Keep fuelling your day.' : pct < 0.9 ? 'Nice progress, you are over halfway to your goal.'
      : pct <= 1.05 ? 'Right on target. Great balance today!' : 'Over your goal today. A lighter next meal or a walk can balance it out.';
  $('#protTxt').textContent = `${r1(t.p)} / ${r1(g.p)} g`;
  const pb = $('#protBar'); pb.style.width = Math.min(100, t.p / g.p * 100) + '%'; pb.classList.toggle('over', t.p > g.p);
  $('#calTxt').textContent = `${Math.round(t.cal)} / ${Math.round(g.cal)} kcal`;
  const cb = $('#calBar'); cb.style.width = Math.min(100, pct * 100) + '%'; cb.classList.toggle('over', pct > 1);
  renderTodayTable(t); renderQuick();
}
// "Today's food" table with totals row and edit/delete actions.
function renderTodayTable(t) {
  const items = state.foods.filter(f => f.date === today()), body = $('#homeBody'), foot = $('#homeFoot');
  body.replaceChildren(); foot.replaceChildren();
  $('#homeTable').hidden = !items.length; $('#homeEmpty').hidden = items.length > 0;
  $('#homeTotal').textContent = items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : '';
  items.forEach(f => {
    const tr = el('tr'), act = el('td'), box = el('div', 'acts');
    box.append(btn(I_EDIT, 'Edit ' + f.name, () => { go('food'); editFood(f.id); }), btn(I_DEL, 'Delete ' + f.name, () => delFood(f.id))); act.append(box);
    if (rowsInit && !seenRows.has(f.id)) tr.className = 'rowin'; seenRows.add(f.id);
    tr.append(el('td', 'fname', withIcon(f.name)), el('td', 'num kc', Math.round(f.cal) + ' kcal'), act); body.append(tr);
  });
  rowsInit = true;
  if (items.length) { const tr = el('tr'); tr.append(el('td', '', 'Total'), el('td', 'num', Math.round(t.cal) + ' kcal'), el('td')); foot.append(tr); }
}
// Quick-add buttons: foods saved for future use. They are independent of logged entries.
function renderQuick() {
  const grid = $('#quickGrid'); grid.replaceChildren();
  $('#quickEmpty').hidden = state.quick.length > 0;
  state.quick.forEach((q, i) => {
    const wrap = el('div', 'qbtn'), b = el('button', 'qmain'); b.type = 'button'; wrap.dataset.qid = q.id;
    if (!seenQuick.has(q.id)) { wrap.classList.add('pop'); wrap.style.animationDelay = (i * 45) + 'ms'; seenQuick.add(q.id); }
    b.append(el('b', '', withIcon(q.name)), el('small', '', `${Math.round(q.cal)} kcal ${DOT} ${r1(q.p)} g protein`));
    b.onclick = () => { if (suppressClick) return; state.foods.push({ id: uid(), name: q.name, cal: q.cal, p: q.p, date: today() }); save(); render(); toast(`Added ${q.name}`); celebrate(q.id, q.cal); };
    wrap.append(b, btn(I_X, 'Remove ' + q.name + ' from quick add', async () => {
      if (await ask(`Remove "${q.name}" from Quick add? Foods already logged are not affected.`, 'Remove')) { state.quick = state.quick.filter(x => x.id !== q.id); save(); render(); toast('Removed from Quick add'); }
    }));
    enableDrag(wrap); grid.append(wrap);
  });
}
// Whole-button dragging. Mouse: press and move. Touch: press and hold briefly, then move
// (so normal swipes still scroll the page). A plain tap still adds the food.
// While dragging, the button floats above its slot, follows the finger with a soft lag,
// tilts with the motion, and the other buttons glide aside. Alt + arrows also reorder.
function enableDrag(wrap) {
  const card = wrap.querySelector('.qmain'), calm = reduceMotion();
  let sx, sy, px, py, offX, offY, vx, vy, sc, pid, timer, raf, lastSwap = 0, pending = false, active = false;
  const buzz = ms => { if (navigator.vibrate) navigator.vibrate(ms); };
  const begin = () => {
    pending = false; active = quickDragging = true;
    const r = wrap.getBoundingClientRect(); offX = px - r.left; offY = py - r.top; vx = r.left; vy = r.top; sc = 1;
    wrap.style.animation = 'none'; wrap.classList.add('dragging'); wrap.parentNode.classList.add('sorting');
    try { wrap.setPointerCapture(pid); } catch (e) { /* pointer already released */ }
    buzz(10); raf = requestAnimationFrame(frame);
  };
  // One animation frame: auto-scroll, swap places if needed, then ease the card toward the pointer.
  const frame = () => {
    if (!active) return;
    if (py < 70) window.scrollBy(0, -10); else if (py > innerHeight - 70) window.scrollBy(0, 10);
    const now = performance.now(), grid = wrap.parentNode;
    if (now - lastSwap > 140) {   // short cooldown lets the sliding animation finish
      const sibs = [...grid.children];
      const over = sibs.find(s => {
        if (s === wrap) return false; const r = s.getBoundingClientRect(), mx = r.width * .15, my = r.height * .15;
        return px > r.left + mx && px < r.right - mx && py > r.top + my && py < r.bottom - my;
      });
      if (over) {   // FLIP: move in the DOM, then glide the other buttons from their old spots
        const before = new Map(sibs.map(s => [s, s.getBoundingClientRect()]));
        grid.insertBefore(wrap, sibs.indexOf(over) > sibs.indexOf(wrap) ? over.nextSibling : over);
        sibs.forEach(s => {
          if (s === wrap) return; const a = before.get(s), b = s.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
          if (dx || dy) s.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: calm ? 1 : 320, easing: 'cubic-bezier(.34,1.35,.5,1)' });
        });
        lastSwap = now; buzz(6);
      }
    }
    const tx = px - offX, ty = py - offY, k = calm ? 1 : .35;
    vx += (tx - vx) * k; vy += (ty - vy) * k; sc += (1.06 - sc) * .25;
    const tilt = calm ? 0 : Math.max(-12, Math.min(12, (tx - vx) * .25)), r = wrap.getBoundingClientRect();
    card.style.transform = `translate(${vx - r.left}px,${vy - r.top}px) rotate(${tilt}deg) scale(${sc})`;
    raf = requestAnimationFrame(frame);
  };
  const end = () => {
    clearTimeout(timer); pending = false; if (!active) return;
    active = quickDragging = false; cancelAnimationFrame(raf); suppressClick = true; setTimeout(() => { suppressClick = false; }, 120);
    const cur = card.style.transform; card.style.transition = 'none'; card.style.transform = '';
    wrap.classList.remove('dragging'); wrap.parentNode.classList.remove('sorting');
    card.animate([{ transform: cur }, { transform: 'none' }], { duration: calm ? 1 : 400, easing: 'cubic-bezier(.3,1.5,.5,1)' }).onfinish = () => { card.style.transition = ''; };
    const order = [...wrap.parentNode.children].map(w => w.dataset.qid);
    state.quick.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); save();
  };
  wrap.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('.icon-btn')) return;
    sx = px = e.clientX; sy = py = e.clientY; pid = e.pointerId; pending = true;
    if (e.pointerType !== 'mouse') timer = setTimeout(() => { if (pending) begin(); }, 280);
  });
  wrap.addEventListener('pointermove', e => {
    px = e.clientX; py = e.clientY;
    if (active || !pending) return;
    const dist = Math.hypot(px - sx, py - sy);
    if (e.pointerType === 'mouse') { if (dist > 6) begin(); }
    else if (dist > 10) { clearTimeout(timer); pending = false; }   // finger is scrolling
  });
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('contextmenu', e => { if (pending || active) e.preventDefault(); });
  wrap.addEventListener('keydown', e => {
    const d = e.altKey && { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!d) return; e.preventDefault();
    const id = wrap.dataset.qid, i = state.quick.findIndex(q => q.id === id), j = i + d; if (j < 0 || j >= state.quick.length) return;
    [state.quick[i], state.quick[j]] = [state.quick[j], state.quick[i]]; save(); render();
    const again = document.querySelector(`[data-qid="${id}"] .qmain`); if (again) again.focus();
  });
}
function readQuick() {
  const name = $('#qName').value.trim(), cal = parseFloat($('#qCal').value), p = $('#qP').value === '' ? 0 : parseFloat($('#qP').value), err = $('#qErr');
  err.textContent = '';
  if (!name) err.textContent = 'Enter a food name.';
  else if (!Number.isFinite(cal) || cal < 0 || cal > 10000) err.textContent = 'Calories must be a number from 0 to 10,000.';
  else if (!Number.isFinite(p) || p < 0 || p > 2000) err.textContent = 'Protein must be 0 or more grams.';
  return err.textContent ? null : { name: name.slice(0, 60), cal, p };
}
function finishQuick(msg) { $('#quickForm').reset(); save(); render(); toast(msg); $('#qName').focus(); }
function submitQuick(e) {   // log to today, and optionally keep as a button
  e.preventDefault(); const v = readQuick(); if (!v) return;
  if ($('#qSave').checked) upsertQuick(state.quick, { id: uid(), ...v });
  state.foods.push({ id: uid(), ...v, date: today() }); finishQuick(`Added ${v.name}`);
}


/* ---------- Food ---------- */
function resetForm() {
  $('#foodForm').reset(); $('#fId').value = ''; $('#fDate').value = sel;
  $('#formTitle').textContent = 'Add food'; $('#fSubmit').textContent = 'Add food'; $('#fCancel').hidden = true; $('#fErr').textContent = '';
}
function readForm() {
  const name = $('#fName').value.trim(), cal = parseFloat($('#fCal').value), p = $('#fP').value === '' ? 0 : parseFloat($('#fP').value);
  if (!name) return { err: 'Enter a food name.' };
  if (!Number.isFinite(cal) || cal < 0 || cal > 10000) return { err: 'Calories must be a number from 0 to 10,000.' };
  if (!Number.isFinite(p) || p < 0 || p > 2000) return { err: 'Protein must be 0 or more grams.' };
  if (!dateOk($('#fDate').value)) return { err: 'Choose a valid date.' };
  return { f: { name: name.slice(0, 60), cal, p, date: $('#fDate').value } };
}
function submitFood(e) {
  e.preventDefault(); const r = readForm();
  if (r.err) { $('#fErr').textContent = r.err; return; }
  const id = $('#fId').value;
  if (id) { const i = state.foods.findIndex(x => x.id === id); if (i >= 0) state.foods[i] = { ...r.f, id }; toast('Entry updated'); }
  else { state.foods.push({ ...r.f, id: uid() }); toast(`Added ${r.f.name}`); }
  sel = r.f.date; save(); resetForm(); render(); $('#fName').focus();
}
function editFood(id) {
  const f = state.foods.find(x => x.id === id); if (!f) return;
  sel = f.date; render();
  $('#fId').value = f.id; $('#fName').value = f.name; $('#fCal').value = r1(f.cal); $('#fP').value = r1(f.p); $('#fDate').value = f.date;
  $('#formTitle').textContent = 'Edit food'; $('#fSubmit').textContent = 'Save changes'; $('#fCancel').hidden = false;
  $('#foodForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#fName').focus();
}
function dupFood(id) {
  const f = state.foods.find(x => x.id === id); if (!f) return;
  state.foods.push({ ...f, id: uid(), date: today() }); save(); render(); toast(`Duplicated ${f.name} to today`);
}
async function delFood(id) {
  const f = state.foods.find(x => x.id === id); if (!f) return;
  if (await ask(`Delete "${f.name}"?`)) { state.foods = state.foods.filter(x => x.id !== id); if ($('#fId').value === id) resetForm(); save(); render(); toast('Entry deleted'); }
}
function renderEntries() {
  const q = $('#entrySearch').value.trim().toLowerCase(), ul = $('#entryList'); ul.replaceChildren();
  const list = q ? state.foods.filter(f => f.name.toLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date))
    : state.foods.filter(f => f.date === sel);
  const t = dayTotals(sel);
  $('#entryTotal').textContent = q ? `${list.length} found` : `${Math.round(t.cal)} kcal ${DOT} ${r1(t.p)} g protein`;
  if (!list.length) ul.append(emptyState(q ? 'No entries match your search.' : 'No food logged for this day. Add one above.'));
  list.forEach(f => ul.append(entryRow(f, true)));
}


function renderHistory() {
  const t = dayTotals(sel), g = state.goals, st = status(t.cal);
  $('#hDay').textContent = fmtDate(sel); $('#hCal').textContent = Math.round(t.cal) + ' kcal'; $('#hGoal').textContent = `of ${Math.round(g.cal)} goal`;
  const bd = $('#hBadge'); bd.className = 'badge ' + (st === 'over' ? 'over' : st === 'none' ? 'none' : '');
  bd.textContent = st === 'met' ? I_CHECK + ' Goal met' : st === 'over' ? 'Over goal' : 'Nothing logged';
  $('#hProt').textContent = `Protein: ${r1(t.p)} / ${r1(g.p)} g`;
  const days = []; for (let i = 6; i >= 0; i--) days.push(addDays(sel, -i));
  const tot = days.map(d => dayTotals(d)), vals = tot.map(x => x.cal), max = Math.max(g.cal, ...vals) * 1.1;
  const plot = $('#plot'), lbl = $('#plotLbl'), wk = $('#weekList'); plot.replaceChildren(); lbl.replaceChildren(); wk.replaceChildren();
  const line = el('div', 'goalline'); line.style.bottom = (g.cal / max * 100) + '%'; plot.append(line);
  days.forEach((d, i) => {
    const name = parseD(d).toLocaleDateString(undefined, { weekday: 'short' }), s = status(vals[i]);
    const col = el('button', 'col' + (d === sel ? ' sel' : '')); col.type = 'button'; col.setAttribute('aria-label', `${fmtShort(d)}: ${Math.round(vals[i])} kcal`);
    const bar = el('i', s === 'over' ? 'over' : ''); bar.style.height = (vals[i] / max * 100) + '%'; col.append(bar); col.onclick = () => { sel = d; render(); }; plot.append(col);
    lbl.append(el('span', '', `${name}\n${Math.round(vals[i])}`));
    const li = el('li', 'entry'), b = el('button', 'pick'); b.type = 'button';
    const info = el('span', 'einfo'); info.append(el('b', '', fmtDate(d)), el('small', '', `${Math.round(vals[i])} / ${Math.round(g.cal)} kcal ${DOT} ${r1(tot[i].p)} g protein`));
    const badge = el('span', 'badge ' + (s === 'over' ? 'over' : s === 'none' ? 'none' : ''), s === 'met' ? I_CHECK + ' Met' : s === 'over' ? 'Over' : DASH);
    b.append(info, badge); b.onclick = () => { sel = d; render(); }; li.append(b); wk.append(li);
  });
  lbl.style.whiteSpace = 'pre-line';
  const logged = vals.filter(v => v > 0);
  $('#avg').textContent = logged.length ? `${Math.round(logged.reduce((a, b) => a + b, 0) / logged.length)} kcal/day (${logged.length} day${logged.length > 1 ? 's' : ''} logged)` : 'no data yet';
}


/* ---------- Settings, theme, data ---------- */
function applyTheme() {
  const dark = state.theme ? state.theme === 'dark' : window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'; $('#themeBtn').textContent = dark ? I_SUN : I_MOON; $('#gTheme').value = dark ? 'dark' : 'light';
}
function fillSettings() { $('#gCal').value = state.goals.cal; $('#gP').value = state.goals.p; }
function saveGoals(e) {
  e.preventDefault(); const cal = parseFloat($('#gCal').value), p = parseFloat($('#gP').value);
  if (!(cal > 0 && cal < 100000 && p > 0 && p < 100000)) { $('#gErr').textContent = 'Calorie and protein goals must be greater than 0.'; return; }
  $('#gErr').textContent = ''; state.goals = { cal, p }; state.theme = $('#gTheme').value; save(); applyTheme(); render(); toast('Settings saved');
}
function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'kcal', version: 1, ...state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kcal-backup-${today()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup file exported');
}
function importData(file) {
  if (!file) return; const r = new FileReader();
  r.onload = async () => {
    let raw; try { raw = JSON.parse(r.result); } catch (e) { toast('That file is not valid JSON.'); return; }
    if (!raw || !Array.isArray(raw.foods)) { toast('That file is not a kcal backup.'); return; }
    const next = clean(raw);
    if (await ask(`Import ${next.foods.length} food entries? This replaces your current data.`, 'Import')) { state = next; save(); applyTheme(); fillSettings(); resetForm(); render(); toast('Data imported'); }
  };
  r.onerror = () => toast('Could not read the file.'); r.readAsText(file); $('#importFile').value = '';
}
async function clearAll() {
  if (await ask('Delete ALL food entries and settings from this browser? This cannot be undone.', 'Clear everything')) { state = clean(null); save(); sel = today(); applyTheme(); fillSettings(); resetForm(); render(); toast('All data cleared'); }
}


/* ---------- navigation & render ---------- */
const TITLES = { home: 'Home', food: 'Food', menu: 'Menu', history: 'History', settings: 'Settings' };
function go(name) {
  if (!TITLES[name]) name = 'home'; view = name;
  $$('.view').forEach(v => { v.hidden = v.id !== name; });
  $$('[data-go]').forEach(b => { if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#title').textContent = TITLES[name]; if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name); window.scrollTo(0, 0); render();
}
function render() {
  $$('[data-sel]').forEach(i => { i.value = sel; });
  if (!$('#fId').value && document.activeElement !== $('#fDate')) $('#fDate').value = sel;
  if (view === 'home') renderHome();
  if (view === 'food') renderEntries();
  if (view === 'menu') renderMenu();
  if (view === 'history') renderHistory();
}
function init() {
  $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('#quickForm').onsubmit = submitQuick;
  $('#quickGrid').addEventListener('touchmove', e => { if (quickDragging) e.preventDefault(); }, { passive: false });
  $('#themeBtn').onclick = () => { state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); };
  $$('.datenav').forEach(n => {
    n.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { sel = b.dataset.d === '0' ? today() : addDays(sel, +b.dataset.d); render(); });
    n.querySelector('[data-sel]').onchange = e => { if (dateOk(e.target.value)) sel = e.target.value; render(); };
  });
  $('#foodForm').onsubmit = submitFood; $('#fCancel').onclick = resetForm; $('#entrySearch').oninput = renderEntries;
  $('#goalForm').onsubmit = saveGoals; $('#exportBtn').onclick = exportData;
  $('#importBtn').onclick = () => $('#importFile').click(); $('#importFile').onchange = e => importData(e.target.files[0]);
  $('#clearBtn').onclick = clearAll;
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  applyTheme(); fillSettings(); resetForm(); go(location.hash.slice(1));
  $('#mSearch').oninput = renderMenu;
}
init();