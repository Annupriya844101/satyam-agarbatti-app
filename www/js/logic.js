/* Business rules copied from the Excel workbook (Satyam Agarbatti Automation V6).
   Pure functions only, so they can be tested outside the browser. */
(function (root) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  /* ---------- dates (all stored as plain text so time zones never shift them) ---------- */
  function parseISO(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function isSunday(iso) { return parseISO(iso).getDay() === 0; }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtDate(iso, withDow) { if (!iso) return '-'; const d = parseISO(iso); return (withDow ? DOW[d.getDay()] + ' ' : '') + d.getDate() + ' ' + MON[d.getMonth()] + (withDow ? '' : ' ' + String(d.getFullYear()).slice(2)); }
  function fmtDateTime(s) { if (!s) return '-'; return fmtDate(s.slice(0, 10)) + (s.length > 10 ? ', ' + s.slice(11, 16) : ''); }

  /* ---------- SKU pattern detection ---------- */
  const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
  function detectPattern(sku, masters, skuMap) {
    const key = norm(sku);
    if (skuMap && skuMap[key] !== undefined && masters.some(m => String(m.pattern) === String(skuMap[key]))) return String(skuMap[key]);
    const pats = new Set(masters.map(m => String(m.pattern)));
    const tokens = String(sku || '').toLowerCase().split('/').map(t => t.replace(/\s+/g, ''));
    // 1) a whole token equals a pattern (optionally with a trailing g), e.g. "1000g", "150*3", "80g"
    for (const t of tokens) {
      const t2 = t.replace(/g$/, '');
      if (pats.has(t)) return t;
      if (pats.has(t2)) return t2;
      if (pats.has(t + '*1')) return t + '*1';
      if (pats.has(t2 + '*1')) return t2 + '*1';
    }
    // 2) a pattern hidden inside a token, e.g. "ros,chan,mog,500g"
    let best = null;
    for (const t of tokens) {
      const m = t.match(/(\d+g?\*\d+(?:pic)?|\d+)g?$/) || t.match(/^(\d+g?\*\d+(?:pic)?|\d+)g?(?=[^0-9a-z*])/);
      if (m) {
        const c = m[1];
        const c2 = c.replace(/g(?=\*)/, '');
        for (const cand of [c, c2, c.replace(/g$/, ''), c + '*1']) if (pats.has(cand)) { best = cand; break; }
      }
      if (best) break;
    }
    return best;
  }

  /* ---------- derived fields for one order ---------- */
  function businessDate(dispatchAfter, cutoff) {
    if (!dispatchAfter) return '';
    const day = dispatchAfter.slice(0, 10);
    const time = dispatchAfter.length > 10 ? dispatchAfter.slice(11, 16) : '00:00';
    return time > cutoff ? addDays(day, 1) : day;   // after the cutoff goes to the next business day
  }
  function finalDate(date, calendar) {
    // Business Calendar first (holiday -> "Shift To"), then Sunday -> Monday, looped, with loop protection.
    let reason = null; const seen = new Set();
    for (let i = 0; i < 60 && date; i++) {
      if (seen.has(date)) break; seen.add(date);
      const hit = calendar.find(c => c.active !== false && c.date === date && c.shiftTo);
      if (hit) { reason = reason || (hit.reason || 'Calendar'); date = hit.shiftTo; continue; }
      if (isSunday(date)) { reason = reason || 'Sunday'; date = addDays(date, 1); continue; }
      break;
    }
    return { date, reason: reason || '-' };
  }
  function derive(o, ctx) {
    const qty = Number(o.quantity) || 0;
    const pattern = o.pattern || detectPattern(o.sku, ctx.masters, ctx.skuMap);
    const m = pattern ? ctx.masters.find(x => String(x.pattern) === String(pattern)) : null;
    const zip = /zip/i.test(o.sku || '');
    const d = { pattern: pattern || '', known: !!m, zip, qty };
    d.weight = m ? Number(m.weight) : 0; d.raw = m ? Number(m.raw) : 0; d.pieces = m ? Number(m.pieces) : 0;
    d.totalRaw = d.raw * d.pieces * qty;
    d.packed = d.weight * qty;
    if (zip) { const n = qty * d.pieces; d.col = '00-' + pad(n) + ' Zip'; d.colOrder = n; }
    else { d.col = '10-' + pad(d.packed, 4); d.colOrder = 10000 + d.packed; }
    d.businessDate = businessDate(o.dispatchAfter, ctx.cutoff);
    const f = finalDate(d.businessDate, ctx.calendar);
    d.finalDate = f.date; d.shiftReason = f.reason; d.shifted = f.reason !== '-' || d.finalDate !== d.businessDate;
    return d;
  }

  /* ---------- daily report ---------- */
  function colSort(a, b) {
    const za = a.startsWith('00-'), zb = b.startsWith('00-');
    if (za !== zb) return za ? -1 : 1;
    return parseInt(a.slice(3)) - parseInt(b.slice(3));
  }
  function buildReport(orders, history, ctx, range) {
    const rows = new Map(); const cols = new Set();
    const ensure = d => { if (!rows.has(d)) rows.set(d, { date: d, cells: {}, total: 0, reasons: new Set(), refs: {} }); return rows.get(d); };
    const inRange = d => d && (!range || ((!range.from || d >= range.from) && (!range.to || d <= range.to)));
    for (const o of orders) {
      const d = derive(o, ctx); if (!inRange(d.finalDate)) continue;
      const r = ensure(d.finalDate); cols.add(d.col);
      r.cells[d.col] = (r.cells[d.col] || 0) + 1; r.total++;
      (r.refs[d.col] = r.refs[d.col] || []).push(o.id);
      if (d.shifted) r.reasons.add(d.shiftReason + (d.businessDate !== d.finalDate ? ' (from ' + fmtDate(d.businessDate) + ')' : ''));
    }
    for (const h of history) {
      if (!inRange(h.date)) continue;
      const r = ensure(h.date); cols.add(h.col);
      r.cells[h.col] = (r.cells[h.col] || 0) + Number(h.count); r.total += Number(h.count);
    }
    const list = [...rows.values()].sort((a, b) => a.date < b.date ? -1 : 1);
    return { rows: list, cols: [...cols].sort(colSort) };
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }
  function toCSV(rows) {
    return rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
  }
  // Accepts "mm/dd/yyyy", "mm/dd/yy", "yyyy-mm-dd", optional "hh:mm[:ss]" and Excel serial numbers
  function parseDateTime(s) {
    s = String(s || '').trim(); if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000) {
      const ms = Math.round((Number(s) - 25569) * 86400000); const d = new Date(ms);
      return { date: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), time: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) };
    }
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return { date: m[1] + '-' + pad(m[2]) + '-' + pad(m[3]), time: m[4] ? pad(m[4]) + ':' + m[5] : null };
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
    if (m) {
      let y = Number(m[3]); if (y < 100) y += 2000;
      let h = m[4] != null ? Number(m[4]) : null;
      if (h != null && m[6]) { if (/pm/i.test(m[6]) && h < 12) h += 12; if (/am/i.test(m[6]) && h === 12) h = 0; }
      return { date: y + '-' + pad(m[1]) + '-' + pad(m[2]), time: h != null ? pad(h) + ':' + m[5] : null };   // mm/dd/yy like the workbook
    }
    return null;
  }
  function importOrders(text, existing) {
    const rows = parseCSV(text); if (rows.length < 2) return { added: [], skipped: 0, bad: [], error: 'No data rows found.' };
    const head = rows[0].map(h => String(h).trim().toLowerCase());
    const find = (...names) => head.findIndex(h => names.some(n => h.startsWith(n)));
    const ix = { id: find('order id', 'order'), sku: find('sku'), inv: find('invoice'), qty: find('quantity', 'qty'), disp: find('dispatch') };
    if (ix.id < 0 || ix.sku < 0 || ix.qty < 0 || (ix.inv < 0 && ix.disp < 0)) return { added: [], skipped: 0, bad: [], error: 'Missing columns. Need: Order Id, SKU, Invoice Date, Quantity, Dispatch After date.' };
    const keys = new Set(existing.map(o => o.orderId + '|' + norm(o.sku) + '|' + o.dispatchAfter));
    const added = [], bad = []; let skipped = 0;
    rows.slice(1).forEach((r, i) => {
      const orderId = String(r[ix.id] || '').trim(), sku = String(r[ix.sku] || '').trim();
      const qty = Number(String(r[ix.qty] || '').trim());
      const inv = parseDateTime(r[ix.inv]), disp = parseDateTime(ix.disp >= 0 ? r[ix.disp] : '');
      if (!orderId || !sku || !(qty > 0) || (!inv && !disp)) { bad.push(i + 2); return; }
      const invoiceDate = (inv || disp).date;
      const dispatchAfter = disp ? disp.date + 'T' + (disp.time || '00:00') : invoiceDate + 'T00:00';
      const key = orderId + '|' + norm(sku) + '|' + dispatchAfter;
      if (keys.has(key)) { skipped++; return; }
      keys.add(key);
      added.push({ id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), orderId, sku, invoiceDate, quantity: qty, dispatchAfter, pattern: '' });
    });
    return { added, skipped, bad };
  }

  const api = { pad, parseISO, toISO, addDays, isSunday, fmtDate, fmtDateTime, norm, detectPattern, businessDate, finalDate, derive, buildReport, colSort, parseCSV, toCSV, parseDateTime, importOrders };
  if (typeof module !== 'undefined') module.exports = api; else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
