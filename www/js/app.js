(function () {
'use strict';
const L = window.Logic;
const KEY = 'satyam_agarbatti_v1', SESSION = 'satyam_session_v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nf = n => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 });

/* ---------------- storage ---------------- */
let S = null, ME = null;
const ui = { tab: 'home', range: '7', ordFilter: 'all', q: '', ordDate: '', ordLimit: 60, repRange: '30', dataTab: 'sku' };
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save. Phone storage may be full.'); } }
function ctx() { return { masters: S.masters, calendar: S.calendar, skuMap: S.skuMap, cutoff: S.settings.cutoff }; }

async function sha(str) {
  try {
    if (crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  } catch (e) {}
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;   // fallback for very old WebViews
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'f' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
async function makeUser(username, name, role, pw, mustChange) {
  const salt = uid('s'); return { id: uid('u'), username, name, role, salt, hash: await sha(salt + ':' + pw), mustChange: !!mustChange };
}
async function init() {
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !S.users) {
    const seed = window.SEED;
    S = { v: 1, users: [await makeUser('admin', 'Owner', 'admin', 'admin123', true)], settings: { cutoff: '19:00', company: 'Satyam Agarbatti' },
      masters: seed.masters, calendar: seed.calendar, skuMap: {}, orders: seed.orders, history: seed.history };
    persist();
  }
  try { const s = JSON.parse(localStorage.getItem(SESSION)); if (s && s.exp > Date.now()) ME = S.users.find(u => u.id === s.uid) || null; } catch (e) {}
  render();
}
const can = () => ME && ME.role === 'admin';

/* ---------------- helpers ---------------- */
function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
function sheet(title, body, onMount) {
  const layer = $('#layer');
  layer.innerHTML = `<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="btn ghost sm" data-act="close">Close</button></header>${body}</div></div>`;
  if (onMount) onMount();
}
function closeSheet() { $('#layer').innerHTML = ''; }
function ask(msg, okLabel) {
  return new Promise(res => {
    const prev = $('#layer').innerHTML;
    const el = document.createElement('div'); el.className = 'scrim'; el.style.zIndex = 40; el.style.alignItems = 'center';
    el.innerHTML = `<div class="card" style="max-width:360px;margin:16px" role="alertdialog"><p style="margin:0 0 14px;font-weight:600">${esc(msg)}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost sm" id="n">Cancel</button><button class="btn danger sm" id="y">${esc(okLabel || 'Confirm')}</button></div></div>`;
    document.body.appendChild(el);
    el.querySelector('#n').onclick = () => { el.remove(); res(false); };
    el.querySelector('#y').onclick = () => { el.remove(); res(true); };
  });
}
async function saveFile(name, text, mime) {
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (P && P.Filesystem && P.Share) {
    try {
      const r = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: name, url: r.uri, dialogTitle: 'Save or share ' + name }); return;
    } catch (e) { if (e && /cancel/i.test(String(e.message || e))) return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const todayISO = () => L.toISO(new Date());
function derivedAll() { const c = ctx(); return S.orders.map(o => ({ o, d: L.derive(o, c) })); }
function latestDate(all) {
  let m = ''; all.forEach(x => { if (x.d.finalDate > m) m = x.d.finalDate; }); S.history.forEach(h => { if (h.date > m) m = h.date; });
  return m || todayISO();
}
function rangeFrom(key, latest) { return key === 'all' ? '' : key === 'day' ? latest : L.addDays(latest, -(Number(key) - 1)); }
const ICON = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>'
};

/* ---------------- render ---------------- */
function render() {
  const app = $('#app');
  if (!ME) { app.innerHTML = loginView(); return; }
  const titles = { home: 'Dashboard', orders: 'Orders', report: 'Daily report', data: 'Masters', settings: 'Settings' };
  const tabs = [['home', 'Home', 'home'], ['orders', 'Orders', 'box'], ['report', 'Report', 'grid'], ['data', 'Masters', 'list'], ['settings', 'Settings', 'gear']];
  const view = { home: homeView, orders: ordersView, report: reportView, data: dataView, settings: settingsView }[ui.tab]();
  app.innerHTML = `<header class="topbar"><h1>${esc(S.settings.company)}<span class="sub">${esc(titles[ui.tab])}</span></h1><button data-act="logout" aria-label="Sign out">${esc(ME.name)} · Sign out</button></header>
  <main id="main">${view}</main>
  ${ui.tab === 'orders' ? '<button class="fab" data-act="order-new">+ Add order</button>' : ''}
  <nav class="tabs" aria-label="Main">${tabs.map(t => `<button data-act="tab" data-tab="${t[0]}" ${ui.tab === t[0] ? 'aria-current="page"' : ''}>${ICON[t[2]]}${t[1]}</button>`).join('')}</nav>`;
}

function loginView() {
  return `<form class="login" id="loginForm" autocomplete="off">
    <div class="mark"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M12 3c1.5 2 1.5 3.500 0 5M12 8v13M8 21h8"/><path d="M9 11l-2 10M15 11l2 10" opacity=".0"/></svg></div>
    <h1>${esc(S.settings.company)}</h1><p class="muted" style="margin:0 0 20px">Sign in to manage orders and the daily dispatch report.</p>
    <div class="field"><label class="f" for="lu">Username</label><input id="lu" type="text" autocapitalize="none" autocorrect="off" required></div>
    <div class="field"><label class="f" for="lp">Password</label><input id="lp" type="password" required></div>
    <label class="row small" style="margin-bottom:6px"><input type="checkbox" id="lr" checked style="width:20px;height:20px"> Stay signed in for 30 days</label>
    <div class="err" id="lerr" role="alert"></div>
    <button class="btn" type="submit" style="width:100%">Sign in</button>
    <p class="muted small" style="margin-top:16px">First time? Username <b>admin</b>, password <b>admin123</b>. You will be asked to change it.</p></form>`;
}
let fails = 0, lockUntil = 0;
async function doLogin() {
  const err = $('#lerr');
  if (Date.now() < lockUntil) { err.textContent = 'Too many tries. Wait ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' seconds.'; return; }
  const u = S.users.find(x => x.username.toLowerCase() === $('#lu').value.trim().toLowerCase());
  const ok = u && (await sha(u.salt + ':' + $('#lp').value)) === u.hash;
  if (!ok) { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } err.textContent = 'Wrong username or password.'; return; }
  fails = 0; ME = u;
  try { localStorage.setItem(SESSION, JSON.stringify({ uid: u.id, exp: Date.now() + ($('#lr').checked ? 30 : 0.5) * 864e5 })); } catch (e) {}
  ui.tab = 'home'; render();
}

/* ---------------- dashboard ---------------- */
function homeView() {
  const all = derivedAll(), latest = latestDate(all), from = rangeFrom(ui.range, latest);
  const inR = d => !from || (d >= from && d <= latest);
  const rows = all.filter(x => inR(x.d.finalDate));
  const hist = S.history.filter(h => inR(h.date));
  const orders = rows.length + hist.reduce((a, h) => a + Number(h.count), 0);
  const units = rows.reduce((a, x) => a + x.d.qty, 0);
  const raw = rows.reduce((a, x) => a + x.d.totalRaw, 0) / 1000, packed = rows.reduce((a, x) => a + x.d.packed, 0) / 1000;
  const noPat = all.filter(x => !x.d.known).length, shifted = rows.filter(x => x.d.shifted).length;
  const rep = L.buildReport(S.orders, S.history, ctx(), { from, to: latest });
  const days = rep.rows.slice(-14), maxDay = Math.max(1, ...days.map(r => r.total));
  const mix = {}; rep.rows.forEach(r => Object.entries(r.cells).forEach(([c, n]) => mix[c] = (mix[c] || 0) + n));
  const mixList = Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 8), maxMix = Math.max(1, ...mixList.map(x => x[1]));
  const prod = {}; rows.forEach(x => { const k = L.norm(x.o.sku); (prod[k] = prod[k] || { sku: x.o.sku, q: 0 }).q += x.d.qty; });
  const top = Object.values(prod).sort((a, b) => b.q - a.q).slice(0, 5), maxP = Math.max(1, ...top.map(p => p.q));
  const chip = (k, t) => `<button class="chip" data-act="range" data-k="${k}" aria-pressed="${ui.range === k}">${t}</button>`;
  const pw = ME.mustChange ? `<button class="alert" data-act="goto" data-tab="settings">Change the default password now. Tap to open Settings.</button>` : '';
  return `<div class="stack">${pw}
  <div><div class="chips">${chip('day', 'Latest day')}${chip('7', '7 days')}${chip('30', '30 days')}${chip('all', 'All')}</div>
  <div class="muted small" style="margin-top:6px">${from ? L.fmtDate(from) + ' to ' : 'Up to '}${L.fmtDate(latest)} (by dispatch date)</div></div>
  ${noPat ? `<button class="alert" data-act="goto-filter" data-f="nopattern">${noPat} order${noPat > 1 ? 's' : ''} need a SKU pattern. Tap to fix.</button>` : ''}
  <div class="kpis">
    <div class="kpi"><div class="v">${nf(orders)}</div><div class="l">Orders to dispatch</div></div>
    <div class="kpi"><div class="v">${nf(units)}<small>units</small></div><div class="l">Quantity ordered</div></div>
    <div class="kpi"><div class="v">${nf(raw)}<small>kg</small></div><div class="l">Raw agarbatti needed</div></div>
    <div class="kpi"><div class="v">${nf(packed)}<small>kg</small></div><div class="l">Packed weight</div></div>
  </div>
  ${shifted ? `<div class="alert info" role="note">${shifted} order${shifted > 1 ? 's were' : ' was'} moved to a later day (after cutoff, Sunday or holiday).</div>` : ''}
  <section class="card"><h2 class="h2">Orders per day</h2>${days.length ? `<div class="bars" role="img" aria-label="Orders per day">${days.map(r => `<div class="b"><em>${r.total}</em><i style="height:${Math.max(3, r.total / maxDay * 78)}px"></i><span>${L.parseISO(r.date).getDate()}</span></div>`).join('')}</div>` : '<div class="empty"><b>No orders in this period</b>Add or import orders to see them here.</div>'}</section>
  <section class="card"><h2 class="h2">Dispatch labels</h2>${mixList.map(([c, n]) => `<div class="hbar"><span class="tag ${c.includes('Zip') ? 'zip' : ''}">${esc(c.replace(' Zip', ''))}${c.includes('Zip') ? 'z' : ''}</span><div class="t"><i style="width:${n / maxMix * 100}%"></i></div><b class="num">${n}</b></div>`).join('') || '<div class="muted">Nothing yet.</div>'}
  <div class="muted small" style="margin-top:6px">Labels starting 10- are loose packs by weight in grams; 00- (z) are zipper packs by number of pouches.</div></section>
  <section class="card"><h2 class="h2">Top products by quantity</h2>${top.map(p => `<div class="hbar" style="grid-template-columns:1fr 34px;"><div><div class="small" style="overflow-wrap:anywhere">${esc(p.sku)}</div><div class="t" style="margin-top:3px"><i style="width:${p.q / maxP * 100}%"></i></div></div><b class="num">${p.q}</b></div>`).join('') || '<div class="muted">Nothing yet.</div>'}</section>
  </div>`;
}

/* ---------------- orders ---------------- */
function filteredOrders() {
  const q = ui.q.trim().toLowerCase();
  let rows = derivedAll().filter(x => {
    if (ui.ordFilter === 'nopattern' && x.d.known) return false;
    if (ui.ordFilter === 'shifted' && !x.d.shifted) return false;
    if (ui.ordDate && x.d.finalDate !== ui.ordDate) return false;
    if (q && !(x.o.orderId + ' ' + x.o.sku + ' ' + x.d.col + ' ' + x.d.pattern).toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => (b.d.finalDate + b.o.dispatchAfter).localeCompare(a.d.finalDate + a.o.dispatchAfter));
  return rows;
}
function orderCard(x) {
  const { o, d } = x;
  return `<button class="o" data-act="order-edit" data-id="${o.id}"><div class="top"><div class="grow"><div class="sku">${esc(o.sku)}</div><div class="id">${esc(o.orderId)}</div></div><span class="tag ${d.zip ? 'zip' : ''}">${esc(d.col)}</span></div>
  <div class="meta"><span class="num"><b>${d.qty}</b> × ${d.known ? esc(d.pattern) : '?'}</span>${d.known ? `<span class="num">${nf(d.totalRaw)} g raw</span>` : '<span class="flag">Needs SKU pattern</span>'}
  <span>Dispatch ${esc(L.fmtDate(d.finalDate, true))}</span>${d.shifted ? `<span class="flag info">Moved: ${esc(d.shiftReason === '-' ? 'after cutoff' : d.shiftReason)}</span>` : ''}</div></button>`;
}
function ordersView() {
  const rows = filteredOrders(), shown = rows.slice(0, ui.ordLimit);
  const chip = (k, t) => `<button class="chip" data-act="ofilter" data-k="${k}" aria-pressed="${ui.ordFilter === k}">${t}</button>`;
  return `<div class="stack"><div class="row"><input id="oq" type="search" placeholder="Search order id, SKU or label" value="${esc(ui.q)}" aria-label="Search orders"><button class="btn alt sm" data-act="import">Import CSV</button></div>
  <div class="row"><div class="chips grow">${chip('all', 'All')}${chip('nopattern', 'Needs pattern')}${chip('shifted', 'Moved')}</div><input id="od" type="date" value="${esc(ui.ordDate)}" style="width:150px" aria-label="Filter by dispatch date"></div>
  <div class="muted small">${rows.length} order${rows.length === 1 ? '' : 's'}</div>
  <div class="olist">${shown.map(orderCard).join('') || '<div class="empty"><b>No orders found</b>Add an order or import your marketplace CSV.</div>'}</div>
  ${rows.length > shown.length ? `<button class="btn ghost" style="width:100%" data-act="more">Show more (${rows.length - shown.length} left)</button>` : ''}</div>`;
}
function orderForm(o) {
  o = o || { orderId: '', sku: '', invoiceDate: todayISO(), quantity: 1, dispatchAfter: todayISO() + 'T16:00', pattern: '' };
  const skus = [...new Set(S.orders.map(x => x.sku))].sort();
  return `<form id="oform" data-id="${o.id || ''}" autocomplete="off">
  <div class="field"><label class="f" for="f_oid">Order Id</label><input id="f_oid" type="text" value="${esc(o.orderId)}" required></div>
  <div class="field"><label class="f" for="f_sku">SKU</label><input id="f_sku" type="text" list="skus" value="${esc(o.sku)}" required><datalist id="skus">${skus.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
  <div class="grid2"><div class="field"><label class="f" for="f_qty">Quantity</label><input id="f_qty" type="number" inputmode="numeric" min="1" step="1" value="${esc(o.quantity)}" required></div>
  <div class="field"><label class="f" for="f_inv">Invoice date</label><input id="f_inv" type="date" value="${esc(o.invoiceDate)}" required></div></div>
  <div class="field"><label class="f" for="f_disp">Dispatch after (date and time)</label><input id="f_disp" type="datetime-local" value="${esc(o.dispatchAfter)}" required></div>
  <div class="field"><label class="f" for="f_pat">SKU pattern</label><select id="f_pat"></select></div>
  <div class="preview" id="prev" aria-live="polite"></div>
  <div class="err" id="oerr" role="alert"></div>
  <div class="row"><button class="btn grow" type="submit">Save order</button>${o.id && can() ? '<button class="btn danger" type="button" data-act="order-del">Delete</button>' : ''}</div></form>`;
}
function readOrderForm() {
  return { orderId: $('#f_oid').value.trim(), sku: $('#f_sku').value.trim(), quantity: Number($('#f_qty').value), invoiceDate: $('#f_inv').value, dispatchAfter: $('#f_disp').value, pattern: $('#f_pat').value };
}
function refreshOrderPreview() {
  const f = readOrderForm(), c = ctx();
  const auto = L.detectPattern(f.sku, S.masters, S.skuMap), sel = $('#f_pat'), cur = sel.value;
  sel.innerHTML = `<option value="">Auto: ${auto ? esc(auto) : 'not found, please choose'}</option>` + S.masters.map(m => `<option value="${esc(m.pattern)}">${esc(m.pattern)} (${m.weight} g × ${m.pieces})</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
  const d = L.derive(f, c);
  $('#prev').innerHTML = d.known ? `<dl><dt>Dispatch label</dt><dd><span class="tag ${d.zip ? 'zip' : ''}">${esc(d.col)}</span></dd><dt>Raw agarbatti</dt><dd class="num">${nf(d.totalRaw)} g</dd><dt>Packed weight</dt><dd class="num">${nf(d.packed)} g</dd><dt>Business date</dt><dd>${esc(L.fmtDate(d.businessDate, true))}</dd><dt>Report date</dt><dd>${esc(L.fmtDate(d.finalDate, true))}${d.shifted && d.shiftReason !== '-' ? ' (' + esc(d.shiftReason) + ')' : ''}</dd></dl>` : '<b>Choose a SKU pattern above.</b> The label and weights will appear once it is set.';
}
function openOrder(id) {
  const o = id ? S.orders.find(x => x.id === id) : null;
  sheet(o ? 'Edit order' : 'Add order', orderForm(o), () => {
    const sel = $('#f_pat'); refreshOrderPreview(); if (o && o.pattern) { sel.value = o.pattern; refreshOrderPreview(); }
    $('#oform').addEventListener('input', refreshOrderPreview);
  });
}
function saveOrder() {
  const f = readOrderForm(), id = $('#oform').dataset.id, err = $('#oerr');
  if (!f.orderId || !f.sku) return err.textContent = 'Order Id and SKU are required.';
  if (!(f.quantity > 0)) return err.textContent = 'Quantity must be 1 or more.';
  if (!f.invoiceDate || !f.dispatchAfter) return err.textContent = 'Enter the invoice date and dispatch time.';
  if (S.orders.some(x => x.id !== id && x.orderId === f.orderId && L.norm(x.sku) === L.norm(f.sku) && x.dispatchAfter === f.dispatchAfter)) return err.textContent = 'This order is already saved.';
  if (!L.detectPattern(f.sku, S.masters, S.skuMap) && !f.pattern) return err.textContent = 'Choose a SKU pattern first.';
  if (f.pattern) S.skuMap[L.norm(f.sku)] = f.pattern;   // remember it for next time
  if (id) Object.assign(S.orders.find(x => x.id === id), f); else S.orders.push({ id: uid('o'), ...f });
  persist(); closeSheet(); render(); toast('Order saved');
}

/* ---------------- import ---------------- */
function openImport() {
  sheet('Import orders from CSV', `<div class="stack"><p class="muted small" style="margin:0">Use your marketplace export with the columns Order Id, SKU, Invoice Date, Quantity and Dispatch After date. Orders already saved are skipped.</p>
  <input type="file" id="ifile" accept=".csv,.tsv,.txt,text/csv,text/plain"><div class="muted small">or paste the rows here</div><textarea id="itext" rows="6" placeholder="Order Id,SKU,Invoice Date,Quantity,Dispatch After date"></textarea>
  <div class="err" id="ierr" role="alert"></div><button class="btn" data-act="import-run" style="width:100%">Import orders</button></div>`, () => {
    $('#ifile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#itext').value = r.result; }; r.readAsText(f); });
  });
}
function runImport() {
  const text = $('#itext').value; if (!text.trim()) return $('#ierr').textContent = 'Choose a file or paste your rows first.';
  const r = L.importOrders(text, S.orders); if (r.error) return $('#ierr').textContent = r.error;
  S.orders.push(...r.added); persist(); closeSheet();
  const need = r.added.filter(o => !L.detectPattern(o.sku, S.masters, S.skuMap)).length;
  render(); toast(`Added ${r.added.length}, skipped ${r.skipped} duplicate${r.skipped === 1 ? '' : 's'}` + (r.bad.length ? `, ${r.bad.length} bad row${r.bad.length > 1 ? 's' : ''}` : '') + (need ? `. ${need} need a SKU pattern.` : ''));
}

/* ---------------- report ---------------- */
function reportView() {
  const all = derivedAll(), latest = latestDate(all), from = rangeFrom(ui.repRange, latest);
  const rep = L.buildReport(S.orders, S.history, ctx(), { from, to: latest });
  const max = Math.max(1, ...rep.rows.flatMap(r => Object.values(r.cells)));
  const chip = (k, t) => `<button class="chip" data-act="rrange" data-k="${k}" aria-pressed="${ui.repRange === k}">${t}</button>`;
  const colTot = c => rep.rows.reduce((a, r) => a + (r.cells[c] || 0), 0);
  const tbl = rep.rows.length ? `<div class="tablewrap"><table class="rep"><thead><tr><th>Date</th>${rep.cols.map(c => `<th><span class="tag ${c.includes('Zip') ? 'zip' : ''}">${esc(c.replace(' Zip', ''))}${c.includes('Zip') ? 'z' : ''}</span></th>`).join('')}<th class="tot">Total</th></tr></thead>
  <tbody>${rep.rows.map(r => `<tr><td>${esc(L.fmtDate(r.date, true))}${r.reasons.size ? `<div class="muted small" style="font-weight:400">${esc([...r.reasons].join(', '))}</div>` : ''}</td>${rep.cols.map(c => { const n = r.cells[c] || 0; return n ? `<td class="c" style="background:rgba(233,162,27,${(0.12 + 0.55 * n / max).toFixed(2)})"><button data-act="cell" data-d="${r.date}" data-c="${esc(c)}">${n}</button></td>` : '<td class="dim">-</td>'; }).join('')}<td class="tot">${r.total}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td>Total</td>${rep.cols.map(c => `<td>${colTot(c)}</td>`).join('')}<td>${rep.rows.reduce((a, r) => a + r.total, 0)}</td></tr></tfoot></table></div>` : '<div class="empty card"><b>No report rows yet</b>Orders appear here by their dispatch date.</div>';
  return `<div class="stack"><div class="row"><div class="chips grow">${chip('14', '14 days')}${chip('30', '30 days')}${chip('all', 'All')}</div><button class="btn alt sm" data-act="export-report">Export CSV</button></div>
  <div class="muted small">Each number is the count of orders. Tap a number to see those orders.</div>${tbl}</div>`;
}
function openCell(date, col) {
  const c = ctx(), list = derivedAll().filter(x => x.d.finalDate === date && x.d.col === col);
  const h = S.history.filter(x => x.date === date && x.col === col).reduce((a, x) => a + Number(x.count), 0);
  sheet(`${col} on ${L.fmtDate(date, true)}`, `${list.map(orderCard).join('')}${h ? `<div class="card muted small">${h} more order${h > 1 ? 's' : ''} from imported history (no order details).</div>` : ''}`);
}
function exportReport() {
  const all = derivedAll(), latest = latestDate(all), from = rangeFrom(ui.repRange, latest);
  const rep = L.buildReport(S.orders, S.history, ctx(), { from, to: latest });
  const rows = [['Report Date', ...rep.cols, 'Total Order', 'Reason']];
  rep.rows.forEach(r => rows.push([r.date, ...rep.cols.map(c => r.cells[c] || '-'), r.total, [...r.reasons].join('; ') || '-']));
  saveFile('daily-report.csv', L.toCSV(rows), 'text/csv');
}

/* ---------------- masters ---------------- */
function dataView() {
  const t = ui.dataTab, seg = (k, n) => `<button data-act="dtab" data-k="${k}" aria-pressed="${t === k}">${n}</button>`;
  let body = '';
  if (t === 'sku') {
    body = `<div class="muted small">Weights per SKU pattern. Raw weight and pieces drive the raw agarbatti total.</div><div class="card">${S.masters.map((m, i) => `<button class="li" data-act="m-edit" data-i="${i}"><span><b>${esc(m.pattern)}</b><div class="muted small">Report ${m.weight} g · Raw ${m.raw} g · ${m.pieces} pc</div></span><span class="muted">${can() ? 'Edit' : ''}</span></button>`).join('') || '<div class="empty">No patterns yet.</div>'}</div>`;
  } else if (t === 'cal') {
    const rows = S.calendar.map((c, i) => ({ c, i })).sort((a, b) => b.c.date.localeCompare(a.c.date));
    body = `<div class="muted small">A holiday listed here moves its orders to the "Shift to" date. Sundays always move to Monday.</div><div class="card">${rows.map(({ c, i }) => `<button class="li" data-act="c-edit" data-i="${i}"><span><b>${esc(L.fmtDate(c.date, true))}</b> → ${esc(L.fmtDate(c.shiftTo, true))}<div class="muted small">${esc(c.reason)}</div></span><span class="flag ${c.active ? 'info' : ''}">${c.active ? 'On' : 'Off'}</span></button>`).join('') || '<div class="empty"><b>No holidays</b>Add a date that should shift.</div>'}</div>`;
  } else if (t === 'names') {
    const rows = Object.entries(S.skuMap);
    body = `<div class="muted small">SKU names you matched to a pattern by hand. The app uses these when it imports the same SKU again.</div><div class="card">${rows.map(([k, v]) => `<div class="li"><span class="grow" style="overflow-wrap:anywhere">${esc(k)}</span><b>${esc(v)}</b>${can() ? `<button class="btn danger sm" data-act="n-del" data-k="${esc(k)}">Remove</button>` : ''}</div>`).join('') || '<div class="empty"><b>Nothing saved yet</b>Choose a pattern on an order and it is remembered here.</div>'}</div>`;
  } else {
    const rows = S.history.map((h, i) => ({ h, i })).sort((a, b) => b.h.date.localeCompare(a.h.date) || a.h.col.localeCompare(b.h.col));
    body = `<div class="muted small">Daily report counts brought over from your Excel file. They show in the report and dashboard but have no order details.</div><div class="card">${rows.map(({ h, i }) => `<button class="li" data-act="h-edit" data-i="${i}"><span><b>${esc(L.fmtDate(h.date, true))}</b> <span class="tag ${h.col.includes('Zip') ? 'zip' : ''}">${esc(h.col)}</span></span><b class="num">${h.count}</b></button>`).join('') || '<div class="empty">No history.</div>'}</div>`;
  }
  const add = can() && t !== 'names' ? `<button class="btn" style="width:100%" data-act="d-add">+ Add ${{ sku: 'SKU pattern', cal: 'holiday', hist: 'history row' }[t]}</button>` : '';
  return `<div class="stack"><div class="seg" role="group" aria-label="Master data">${seg('sku', 'SKU')}${seg('cal', 'Calendar')}${seg('names', 'SKU names')}${seg('hist', 'History')}</div>${add}${body}</div>`;
}
function editMaster(i) {
  if (!can()) return toast('Only an admin can change masters.');
  const m = i == null ? { pattern: '', weight: '', raw: '', pieces: 1 } : S.masters[i];
  sheet(i == null ? 'Add SKU pattern' : 'Edit SKU pattern', `<form id="mform" data-i="${i ?? ''}"><div class="field"><label class="f" for="m_p">SKU pattern</label><input id="m_p" type="text" value="${esc(m.pattern)}" required></div>
  <div class="grid2"><div class="field"><label class="f" for="m_w">Report weight (g)</label><input id="m_w" type="number" min="0" value="${esc(m.weight)}" required></div><div class="field"><label class="f" for="m_r">Raw agarbatti (g)</label><input id="m_r" type="number" min="0" value="${esc(m.raw)}" required></div></div>
  <div class="field"><label class="f" for="m_n">Pieces</label><input id="m_n" type="number" min="1" value="${esc(m.pieces)}" required></div><div class="err" id="merr" role="alert"></div>
  <div class="row"><button class="btn grow" type="submit">Save</button>${i != null ? '<button class="btn danger" type="button" data-act="m-del">Delete</button>' : ''}</div></form>`);
}
function editCal(i) {
  if (!can()) return toast('Only an admin can change the calendar.');
  const c = i == null ? { date: '', shiftTo: '', reason: '', active: true } : S.calendar[i];
  sheet(i == null ? 'Add holiday' : 'Edit holiday', `<form id="cform" data-i="${i ?? ''}"><div class="grid2"><div class="field"><label class="f" for="c_d">Date</label><input id="c_d" type="date" value="${esc(c.date)}" required></div><div class="field"><label class="f" for="c_s">Shift to</label><input id="c_s" type="date" value="${esc(c.shiftTo)}" required></div></div>
  <div class="field"><label class="f" for="c_r">Reason</label><input id="c_r" type="text" value="${esc(c.reason)}"></div><label class="row" style="margin-bottom:12px"><input id="c_a" type="checkbox" ${c.active ? 'checked' : ''} style="width:20px;height:20px"> Active</label>
  <div class="row"><button class="btn grow" type="submit">Save</button>${i != null ? '<button class="btn danger" type="button" data-act="c-del">Delete</button>' : ''}</div></form>`);
}
function editHist(i) {
  if (!can()) return toast('Only an admin can change history.');
  const h = i == null ? { date: todayISO(), col: '', count: 1 } : S.history[i];
  sheet(i == null ? 'Add history row' : 'Edit history row', `<form id="hform" data-i="${i ?? ''}"><div class="field"><label class="f" for="h_d">Report date</label><input id="h_d" type="date" value="${esc(h.date)}" required></div>
  <div class="grid2"><div class="field"><label class="f" for="h_c">Dispatch label</label><input id="h_c" type="text" placeholder="10-1000 or 00-06 Zip" value="${esc(h.col)}" required></div><div class="field"><label class="f" for="h_n">Orders</label><input id="h_n" type="number" min="1" value="${esc(h.count)}" required></div></div>
  <div class="row"><button class="btn grow" type="submit">Save</button>${i != null ? '<button class="btn danger" type="button" data-act="h-del">Delete</button>' : ''}</div></form>`);
}

/* ---------------- settings ---------------- */
function settingsView() {
  const users = can() ? `<section class="card"><h2 class="h2">Users</h2>${S.users.map(u => `<button class="li" data-act="u-edit" data-id="${u.id}"><span><b>${esc(u.name)}</b><div class="muted small">${esc(u.username)} · ${u.role === 'admin' ? 'Admin' : 'Staff'}</div></span><span class="muted">Edit</span></button>`).join('')}<button class="btn alt" style="width:100%;margin-top:10px" data-act="u-add">+ Add user</button></section>` : '';
  const biz = can() ? `<section class="card"><h2 class="h2">Business</h2><form id="bform"><div class="field"><label class="f" for="b_n">Business name</label><input id="b_n" type="text" value="${esc(S.settings.company)}" required></div>
  <div class="field"><label class="f" for="b_c">Cutoff time</label><input id="b_c" type="time" value="${esc(S.settings.cutoff)}" required><div class="muted small" style="margin-top:4px">Orders with a dispatch time after this go to the next day. Your Excel file used 7:00 PM.</div></div><button class="btn" type="submit">Save business settings</button></form></section>` : '';
  const dat = `<section class="card"><h2 class="h2">Data and backup</h2><div class="stack">
    <button class="btn alt" data-act="import">Import orders from CSV</button><button class="btn alt" data-act="export-orders">Export all orders (CSV)</button>
    ${can() ? '<button class="btn alt" data-act="backup">Save a full backup</button><button class="btn alt" data-act="restore">Restore from backup</button><input type="file" id="rfile" accept=".json,application/json" hidden><button class="btn danger" data-act="wipe">Delete all orders and history</button>' : ''}
    <div class="muted small">Everything is stored on this phone only. Save a backup regularly and keep it in Google Drive or WhatsApp.</div></div></section>`;
  return `<div class="stack"><section class="card"><h2 class="h2">My account</h2><div class="muted small" style="margin-bottom:10px">${esc(ME.name)} · ${esc(ME.username)} · ${ME.role === 'admin' ? 'Admin' : 'Staff'}</div>
  <form id="pform"><div class="field"><label class="f" for="p_o">Current password</label><input id="p_o" type="password" autocomplete="current-password" required></div><div class="field"><label class="f" for="p_n">New password (6+ characters)</label><input id="p_n" type="password" autocomplete="new-password" minlength="6" required></div><div class="err" id="perr" role="alert"></div><button class="btn" type="submit">Change password</button></form></section>
  ${biz}${users}${dat}<div class="muted small" style="text-align:center">Satyam Agarbatti app 1.0 · Works offline</div></div>`;
}
function editUser(id) {
  const u = id ? S.users.find(x => x.id === id) : { name: '', username: '', role: 'staff' };
  sheet(id ? 'Edit user' : 'Add user', `<form id="uform" data-id="${id || ''}"><div class="field"><label class="f" for="u_n">Name</label><input id="u_n" type="text" value="${esc(u.name)}" required></div>
  <div class="field"><label class="f" for="u_u">Username</label><input id="u_u" type="text" autocapitalize="none" value="${esc(u.username)}" required></div>
  <div class="field"><label class="f" for="u_r">Role</label><select id="u_r"><option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff: add and edit orders, view reports</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin: everything</option></select></div>
  <div class="field"><label class="f" for="u_p">${id ? 'New password (leave empty to keep)' : 'Password (6+ characters)'}</label><input id="u_p" type="password" autocomplete="new-password"></div><div class="err" id="uerr" role="alert"></div>
  <div class="row"><button class="btn grow" type="submit">Save</button>${id && id !== ME.id ? '<button class="btn danger" type="button" data-act="u-del">Delete</button>' : ''}</div></form>`);
}

/* ---------------- events ---------------- */
const A = {
  tab: el => { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  goto: el => A.tab(el),
  'goto-filter': el => { ui.tab = 'orders'; ui.ordFilter = el.dataset.f; ui.q = ''; ui.ordDate = ''; render(); },
  logout: () => { try { localStorage.removeItem(SESSION); } catch (e) {} ME = null; render(); },
  range: el => { ui.range = el.dataset.k; render(); }, rrange: el => { ui.repRange = el.dataset.k; render(); },
  ofilter: el => { ui.ordFilter = el.dataset.k; ui.ordLimit = 60; render(); }, more: () => { ui.ordLimit += 60; render(); },
  dtab: el => { ui.dataTab = el.dataset.k; render(); },
  close: closeSheet, scrim: (el, e) => { if (e.target === el) closeSheet(); },
  'order-new': () => openOrder(), 'order-edit': el => openOrder(el.dataset.id),
  'order-del': async () => { const id = $('#oform').dataset.id; if (await ask('Delete this order? This cannot be undone.', 'Delete')) { S.orders = S.orders.filter(o => o.id !== id); persist(); closeSheet(); render(); toast('Order deleted'); } },
  import: openImport, 'import-run': runImport, cell: el => openCell(el.dataset.d, el.dataset.c), 'export-report': exportReport,
  'export-orders': () => { const c = ctx(); saveFile('orders.csv', L.toCSV([['Order Id', 'SKU', 'Invoice Date', 'Quantity', 'Dispatch After', 'SKU Pattern', 'Raw Agarbatti (g)', 'Packed Weight (g)', 'Dispatch Label', 'Business Date', 'Report Date', 'Shift Reason'], ...S.orders.map(o => { const d = L.derive(o, c); return [o.orderId, o.sku, o.invoiceDate, o.quantity, o.dispatchAfter.replace('T', ' '), d.pattern, d.totalRaw, d.packed, d.col, d.businessDate, d.finalDate, d.shiftReason]; })]), 'text/csv'); },
  backup: () => saveFile('satyam-backup-' + todayISO() + '.json', JSON.stringify({ app: 'satyam-agarbatti', v: 1, settings: S.settings, masters: S.masters, calendar: S.calendar, skuMap: S.skuMap, orders: S.orders, history: S.history }), 'application/json'),
  restore: () => $('#rfile').click(),
  wipe: async () => { if (await ask('Delete ALL orders and imported history? Masters and users stay.', 'Delete everything')) { S.orders = []; S.history = []; persist(); render(); toast('All orders and history deleted'); } },
  'm-edit': el => editMaster(Number(el.dataset.i)), 'c-edit': el => editCal(Number(el.dataset.i)), 'h-edit': el => editHist(Number(el.dataset.i)),
  'd-add': () => ({ sku: editMaster, cal: editCal, hist: editHist }[ui.dataTab])(null),
  'm-del': async () => { const i = Number($('#mform').dataset.i); if (await ask('Delete this SKU pattern? Orders using it will need a new pattern.', 'Delete')) { S.masters.splice(i, 1); persist(); closeSheet(); render(); } },
  'c-del': async () => { const i = Number($('#cform').dataset.i); if (await ask('Delete this holiday?', 'Delete')) { S.calendar.splice(i, 1); persist(); closeSheet(); render(); } },
  'h-del': async () => { const i = Number($('#hform').dataset.i); if (await ask('Delete this history row?', 'Delete')) { S.history.splice(i, 1); persist(); closeSheet(); render(); } },
  'n-del': el => { delete S.skuMap[el.dataset.k]; persist(); render(); },
  'u-edit': el => editUser(el.dataset.id), 'u-add': () => editUser(null),
  'u-del': async () => { const id = $('#uform').dataset.id; if (await ask('Delete this user?', 'Delete')) { S.users = S.users.filter(u => u.id !== id); persist(); closeSheet(); render(); } }
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && A[el.dataset.act]) A[el.dataset.act](el, e); });
document.addEventListener('input', e => {
  if (e.target.id === 'oq') { ui.q = e.target.value; ui.ordLimit = 60; const p = e.target.selectionStart; render(); const n = $('#oq'); n.focus(); n.setSelectionRange(p, p); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'od') { ui.ordDate = e.target.value; render(); }
  if (e.target.id === 'rfile') {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = async () => {
      try {
        const b = JSON.parse(r.result); if (b.app !== 'satyam-agarbatti' || !Array.isArray(b.orders)) throw 0;
        if (!(await ask('Replace current orders, masters and settings with this backup?', 'Restore'))) return;
        Object.assign(S, { settings: b.settings, masters: b.masters, calendar: b.calendar, skuMap: b.skuMap || {}, orders: b.orders, history: b.history || [] }); persist(); render(); toast('Backup restored');
      } catch (x) { toast('That file is not a Satyam backup.'); }
    }; r.readAsText(f);
  }
});
document.addEventListener('submit', async e => {
  e.preventDefault(); const id = e.target.id;
  if (id === 'loginForm') return doLogin();
  if (id === 'oform') return saveOrder();
  if (id === 'mform') {
    const i = $('#mform').dataset.i, m = { pattern: $('#m_p').value.trim(), weight: Number($('#m_w').value), raw: Number($('#m_r').value), pieces: Number($('#m_n').value) };
    if (S.masters.some((x, k) => String(k) !== i && String(x.pattern) === m.pattern)) return $('#merr').textContent = 'This pattern already exists.';
    if (i === '') S.masters.push(m); else S.masters[Number(i)] = m; persist(); closeSheet(); render(); return toast('Saved');
  }
  if (id === 'cform') {
    const i = $('#cform').dataset.i, c = { date: $('#c_d').value, shiftTo: $('#c_s').value, reason: $('#c_r').value.trim() || 'Holiday', active: $('#c_a').checked };
    if (i === '') S.calendar.push(c); else S.calendar[Number(i)] = c; persist(); closeSheet(); render(); return toast('Saved');
  }
  if (id === 'hform') {
    const i = $('#hform').dataset.i, h = { id: uid('h'), date: $('#h_d').value, col: $('#h_c').value.trim(), count: Number($('#h_n').value) };
    if (i === '') S.history.push(h); else S.history[Number(i)] = { ...S.history[Number(i)], ...h }; persist(); closeSheet(); render(); return toast('Saved');
  }
  if (id === 'bform') { S.settings.company = $('#b_n').value.trim(); S.settings.cutoff = $('#b_c').value; persist(); render(); return toast('Saved'); }
  if (id === 'pform') {
    if ((await sha(ME.salt + ':' + $('#p_o').value)) !== ME.hash) return $('#perr').textContent = 'Current password is wrong.';
    const pw = $('#p_n').value; if (pw.length < 6) return $('#perr').textContent = 'Use at least 6 characters.';
    ME.salt = uid('s'); ME.hash = await sha(ME.salt + ':' + pw); ME.mustChange = false; persist(); render(); return toast('Password changed');
  }
  if (id === 'uform') {
    const uidv = $('#uform').dataset.id, name = $('#u_n').value.trim(), un = $('#u_u').value.trim(), role = $('#u_r').value, pw = $('#u_p').value, err = $('#uerr');
    if (S.users.some(u => u.id !== uidv && u.username.toLowerCase() === un.toLowerCase())) return err.textContent = 'That username is taken.';
    if (!uidv && pw.length < 6) return err.textContent = 'Password needs 6+ characters.';
    if (pw && pw.length < 6) return err.textContent = 'Password needs 6+ characters.';
    if (uidv) {
      const u = S.users.find(x => x.id === uidv);
      if (u.role === 'admin' && role !== 'admin' && S.users.filter(x => x.role === 'admin').length < 2) return err.textContent = 'Keep at least one admin.';
      Object.assign(u, { name, username: un, role }); if (pw) { u.salt = uid('s'); u.hash = await sha(u.salt + ':' + pw); u.mustChange = false; }
    } else S.users.push(await makeUser(un, name, role, pw, false));
    persist(); closeSheet(); render(); return toast('Saved');
  }
});
init();
})();
