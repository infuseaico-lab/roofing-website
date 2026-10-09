const $ = (sel, root = document) => root.querySelector(sel);

const COLUMNS = [
  ['client', 'Client'],
  ['platform', 'Platform'],
  ['listing', 'Listing'],
  ['postOn', 'Post On'],
  ['review', 'Review'],
  ['imageUrl', 'Image URL'],
  ['postDate', 'Post Date'],
  ['posterName', 'Poster ID'],
  ['postedAs', 'Posted As'],
  ['reviewLink', 'Review Link'],
  ['status', 'Status'],
  ['paid', 'Paid'],
];

const state = {
  user: null,
  records: [],
  statuses: [],
  sort: { key: 'postDate', dir: -1 },
  editingId: null,
  importRows: [],
  companies: [],
  coSort: { key: 'startDate', dir: -1 },
  editingCompanyId: null,
  editingViewer: null,
  posters: [],
  editingPosterId: null,
  postingId: null,
  seenAt: '',
  pollTimer: null,
  selected: new Set(),
};

// ---------- api ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') {
    showLogin();
    throw new Error('Your session expired. Please sign in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- views ----------

function showLogin() {
  state.user = null;
  clearInterval(state.pollTimer);
  $('#notif-panel').hidden = true;
  document.title = 'Reputation Pilot';
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#login-form').reset();
  $('input[name=username]', $('#login-form')).focus();
}

async function showApp(user) {
  state.user = user;
  document.body.classList.toggle('is-admin', user.role === 'admin');
  document.body.classList.toggle('is-poster', user.role === 'poster');
  state.seenAt = user.notificationsSeenAt || '';
  clearInterval(state.pollTimer);
  // Notifications (new tasks, new posts, completed packages) show up without reloading the page.
  state.pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && state.user) loadRecords().catch(() => {});
  }, 60000);
  $('#who').textContent =
    user.role === 'admin' ? `${user.username} · Admin`
    : user.role === 'poster' ? `${user.name} · Poster`
    : `${user.username} · ${user.companies?.join(', ') || 'View only'}`;
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  showTab('reviews');
  if (user.role === 'admin') await Promise.all([loadCompanies(), loadPosters()]);
  else {
    state.companies = [];
    state.posters = [];
  }
  await loadRecords();
}

async function loadRecords() {
  const { records, statuses, platforms, warrantyDays } = await api('/api/records');
  state.platforms = platforms || ['Google'];
  state.warrantyDays = warrantyDays || 30;
  for (const r of records) {
    r._warranty = warrantyInfo(r);
  }
  state.records = records;
  state.statuses = statuses;
  const ids = new Set(records.map((r) => r.id));
  for (const id of state.selected) if (!ids.has(id)) state.selected.delete(id);
  fillSelect($('#bulk-status'), statuses, 'Change status to…');
  fillSelect($('#filter-status'), statuses, 'All statuses');
  fillSelect($('#filter-platform'), state.platforms, 'All platforms');
  fillPosterFilter();
  fillSelect($('[name=platform]', $('#record-form')), state.platforms);
  fillSelect($('[name=status]', $('#record-form')), statuses);
  const clients = [...new Set(records.map((r) => r.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  fillSelect($('#filter-client'), clients, 'All clients');
  const names = [...new Set([...clients, ...state.companies.map((c) => c.name)])].sort((a, b) => a.localeCompare(b));
  $('#client-options').replaceChildren(...names.map((c) => new Option(c)));
  $('#poster-options').replaceChildren(...state.posters.map((p) => new Option(p.name, p.username)));
  render();
  if (state.user) renderNotifications();
  if (state.user?.role === 'admin') {
    renderCompanies();
    renderPosters();
    if (!$('#stats-panel').hidden) renderStats();
  }
  if (!$('#credit-panel').hidden) renderCredit();
}

// Poster ID filter: one entry per poster. Reviews holding a poster's display name (older data)
// count as that poster; a blank Poster ID is "No poster ID".
// Posters don't get the poster list, but they know themselves.
const knownPosters = () => (state.user?.role === 'poster'
  ? [{ username: state.user.username, name: state.user.name }]
  : state.posters);

function posterKey(value) {
  if (!String(value ?? '').trim()) return '__none';
  const known = knownPosters().find((p) => isPosterOf(p, value));
  return (known?.username ?? String(value).trim()).toLowerCase();
}

function fillPosterFilter() {
  const select = $('#filter-poster');
  const current = select.value;
  const labels = new Map();
  for (const p of knownPosters()) labels.set(p.username.toLowerCase(), state.user?.role === 'poster' ? `Me (${p.username})` : `${p.name} (${p.username})`);
  for (const r of state.records) {
    const key = posterKey(r.posterName);
    if (key !== '__none' && !labels.has(key)) labels.set(key, r.posterName.trim());
  }
  const options = [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => new Option(l, k));
  select.replaceChildren(new Option('All poster IDs', ''), ...options, new Option('No poster ID', '__none'));
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function fillSelect(select, values, allLabel) {
  const current = select.value;
  const opts = values.map((v) => new Option(v, v));
  if (allLabel) opts.unshift(new Option(allLabel, ''));
  select.replaceChildren(...opts);
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function filteredRecords() {
  const q = $('#search').value.trim().toLowerCase();
  const client = $('#filter-client').value;
  const status = $('#filter-status').value;
  const platform = $('#filter-platform').value;
  const poster = $('#filter-poster').value;
  const paid = $('#filter-paid').value;
  const warranty = $('#filter-warranty').value;
  const { key, dir } = state.sort;
  return state.records
    .filter((r) => !client || r.client === client)
    .filter((r) => !status || r.status === status)
    .filter((r) => !platform || r.platform === platform)
    .filter((r) => !poster || posterKey(r.posterName) === poster)
    .filter((r) => !paid || (paid === 'yes') === r.paid)
    .filter((r) => !warranty || r._warranty?.kind === warranty)
    .filter((r) => !q || COLUMNS.some(([k]) => String(r[k] ?? '').toLowerCase().includes(q)))
    .sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (typeof av === 'boolean') return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
}

function render() {
  const rows = filteredRecords();
  const isAdmin = state.user?.role === 'admin';
  const isPoster = state.user?.role === 'poster';
  const tbody = $('#records tbody');

  tbody.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      if (isAdmin) tr.append(selectCell(r));
      tr.append(
        clientCell(r),
        /^https?:\/\//i.test(r.listing || '') ? linkCell(r.listing, 'Listing ↗') : cell(r.listing),
        postOnCell(r),
        reviewCell(r.review),
        linkCell(r.imageUrl, 'View ↗'),
        cell(formatDate(r.postDate), 'nowrap'),
        postedAsCell(r, isAdmin || isPoster),
        linkCell(r.reviewLink),
        statusCell(r.status),
      );
      if (isAdmin) tr.append(paidCell(r.paid));
      if (isAdmin) tr.append(actionsCell(r));
      if (isPoster) tr.append(posterActionCell(r));
      return tr;
    }),
  );

  const empty = $('#empty');
  empty.hidden = rows.length > 0;
  empty.textContent = state.records.length
    ? 'No records match these filters.'
    : isAdmin
      ? 'No records yet. Use “+ Add record” or “Import CSV” to get started.'
      : isPoster
        ? 'No reviews for you yet. Reviews assigned to you, and new ones for your companies, will show up here.'
        : state.user?.companies?.length === 0
          ? 'No company is linked to this login yet. Ask your account manager to set it up.'
          : 'No records yet.';

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.setAttribute('aria-sort', th.dataset.sort === state.sort.key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
  });

  // Summary reflects the current client filter so a client-level view is easy to read.
  const scope = $('#filter-client').value ? state.records.filter((r) => r.client === $('#filter-client').value) : state.records;
  $('#stat-total').textContent = scope.length;
  $('#stat-live').textContent = scope.filter((r) => r.status === 'Live').length;
  $('#stat-pending').textContent = scope.filter((r) => r.status === 'Pending' || r.status === 'Posted').length;
  $('#stat-unpaid').textContent = scope.filter((r) => !r.paid).length;
  if (isAdmin) updateBulkBar();
}

function cell(text, cls) {
  const td = document.createElement('td');
  td.textContent = text || '';
  if (cls) td.className = cls;
  return td;
}

function reviewCell(text) {
  const td = document.createElement('td');
  td.className = 'review';
  const div = document.createElement('div');
  div.className = 'clamp';
  div.textContent = text || '';
  div.title = text || '';
  td.append(div);
  return td;
}

function linkCell(url, label = 'Open ↗') {
  const td = document.createElement('td');
  if (/^https?:\/\//i.test(url || '')) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    a.title = url;
    td.append(a);
  } else {
    td.textContent = url || '';
  }
  return td;
}

function statusCell(status) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = `pill status-${String(status).toLowerCase()}`;
  span.textContent = status;
  td.append(span);
  return td;
}

function paidCell(paid) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = `pill ${paid ? 'paid' : 'unpaid'}`;
  span.textContent = paid ? 'Paid' : 'Unpaid';
  td.append(span);
  return td;
}

function actionsCell(r) {
  const td = document.createElement('td');
  td.className = 'row-actions';
  const edit = document.createElement('button');
  edit.className = 'btn small';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => openRecordDialog(r));
  const del = document.createElement('button');
  del.className = 'btn small danger';
  del.textContent = 'Delete';
  del.addEventListener('click', () => deleteRecord(r));
  td.append(edit, del);
  return td;
}

function selectCell(r) {
  const td = document.createElement('td');
  td.className = 'select-col';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.selected.has(r.id);
  box.setAttribute('aria-label', `Select ${r.client || 'record'}${r.posterName ? ` by ${r.posterName}` : ''}`);
  box.addEventListener('change', () => {
    box.checked ? state.selected.add(r.id) : state.selected.delete(r.id);
    td.parentElement.classList.toggle('selected', box.checked);
    updateBulkBar();
  });
  td.append(box);
  queueMicrotask(() => td.parentElement?.classList.toggle('selected', box.checked));
  return td;
}

function updateBulkBar() {
  const n = state.selected.size;
  $('#bulk-bar').hidden = n === 0;
  $('#bulk-count').textContent = `${n} selected`;
  const shown = filteredRecords();
  const picked = shown.filter((r) => state.selected.has(r.id)).length;
  const all = $('#select-all');
  all.checked = shown.length > 0 && picked === shown.length;
  all.indeterminate = picked > 0 && picked < shown.length;
}

async function bulkUpdate(changes, label) {
  const ids = [...state.selected];
  try {
    const { updated } = await api('/api/records/bulk', { method: 'POST', body: { ids, changes } });
    state.selected.clear();
    toast(`${updated} record${updated === 1 ? '' : 's'} ${label}`);
    await loadRecords();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- warranty ----------

const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString('en-CA');
};
const daysUntil = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
};

// Warranty runs for warrantyDays from the post date, inclusive of the last day.
// kind: 'active' (posted, still covered), 'claim' (removed while covered, needs replacing), 'expired'.
function warrantyInfo(r) {
  const posted = r.status === 'Posted' || r.status === 'Live';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.postDate || '') || (!posted && r.status !== 'Removed')) return null;
  const end = addDays(r.postDate, state.warrantyDays);
  const left = daysUntil(end);
  if (left < 0) return { kind: 'expired', end, left };
  return { kind: posted ? 'active' : 'claim', end, left };
}

function warrantyText(w) {
  if (!w) return 'Starts when posted';
  const days = `${w.left} day${w.left === 1 ? '' : 's'} left`;
  if (w.kind === 'expired') return `Expired ${formatDate(w.end)}`;
  if (w.kind === 'claim') return `Removed in warranty · ${days}`;
  return w.left === 0 ? 'Last day today' : days;
}

// The date the admin wants the review posted; flags Pending reviews that are due or late.
function postOnCell(r) {
  const td = cell(formatDate(r.postOn), 'nowrap');
  if (r.status === 'Pending' && /^\d{4}-\d{2}-\d{2}$/.test(r.postOn || '')) {
    const days = daysUntil(r.postOn);
    if (days <= 0) {
      const note = document.createElement('div');
      note.className = days < 0 ? 'sub overdue' : 'sub due';
      note.textContent = days < 0 ? `Overdue ${-days} day${days === -1 ? '' : 's'}` : 'Due today';
      td.append(note);
    }
  }
  return td;
}

// Client name with the review's platform as a small tag underneath.
function clientCell(r) {
  const td = cell(r.client, 'strong');
  const tag = document.createElement('div');
  tag.className = 'platform-tag';
  tag.textContent = r.platform || 'Google';
  td.append(tag);
  return td;
}

// The name the review is published under, with the Poster ID beneath for admin and posters.
function postedAsCell(r, showPoster) {
  const td = cell(r.postedAs);
  if (showPoster && r.posterName) {
    const sub = document.createElement('div');
    sub.className = 'platform-tag';
    sub.textContent = `by ${r.posterName}`;
    td.append(sub);
  }
  return td;
}

function posterActionCell(r) {
  const td = document.createElement('td');
  td.className = 'row-actions';
  const btn = document.createElement('button');
  btn.className = 'btn small';
  btn.textContent = 'Update';
  btn.addEventListener('click', () => openPostDialog(r));
  td.append(btn);
  return td;
}

function formatDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  // MM/DD/YY
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y.slice(-2)}`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

function confirmAction(message, okLabel) {
  const dlg = $('#confirm-dialog');
  $('#confirm-message').textContent = message;
  $('#confirm-ok').textContent = okLabel;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------- record dialog ----------

function openRecordDialog(record) {
  const form = $('#record-form');
  form.reset();
  showError($('#record-error'), '');
  state.editingId = record?.id ?? null;
  $('#record-title').textContent = record ? 'Edit record' : 'Add record';
  if (record) {
    for (const [key] of COLUMNS) {
      const input = form.elements[key];
      if (key === 'paid') input.checked = record.paid;
      else input.value = record[key] ?? '';
    }
  } else {
    form.elements.status.value = state.statuses[0] ?? '';
    const client = $('#filter-client').value;
    if (client) form.elements.client.value = client;
  }
  const w = record?._warranty;
  $('#record-warranty').hidden = !record;
  $('#record-warranty').textContent = w
    ? `Warranty: ${warrantyText(w)} (${w.kind === 'expired' ? 'ended' : 'ends'} ${formatDate(w.end)})`
    : `Warranty: starts when the review is Posted or Live, and lasts ${state.warrantyDays} days.`;
  $('#record-dialog').showModal();
}

async function saveRecord(e) {
  e.preventDefault();
  const form = e.target;
  const body = {};
  for (const [key] of COLUMNS) {
    body[key] = key === 'paid' ? form.elements.paid.checked : form.elements[key].value;
  }
  try {
    if (state.editingId) await api(`/api/records/${state.editingId}`, { method: 'PUT', body });
    else await api('/api/records', { method: 'POST', body });
    $('#record-dialog').close();
    toast(state.editingId ? 'Record updated' : 'Record added');
    await loadRecords();
  } catch (err) {
    showError($('#record-error'), err.message);
  }
}

async function deleteRecord(r) {
  if (!(await confirmAction(`Delete this record for ${r.client || 'this client'}${r.posterName ? ` by ${r.posterName}` : ''}?`, 'Delete'))) return;
  try {
    await api(`/api/records/${r.id}`, { method: 'DELETE' });
    toast('Record deleted');
    await loadRecords();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- CSV ----------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const HEADER_KEYS = Object.fromEntries(COLUMNS.map(([key, label]) => [label.toLowerCase().replace(/[^a-z]/g, ''), key]));
HEADER_KEYS.poston = 'postOn';
HEADER_KEYS.scheduleddate = 'postOn';
HEADER_KEYS.scheduled = 'postOn';
HEADER_KEYS.date = 'postDate';
HEADER_KEYS.poster = 'posterName';
HEADER_KEYS.postername = 'posterName';
HEADER_KEYS.reviewer = 'postedAs';
HEADER_KEYS.reviewername = 'postedAs';
HEADER_KEYS.postedunder = 'postedAs';
HEADER_KEYS.link = 'reviewLink';
HEADER_KEYS.image = 'imageUrl';
HEADER_KEYS.images = 'imageUrl';
HEADER_KEYS.imageurl = 'imageUrl';
HEADER_KEYS.imagesurl = 'imageUrl';

function normalizeDate(value) {
  const v = value.trim();
  if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const us = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // M/D/YYYY
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleDateString('en-CA');
}

async function previewImport() {
  const file = $('#import-file').files[0];
  state.importRows = [];
  $('#import-submit').disabled = true;
  showError($('#import-error'), '');
  $('#import-preview').textContent = '';
  if (!file) return;
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return showError($('#import-error'), 'The file needs a header row and at least one record.');
  const keys = rows[0].map((h) => HEADER_KEYS[h.toLowerCase().replace(/[^a-z]/g, '')]);
  const matched = [...new Set(keys.filter(Boolean))];
  if (!matched.length) return showError($('#import-error'), 'None of the column headers matched. Check the first row.');
  state.importRows = rows.slice(1).map((cells) => {
    const r = {};
    keys.forEach((k, i) => k && (r[k] = cells[i] ?? ''));
    if (r.postDate) r.postDate = normalizeDate(r.postDate);
    if (r.postOn) r.postOn = normalizeDate(r.postOn);
    return r;
  });
  const labels = COLUMNS.filter(([k]) => matched.includes(k)).map(([, l]) => l);
  $('#import-preview').textContent = `${state.importRows.length} record(s) found. Columns: ${labels.join(', ')}.`;
  $('#import-submit').disabled = false;
}

async function runImport(e) {
  e.preventDefault();
  try {
    const { added } = await api('/api/records/import', { method: 'POST', body: { records: state.importRows } });
    $('#import-dialog').close();
    toast(`Imported ${added} record(s)`);
    await loadRecords();
  } catch (err) {
    showError($('#import-error'), err.message);
  }
}

function exportCsv() {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Only the admin exports the poster-paid column.
  // Clients never see which poster posted a review.
  const hidden = state.user?.role === 'admin' ? [] : state.user?.role === 'poster' ? ['paid'] : ['paid', 'posterName'];
  const cols = COLUMNS.filter(([k]) => !hidden.includes(k));
  const lines = [cols.map(([, l]) => l).join(',')];
  for (const r of filteredRecords()) {
    lines.push(cols.map(([k]) => esc(k === 'paid' ? (r.paid ? 'Yes' : 'No') : k === 'postDate' || k === 'postOn' ? formatDate(r[k]) : r[k])).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reviews-${new Date().toLocaleDateString('en-CA')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- viewers ----------

async function loadViewers() {
  const { viewers } = await api('/api/viewers');
  const list = $('#viewer-list');
  if (!viewers.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No viewer logins yet.';
    list.replaceChildren(li);
    return;
  }
  const companyName = new Map(state.companies.map((c) => [c.id, c.name]));
  list.replaceChildren(
    ...viewers.map((v) => {
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.className = 'viewer-info';
      const name = document.createElement('strong');
      name.textContent = v.username;
      const sees = document.createElement('span');
      const company = companyName.get(v.companyId);
      sees.className = company ? 'muted' : 'warn';
      sees.textContent = company ? `Sees: ${company}` : 'No company assigned. This login sees no records.';
      info.append(name, sees);
      const edit = document.createElement('button');
      edit.className = 'btn small';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editViewer(v));
      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Remove';
      del.addEventListener('click', async () => {
        if (!(await confirmAction(`Remove viewer login "${v.username}"? They will be signed out.`, 'Remove'))) return;
        try {
          await api(`/api/viewers/${encodeURIComponent(v.username)}`, { method: 'DELETE' });
          if ($('#viewer-username').value === v.username) resetViewerForm();
          await loadViewers();
        } catch (err) {
          showError($('#viewer-error'), err.message);
        }
      });
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      actions.append(edit, del);
      li.append(info, actions);
      return li;
    }),
  );
}

function renderCompanyPicks(selectedId = '') {
  const select = $('#viewer-company');
  const placeholder = new Option(state.companies.length ? 'Choose a company…' : 'Add a company in the Companies tab first', '');
  const options = [...state.companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => new Option(c.name, c.id));
  select.replaceChildren(placeholder, ...options);
  select.value = options.some((o) => o.value === selectedId) ? selectedId : '';
}

function resetViewerForm() {
  const form = $('#viewer-form');
  form.reset();
  state.editingViewer = null;
  $('#viewer-username').readOnly = false;
  $('#viewer-password').required = true;
  $('#viewer-password').placeholder = '';
  $('#viewer-form-title').textContent = 'New viewer login';
  $('#viewer-submit').textContent = 'Create login';
  $('#viewer-cancel-edit').hidden = true;
  renderCompanyPicks();
}

function editViewer(v) {
  resetViewerForm();
  state.editingViewer = v.username;
  $('#viewer-username').value = v.username;
  $('#viewer-username').readOnly = true;
  $('#viewer-password').required = false;
  $('#viewer-password').placeholder = 'Leave blank to keep current';
  $('#viewer-form-title').textContent = `Edit ${v.username}`;
  $('#viewer-submit').textContent = 'Save changes';
  $('#viewer-cancel-edit').hidden = false;
  renderCompanyPicks(v.companyId);
  $('#viewer-password').focus();
}

async function saveViewer(e) {
  e.preventDefault();
  const form = e.target;
  showError($('#viewer-error'), '');
  const companyId = form.elements.companyId.value;
  try {
    const password = form.elements.password.value;
    const { username, updated } = await api('/api/viewers', {
      method: 'POST',
      body: { username: form.elements.username.value, password, companyId },
    });
    resetViewerForm();
    toast(updated ? (password ? `Saved ${username}; password changed` : `Saved ${username}`) : `Viewer login ${username} created`);
    await loadViewers();
  } catch (err) {
    showError($('#viewer-error'), err.message);
  }
}

// ---------- companies (admin only) ----------

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.dataset.tab === name ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'));
  $('#reviews-panel').hidden = name !== 'reviews';
  $('#companies-panel').hidden = name !== 'companies';
  $('#posters-panel').hidden = name !== 'posters';
  $('#stats-panel').hidden = name !== 'stats';
  $('#credit-panel').hidden = name !== 'credit';
  if (name === 'stats') renderStats();
  if (name === 'credit') renderCredit();
}

async function loadCompanies() {
  const { companies } = await api('/api/companies');
  state.companies = companies;
}

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
// A company's current package: its Posted/Live reviews since the package start date.
// The package is complete once that reaches the number of reviews ordered.
function packageProgress(company) {
  const done = state.records
    .filter((r) => (r.status === 'Posted' || r.status === 'Live') && sameName(r.client, company.name))
    .filter((r) => !company.startDate || (r.postDate || '') >= company.startDate)
    // Reviews posted before a renewal belong to the previous package, even on the same day.
    .filter((r) => !company.renewedAt || (r.postedAt || `${r.postDate}T23:59:59.999Z`) > company.renewedAt);
  const ordered = company.reviewCount || 0;
  const complete = ordered > 0 && done.length >= ordered;
  // When the package was completed: when its last needed review was posted.
  const times = done.map((r) => r.postedAt || (r.postDate ? `${r.postDate}T00:00:00.000Z` : '')).sort();
  return { done: done.length, ordered, complete, completedAt: complete ? times[ordered - 1] || times.at(-1) || '' : '' };
}
const liveCount = (company) => packageProgress(company).done;
const money = (n) => (n == null ? '' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }));

function renderCompanies() {
  const q = $('#co-search').value.trim().toLowerCase();
  const { key, dir } = state.coSort;
  const rows = state.companies
    .filter((c) => !q || [c.name, ...Object.values(c.listingUrls ?? {})].some((v) => String(v ?? '').toLowerCase().includes(q)))
    .sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null || av === '') return 1;
      if (bv == null || bv === '') return -1;
      return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });

  $('#companies tbody').replaceChildren(
    ...rows.map((c) => {
      const tr = document.createElement('tr');
      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Delete';
      del.addEventListener('click', () => deleteCompany(c));
      const edit = document.createElement('button');
      edit.className = 'btn small';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openCompanyDialog(c));
      const actions = document.createElement('td');
      actions.className = 'row-actions';
      actions.append(edit, del);
      tr.append(
        cell(c.name, 'strong'),
        listingsCell(c.listingUrls),
        progressCell(liveCount(c), c.reviewCount, c),
        cell(formatDate(c.startDate), 'nowrap'),
        cell(formatDate(c.paymentDate), 'nowrap'),
        cell(money(c.amountPaid), 'num'),
        actions,
      );
      return tr;
    }),
  );

  const empty = $('#co-empty');
  empty.hidden = rows.length > 0;
  empty.textContent = state.companies.length ? 'No companies match this search.' : 'No companies yet. Use “+ Add company” to add your first one.';

  document.querySelectorAll('th[data-co-sort]').forEach((th) => {
    th.setAttribute('aria-sort', th.dataset.coSort === key ? (dir === 1 ? 'ascending' : 'descending') : 'none');
  });

  $('#co-count').textContent = state.companies.length;
  $('#co-ordered').textContent = state.companies.reduce((n, c) => n + (c.reviewCount || 0), 0);
  $('#co-live').textContent = state.companies.reduce((n, c) => n + liveCount(c), 0);
  $('#co-paid').textContent = money(state.companies.reduce((n, c) => n + (c.amountPaid || 0), 0));
}

// One small link per platform the company is listed on.
function listingsCell(urls = {}) {
  const td = document.createElement('td');
  const box = document.createElement('div');
  box.className = 'listings';
  td.append(box);
  const entries = Object.entries(urls).filter(([, u]) => /^https?:\/\//i.test(u));
  if (!entries.length) {
    td.className = 'muted';
    box.textContent = '—';
    return td;
  }
  for (const [platform, url] of entries) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `${platform} ↗`;
    box.append(a);
  }
  return td;
}

function progressCell(live, ordered, company) {
  const td = document.createElement('td');
  td.className = 'progress-cell';
  const label = document.createElement('span');
  label.textContent = ordered ? `${live} of ${ordered} posted` : `${live} posted`;
  td.append(label);
  if (ordered && live >= ordered) {
    const pill = document.createElement('span');
    pill.className = 'pill status-live package-pill';
    pill.textContent = 'Package complete';
    pill.title = 'All reviews in this package are posted. Renew with the client.';
    td.append(pill);
  }
  if (ordered) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.min(100, (live / ordered) * 100)}%`;
    if (live >= ordered) bar.classList.add('done');
    bar.append(fill);
    td.append(bar);
  }
  return td;
}

function openCompanyDialog(company) {
  const form = $('#company-form');
  form.reset();
  showError($('#company-error'), '');
  state.editingCompanyId = company?.id ?? null;
  $('#company-title').textContent = company ? 'Edit company' : 'Add company';
  state.renewingAt = null;
  const progress = company ? packageProgress(company) : null;
  $('#company-renew').hidden = !progress?.complete;
  if (company) {
    for (const key of ['name', 'reviewCount', 'paymentDate', 'amountPaid', 'startDate', 'pricePerReview', 'posterPayPerReview']) {
      form.elements[key].value = company[key] ?? '';
    }
  } else {
    form.elements.startDate.value = new Date().toLocaleDateString('en-CA');
  }
  $('#co-listings').replaceChildren(
    ...(state.platforms || ['Google']).map((p) => {
      const label = document.createElement('label');
      label.textContent = p;
      const input = document.createElement('input');
      input.type = 'url';
      input.placeholder = 'https://';
      input.dataset.platform = p;
      input.value = company?.listingUrls?.[p] ?? '';
      label.append(input);
      return label;
    }),
  );
  $('#company-dialog').showModal();
}

async function saveCompany(e) {
  e.preventDefault();
  const form = e.target;
  const body = Object.fromEntries(['name', 'reviewCount', 'paymentDate', 'amountPaid', 'startDate', 'pricePerReview', 'posterPayPerReview'].map((k) => [k, form.elements[k].value]));
  if (state.renewingAt) body.renewedAt = state.renewingAt;
  body.listingUrls = Object.fromEntries([...form.querySelectorAll('#co-listings input')].map((i) => [i.dataset.platform, i.value.trim()]));
  try {
    if (state.editingCompanyId) await api(`/api/companies/${state.editingCompanyId}`, { method: 'PUT', body });
    else await api('/api/companies', { method: 'POST', body });
    $('#company-dialog').close();
    toast(state.editingCompanyId ? 'Company updated' : 'Company added');
    await loadCompanies();
    await loadRecords();
  } catch (err) {
    showError($('#company-error'), err.message);
  }
}

async function deleteCompany(c) {
  if (!(await confirmAction(`Delete ${c.name}? Its review records stay.`, 'Delete'))) return;
  try {
    await api(`/api/companies/${c.id}`, { method: 'DELETE' });
    toast('Company deleted');
    await loadCompanies();
    await loadRecords();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- posters: admin management ----------

async function loadPosters() {
  const { posters } = await api('/api/posters');
  state.posters = posters;
}

function renderPosters() {
  const companyName = new Map(state.companies.map((c) => [c.id, c.name]));
  const rows = [...state.posters].sort((a, b) => a.name.localeCompare(b.name));
  $('#posters tbody').replaceChildren(
    ...rows.map((p) => {
      const tr = document.createElement('tr');
      const names = p.companyIds.map((id) => companyName.get(id)).filter(Boolean);
      const companies = cell(names.length ? names.join(', ') : 'No companies assigned', names.length ? '' : 'warn');
      const posted = state.records.filter((r) => isPosterOf(p, r.posterName) && (r.status === 'Posted' || r.status === 'Live')).length;
      const edit = document.createElement('button');
      edit.className = 'btn small';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openPosterDialog(p));
      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Delete';
      del.addEventListener('click', () => deletePoster(p));
      const actions = document.createElement('td');
      actions.className = 'row-actions';
      actions.append(edit, del);
      tr.append(cell(p.name, 'strong'), cell(p.username), companies, cell(String(posted), 'num'), actions);
      return tr;
    }),
  );
  const empty = $('#posters-empty');
  empty.hidden = rows.length > 0;
  empty.textContent = 'No posters yet. Use “+ Add poster” to create a login for someone who posts reviews.';
}

function renderPosterCompanyPicks(checkedIds = []) {
  const box = $('#poster-companies');
  if (!state.companies.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Add a company in the Companies tab first.';
    box.replaceChildren(p);
    return;
  }
  const checked = new Set(checkedIds);
  box.replaceChildren(
    ...[...state.companies]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const label = document.createElement('label');
        label.className = 'check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'companyIds';
        input.value = c.id;
        input.checked = checked.has(c.id);
        label.append(input, ` ${c.name}`);
        return label;
      }),
  );
}

function openPosterDialog(poster) {
  const form = $('#poster-form');
  form.reset();
  showError($('#poster-error'), '');
  state.editingPosterId = poster?.id ?? null;
  $('#poster-title').textContent = poster ? `Edit ${poster.name}` : 'Add poster';
  $('#poster-username').readOnly = Boolean(poster);
  $('#poster-password').required = !poster;
  $('#poster-password').placeholder = poster ? 'Leave blank to keep current' : '';
  if (poster) {
    $('#poster-name').value = poster.name;
    $('#poster-username').value = poster.username;
  }
  renderPosterCompanyPicks(poster?.companyIds);
  $('#poster-dialog').showModal();
}

async function savePoster(e) {
  e.preventDefault();
  const form = e.target;
  const body = {
    name: form.elements.name.value,
    username: form.elements.username.value,
    password: form.elements.password.value,
    companyIds: [...form.querySelectorAll('input[name=companyIds]:checked')].map((i) => i.value),
  };
  try {
    if (state.editingPosterId) await api(`/api/posters/${state.editingPosterId}`, { method: 'PUT', body });
    else await api('/api/posters', { method: 'POST', body });
    $('#poster-dialog').close();
    toast(state.editingPosterId ? 'Poster updated' : `Poster login ${body.username} created`);
    await loadPosters();
    await loadRecords();
  } catch (err) {
    showError($('#poster-error'), err.message);
  }
}

async function deletePoster(p) {
  if (!(await confirmAction(`Delete poster ${p.name}? Their login stops working. Reviews they posted stay.`, 'Delete'))) return;
  try {
    await api(`/api/posters/${p.id}`, { method: 'DELETE' });
    toast('Poster deleted');
    await loadPosters();
    await loadRecords();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- posters: updating a review ----------

function openPostDialog(r) {
  const form = $('#post-form');
  form.reset();
  showError($('#post-error'), '');
  state.postingId = r.id;
  $('#post-client').textContent = r.client || '—';
  $('#post-platform').textContent = r.platform || 'Google';
  $('#post-listing').textContent = r.listing || '—';
  $('#post-on').textContent = r.postOn ? formatDate(r.postOn) : 'No date set';
  $('#post-review').textContent = r.review || 'No review text.';
  const img = $('#post-image');
  const hasImage = /^https?:\/\//i.test(r.imageUrl || '');
  img.href = hasImage ? r.imageUrl : '#';
  img.textContent = r.imageUrl || '';
  $('#post-image-row').hidden = !r.imageUrl;
  const w = r._warranty;
  $('#post-warranty').textContent = w
    ? `${warrantyText(w)} (${w.kind === 'expired' ? 'ended' : 'ends'} ${formatDate(w.end)})`
    : `Starts when you mark it Posted or Live, and lasts ${state.warrantyDays} days.`;
  img.toggleAttribute('aria-disabled', !hasImage);
  $('#post-copy').hidden = !r.review;
  fillSelect($('#post-status'), state.statuses);
  $('#post-status').value = r.status;
  $('#post-poster').value = r.postedAs || '';
  $('#post-link').value = r.reviewLink || '';
  $('#post-dialog').showModal();
}

async function savePost(e) {
  e.preventDefault();
  const form = e.target;
  const body = {
    postedAs: form.elements.postedAs.value,
    reviewLink: form.elements.reviewLink.value,
    status: form.elements.status.value,
  };
  try {
    await api(`/api/records/${state.postingId}`, { method: 'PATCH', body });
    $('#post-dialog').close();
    toast('Review updated');
    await loadRecords();
  } catch (err) {
    showError($('#post-error'), err.message);
  }
}

async function copyReview() {
  const text = $('#post-review').textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('Review text copied');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#post-review'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    toast('Text selected. Press Ctrl+C (or ⌘C) to copy.');
  }
}

// ---------- statistics (admin only) ----------

const isPostedStatus = (s) => s === 'Posted' || s === 'Live';
const companyFor = (r) => state.companies.find((c) => sameName(c.name, r.client));
// A review's Poster ID is the poster's username; older reviews may hold the poster's display name.
const isPosterOf = (p, value) => Boolean(value) && (sameName(p.username, value) || sameName(p.name, value));
const posterFor = (r) => state.posters.find((p) => isPosterOf(p, r.posterName));
// A review's own locked-in price wins; otherwise the current company price / poster rate applies.
const clientPriceOf = (r) => r.clientPrice ?? companyFor(r)?.pricePerReview ?? null;
const posterPayOf = (r) => r.posterPay ?? companyFor(r)?.posterPayPerReview ?? null;

function statsRange(period) {
  const now = new Date();
  const iso = (d) => d.toLocaleDateString('en-CA');
  const y = now.getFullYear(), m = now.getMonth();
  if (period === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (period === 'lastmonth') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (period === '30') return [iso(new Date(y, m, now.getDate() - 29)), iso(now)];
  if (period === 'year') return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
  return null;
}

function renderStats() {
  const companySel = $('#stats-company');
  fillSelect(companySel, [...state.companies].map((c) => c.name).sort((a, b) => a.localeCompare(b)), 'All companies');
  const range = statsRange($('#stats-period').value);
  $('#stats-range').textContent = range
    ? `Reviews with a post date from ${formatDate(range[0])} to ${formatDate(range[1])}.`
    : 'All reviews, whatever their post date.';

  const inScope = state.records.filter((r) =>
    (!companySel.value || sameName(r.client, companySel.value)) &&
    (!range || (r.postDate >= range[0] && r.postDate <= range[1])));

  // Charged: every Posted/Live review. Paid out: every review marked poster paid.
  // Owed: Posted/Live reviews not yet marked poster paid.
  const sum = (list, fn) => list.reduce((n, r) => n + (fn(r) ?? 0), 0);
  const posted = inScope.filter((r) => isPostedStatus(r.status));
  const paidList = inScope.filter((r) => r.paid);
  const owedList = posted.filter((r) => !r.paid);
  const charged = sum(posted, clientPriceOf);
  const paidOut = sum(paidList, posterPayOf);
  const owed = sum(owedList, posterPayOf);
  const profit = charged - paidOut - owed;

  $('#st-count').textContent = posted.length;
  $('#st-charged').textContent = money(charged);
  $('#st-paid').textContent = money(paidOut);
  $('#st-owed').textContent = money(owed);
  $('#st-profit').textContent = money(profit);
  $('#st-profit').classList.toggle('negative', profit < 0);
  $('#st-margin').textContent = charged > 0 ? `Profit · ${Math.round((profit / charged) * 100)}% margin` : 'Profit';

  const noClient = posted.filter((r) => clientPriceOf(r) == null).length;
  const noPoster = [...new Set([...posted, ...paidList])].filter((r) => posterPayOf(r) == null).length;
  const missing = [];
  if (noClient) missing.push(`${noClient} posted review${noClient === 1 ? ' has' : 's have'} no client price`);
  if (noPoster) missing.push(`${noPoster} review${noPoster === 1 ? ' has' : 's have'} no poster pay`);
  $('#st-missing').hidden = !missing.length;
  const single = noClient + noPoster === 1;
  $('#st-missing').textContent = missing.length ? `${missing.join(' and ')}, so ${single ? 'it counts' : 'they count'} as $0. Set prices below.` : '';

  // By company
  const byCompany = new Map();
  for (const r of inScope) {
    const key = companyFor(r)?.name ?? (r.client || 'No client');
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(r);
  }
  const companyRows = [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, list]) => {
    const p = list.filter((r) => isPostedStatus(r.status));
    const ch = sum(p, clientPriceOf);
    const cost = sum(list.filter((r) => r.paid), posterPayOf) + sum(p.filter((r) => !r.paid), posterPayOf);
    const co = state.companies.find((c) => c.name === name);
    const fmt = (v) => (v == null ? '—' : money(v));
    return [name, co ? `${fmt(co.pricePerReview)} / ${fmt(co.posterPayPerReview)}` : '—', String(p.length), money(ch), money(cost), money(ch - cost), ch - cost < 0];
  });
  fillStatsTable('#stats-companies', companyRows, 'No reviews in this period.');

  // By platform
  const platformRows = (state.platforms || []).map((name) => {
    const list = inScope.filter((r) => (r.platform || 'Google') === name);
    const p = list.filter((r) => isPostedStatus(r.status));
    const ch = sum(p, clientPriceOf);
    const cost = sum(list.filter((r) => r.paid), posterPayOf) + sum(p.filter((r) => !r.paid), posterPayOf);
    return { name, count: p.length, ch, cost, any: list.length };
  }).filter((x) => x.any).map(({ name, count, ch, cost }) =>
    [name, String(count), money(ch), money(cost), money(ch - cost), ch > 0 ? `${Math.round(((ch - cost) / ch) * 100)}%` : '—', ch - cost < 0]);
  fillStatsTable('#stats-platforms', platformRows, 'No reviews in this period.');

  // By poster
  const byPoster = new Map();
  for (const r of inScope) {
    if (!r.posterName && !r.paid) continue;
    const key = posterFor(r)?.name ?? (r.posterName || 'No poster ID');
    if (!byPoster.has(key)) byPoster.set(key, []);
    byPoster.get(key).push(r);
  }
  const posterRows = [...byPoster.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, list]) => {
    const p = list.filter((r) => isPostedStatus(r.status));
    const paid = sum(list.filter((r) => r.paid), posterPayOf);
    const owe = sum(p.filter((r) => !r.paid), posterPayOf);
    const credit = sum(list.filter((r) => creditInfo(r) && !r.creditSettledAt), posterPayOf);
    return [name, String(p.length), money(paid + owe), money(paid), money(owe), money(credit), false];
  });
  fillStatsTable('#stats-posters', posterRows, 'No posted reviews in this period.');

  renderPriceInputs();
}

function fillStatsTable(sel, rows, emptyText) {
  const tbody = $(`${sel} tbody`);
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = cell(emptyText, 'muted');
    td.colSpan = 6;
    tr.append(td);
    tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren(
    ...rows.map(([name, ...nums]) => {
      const negative = nums.pop();
      const tr = document.createElement('tr');
      tr.append(cell(name, 'strong'), ...nums.map((n, i) => cell(n, i === nums.length - 1 && negative ? 'num negative' : 'num')));
      return tr;
    }),
  );
}

function priceInput(name, id, value, group) {
  const label = document.createElement('label');
  label.className = 'price-row';
  const span = document.createElement('span');
  span.textContent = name;
  const wrap = document.createElement('span');
  wrap.className = 'money-input';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '0.01';
  input.inputMode = 'decimal';
  input.placeholder = 'Not set';
  input.dataset.group = group;
  input.dataset.id = id;
  input.value = value ?? '';
  input.setAttribute('aria-label', `${name}: ${group === 'price' ? 'client price' : 'poster pay'} per review`);
  wrap.append('$', input);
  return wrap;
}

function renderPriceInputs() {
  // Don't overwrite what the admin is typing.
  if ($('#prices-form').contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const empty = (text) => Object.assign(document.createElement('p'), { className: 'muted', textContent: text });
  const companies = [...state.companies].sort((a, b) => a.name.localeCompare(b.name));
  if (!companies.length) {
    const tr = document.createElement('tr');
    const td = cell('Add companies in the Companies tab.', 'muted');
    td.colSpan = 3;
    tr.append(td);
    $('#price-companies').replaceChildren(tr);
    return;
  }
  $('#price-companies').replaceChildren(
    ...companies.map((c) => {
      const tr = document.createElement('tr');
      const price = document.createElement('td');
      price.className = 'num';
      price.append(priceInput(c.name, c.id, c.pricePerReview, 'price'));
      const pay = document.createElement('td');
      pay.className = 'num';
      pay.append(priceInput(c.name, c.id, c.posterPayPerReview, 'posterPay'));
      tr.append(cell(c.name, 'strong'), price, pay);
      return tr;
    }),
  );
}

async function savePrices(e) {
  e.preventDefault();
  const body = { companies: {}, applyToPosted: $('#prices-apply').checked };
  for (const input of e.target.querySelectorAll('input[data-group]')) {
    (body.companies[input.dataset.id] ??= {})[input.dataset.group] = input.value;
  }
  if (body.applyToPosted && !(await confirmAction('Replace the prices on every review already posted for these companies? This changes past totals.', 'Update all'))) return;
  try {
    const { updated } = await api('/api/prices', { method: 'PUT', body });
    $('#prices-apply').checked = false;
    document.activeElement?.blur();
    toast(body.applyToPosted ? `Prices saved and applied to ${updated} posted review${updated === 1 ? '' : 's'}` : 'Prices saved');
    await Promise.all([loadCompanies(), loadPosters()]);
    await loadRecords();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- poster notifications ----------

// A poster is notified about Pending reviews that are open or assigned to them:
// when the review is added or assigned, when its Post on date arrives, and while it is overdue.
// A viewer is notified when a review for their company is first posted (Posted or Live).
function buildViewerNotifications() {
  const recent = new Date(Date.now() - 30 * 86400000).toISOString();
  return state.records
    .filter((r) => (r.status === 'Posted' || r.status === 'Live') && r.postedAt && r.postedAt > recent)
    .map((r) => ({
      r,
      time: r.postedAt,
      kind: 'posted',
      title: `${r.client || 'Your business'}: new ${r.platform || 'Google'} review posted`,
      sub: [r.postDate ? `Posted ${formatDate(r.postDate)}` : 'Posted', /^https?:\/\//i.test(r.reviewLink || '') ? `View on ${r.platform || 'Google'} ↗` : '']
        .filter(Boolean).join(' · '),
      unread: r.postedAt > state.seenAt,
    }))
    .sort((a, b) => (b.unread - a.unread) || b.time.localeCompare(a.time));
}

// The admin is notified when a company's package is complete, so it can be renewed.
function buildAdminNotifications() {
  return state.companies
    .map((c) => ({ c, p: packageProgress(c) }))
    .filter(({ p }) => p.complete)
    .map(({ c, p }) => ({
      company: c,
      time: p.completedAt,
      kind: 'renew',
      title: `${c.name}: package complete`,
      sub: `${p.done} of ${p.ordered} reviews posted · Renew with the client`,
      unread: p.completedAt > state.seenAt,
    }))
    .sort((a, b) => (b.unread - a.unread) || b.time.localeCompare(a.time));
}

function buildNotifications() {
  if (state.user?.role === 'viewer') return buildViewerNotifications();
  if (state.user?.role === 'admin') return buildAdminNotifications();
  const me = state.user?.name;
  const items = [];
  const localMidnight = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toISOString();
  };
  const recent = Date.now() - 14 * 86400000;
  for (const r of state.records) {
    if (r.status !== 'Pending') continue;
    // The server sends a poster their own reviews and their companies' unassigned ones.
    const mine = Boolean(r.posterName);
    const client = r.client || 'A client';
    const added = mine && r.assignedAt > (r.createdAt || '') ? r.assignedAt : r.createdAt;
    const isNew = added && new Date(added).getTime() > recent;
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(r.postOn || '');
    const days = hasDate ? daysUntil(r.postOn) : 1;
    if (!isNew && days > 0) continue;
    // One notification per review: its due state if the date has come, otherwise that it is new.
    const what = mine ? 'review assigned to you' : 'new review to post';
    const times = [isNew ? added : '', days <= 0 ? localMidnight(r.postOn) : ''];
    items.push({
      r,
      time: times.sort().pop(),
      kind: days < 0 ? 'overdue' : days === 0 ? 'due' : 'new',
      title: days < 0 ? `${client}: review overdue` : days === 0 ? `${client}: review due today` : `${client}: ${what}`,
      sub: [
        days < 0 ? `Was due ${formatDate(r.postOn)} · ${-days} day${days === -1 ? '' : 's'} late`
          : hasDate ? `Post on ${formatDate(r.postOn)}` : 'No post date set',
        days <= 0 && isNew ? (mine ? 'Assigned to you' : 'New') : '',
      ].filter(Boolean).join(' · '),
    });
  }
  for (const n of items) n.unread = n.time > state.seenAt;
  return items.sort((a, b) => (b.unread - a.unread) || b.time.localeCompare(a.time));
}

function renderNotifications() {
  const items = buildNotifications();
  const unread = items.filter((n) => n.unread).length;
  const badge = $('#notif-count');
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  $('#notif-btn').setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
  document.title = unread ? `(${unread}) Reputation Pilot` : 'Reputation Pilot';
  $('#notif-summary').textContent = unread ? `${unread} new` : '';

  const list = $('#notif-list');
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'notif-empty';
    li.textContent = {
      viewer: 'No new reviews yet. You will be notified here when a review is posted.',
      admin: 'No packages to renew. You will be notified here when a company has all its reviews posted.',
    }[state.user?.role] ?? 'Nothing to post right now. New reviews and due dates will show up here.';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(
    ...items.map((n) => {
      const li = document.createElement('li');
      // A viewer's posted review opens on Google; everything else is a button.
      const link = n.kind === 'posted' && /^https?:\/\//i.test(n.r.reviewLink || '');
      const btn = document.createElement(link ? 'a' : 'button');
      if (link) {
        btn.href = n.r.reviewLink;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
      } else btn.type = 'button';
      btn.className = `notif-item kind-${n.kind}${n.unread ? ' unread' : ''}`;
      const title = document.createElement('span');
      title.className = 'notif-title';
      title.textContent = n.title;
      const sub = document.createElement('span');
      sub.className = 'notif-sub';
      sub.textContent = n.sub;
      btn.append(title, sub);
      btn.addEventListener('click', () => {
        closeNotifications();
        if (n.kind === 'renew') openCompanyDialog(n.company);
        else if (n.kind !== 'posted') openPostDialog(n.r);
        else if (!link) showRow(n.r.id);
      });
      li.append(btn);
      return li;
    }),
  );
}

function showRow(id) {
  const tr = document.querySelector(`#records tbody tr[data-id="${CSS.escape(id)}"]`);
  if (!tr) return;
  tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tr.classList.add('flash');
  setTimeout(() => tr.classList.remove('flash'), 2000);
}

async function openNotifications() {
  renderNotifications();
  $('#notif-panel').hidden = false;
  $('#notif-btn').setAttribute('aria-expanded', 'true');
  // Opening the panel marks everything as read; the list keeps its highlights until it closes.
  if (buildNotifications().some((n) => n.unread)) {
    try {
      const { notificationsSeenAt } = await api('/api/notifications/seen', { method: 'POST', body: {} });
      state.seenAt = notificationsSeenAt;
      $('#notif-count').hidden = true;
      document.title = 'Reputation Pilot';
    } catch {}
  }
}

function closeNotifications() {
  if ($('#notif-panel').hidden) return;
  $('#notif-panel').hidden = true;
  $('#notif-btn').setAttribute('aria-expanded', 'false');
  renderNotifications();
}

// ---------- credit ----------

// A credit is a review the poster was paid for that was removed within the warranty:
// the poster owes a replacement. Returns null for anything else.
function creditInfo(r) {
  if (!r.paid || r.status !== 'Removed') return null;
  const removedOn = r.removedAt ? new Date(r.removedAt).toLocaleDateString('en-CA') : '';
  const end = /^\d{4}-\d{2}-\d{2}$/.test(r.postDate || '') ? addDays(r.postDate, state.warrantyDays) : '';
  if (end && removedOn && removedOn > end) return null;
  return { removedOn, end, settled: Boolean(r.creditSettledAt) };
}

const pill = (text, cls) => {
  const span = document.createElement('span');
  span.className = `pill ${cls}`;
  span.textContent = text;
  return span;
};

function statTile(num, label) {
  const div = document.createElement('div');
  div.className = 'stat';
  div.append(Object.assign(document.createElement('span'), { className: 'stat-num', textContent: num }),
    Object.assign(document.createElement('span'), { className: 'stat-label', textContent: label }));
  return div;
}

function setHead(labels) {
  const tr = document.createElement('tr');
  for (const [label, cls] of labels) {
    const th = document.createElement('th');
    th.textContent = label;
    if (cls) th.className = cls;
    tr.append(th);
  }
  $('#credit-table thead').replaceChildren(tr);
}

function renderCredit() {
  const isAdmin = state.user?.role === 'admin';
  const filter = $('#credit-filter');
  const options = isAdmin
    ? [['open', 'Credits owed'], ['settled', 'Credits replaced'], ['all', 'All credits']]
    : [['all', 'All my paid reviews'], ['paid', 'Paid'], ['credit', 'Credit']];
  if (filter.dataset.role !== state.user?.role) {
    filter.replaceChildren(...options.map(([v, l]) => new Option(l, v)));
    filter.dataset.role = state.user?.role;
  }
  const money0 = (n) => money(n || 0);

  if (isAdmin) {
    $('#credit-intro').textContent = `Reviews a poster was paid for that were removed within the ${state.warrantyDays}-day warranty. The poster owes a replacement. Mark it replaced once they have made up for it.`;
    const posterSel = $('#credit-poster');
    fillSelect(posterSel, [...new Set(state.records.filter(creditInfo).map((r) => r.posterName || 'No poster ID'))].sort(), 'All posters');
    const all = state.records.filter(creditInfo);
    const open = all.filter((r) => !r.creditSettledAt);
    $('#credit-stats').replaceChildren(
      statTile(String(open.length), 'Credits owed'),
      statTile(money0(open.reduce((n, r) => n + (posterPayOf(r) ?? 0), 0)), 'Value owed by posters'),
      statTile(String(all.length - open.length), 'Replaced'),
    );
    const rows = all
      .filter((r) => filter.value === 'all' || (filter.value === 'settled') === Boolean(r.creditSettledAt))
      .filter((r) => !posterSel.value || (r.posterName || 'No poster ID') === posterSel.value)
      .sort((a, b) => (b.removedAt || '').localeCompare(a.removedAt || ''));
    setHead([['Client'], ['Posted as'], ['Poster ID'], ['Posted on'], ['Removed on'], ['Warranty ended'], ['Poster pay', 'num'], ['Status'], ['']]);
    $('#credit-table tbody').replaceChildren(...rows.map((r) => {
      const c = creditInfo(r);
      const tr = document.createElement('tr');
      const status = document.createElement('td');
      status.append(c.settled ? pill('Replaced', 'status-live') : pill('Owed', 'status-removed'));
      const act = document.createElement('td');
      act.className = 'row-actions';
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = c.settled ? 'Reopen' : 'Mark replaced';
      btn.addEventListener('click', async () => {
        try {
          await api(`/api/records/${r.id}/credit`, { method: 'POST', body: { settled: !c.settled } });
          toast(c.settled ? 'Credit reopened' : 'Credit marked replaced');
          await loadRecords();
        } catch (err) {
          toast(err.message);
        }
      });
      act.append(btn);
      tr.append(clientCell(r), cell(r.postedAs), cell(r.posterName || '—'), cell(formatDate(r.postDate), 'nowrap'),
        cell(formatDate(c.removedOn), 'nowrap'), cell(formatDate(c.end) || '—', 'nowrap'), cell(money0(posterPayOf(r)), 'num'), status, act);
      return tr;
    }));
    showCreditEmpty(rows.length, all.length ? 'No credits match this filter.' : 'No credits. Paid reviews removed within the warranty will show up here.');
    return;
  }

  // Poster: every review they were paid for; removed within the warranty means Credit.
  $('#credit-intro').textContent = `Reviews you were paid for. If one is removed within ${state.warrantyDays} days of being posted, it becomes a credit: you owe a replacement review.`;
  const paid = state.records.filter((r) => r.paid);
  const credits = paid.filter((r) => creditInfo(r) && !r.creditSettledAt);
  $('#credit-stats').replaceChildren(
    statTile(String(paid.length), 'Paid reviews'),
    statTile(money0(paid.reduce((n, r) => n + (r.posterPay ?? 0), 0)), 'Total paid to you'),
    statTile(String(credits.length), 'Credits you owe'),
    statTile(money0(credits.reduce((n, r) => n + (r.posterPay ?? 0), 0)), 'Credit value'),
  );
  const rows = paid
    .filter((r) => filter.value === 'all' || (filter.value === 'credit') === Boolean(creditInfo(r)))
    .sort((a, b) => (b.postDate || '').localeCompare(a.postDate || ''));
  setHead([['Client'], ['Posted as'], ['Posted on'], ['Status'], ['Pay', 'num'], ['Payment']]);
  $('#credit-table tbody').replaceChildren(...rows.map((r) => {
    const c = creditInfo(r);
    const tr = document.createElement('tr');
    const pay = document.createElement('td');
    if (!c) pay.append(pill('Paid', 'paid'));
    else {
      pay.append(c.settled ? pill('Credit · replaced', 'status-posted') : pill('Credit', 'status-removed'));
      const sub = document.createElement('div');
      sub.className = 'platform-tag';
      sub.textContent = `Removed ${formatDate(c.removedOn)}`;
      pay.append(sub);
    }
    tr.append(clientCell(r), cell(r.postedAs), cell(formatDate(r.postDate), 'nowrap'), statusCell(r.status), cell(money0(r.posterPay), 'num'), pay);
    return tr;
  }));
  showCreditEmpty(rows.length, paid.length ? 'Nothing matches this filter.' : 'No paid reviews yet.');
}

function showCreditEmpty(count, text) {
  $('#credit-empty').hidden = count > 0;
  $('#credit-empty').textContent = text;
}

// ---------- wiring ----------

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = $('button[type=submit]', form);
  btn.disabled = true;
  showError($('#login-error'), '');
  try {
    const user = await api('/api/login', {
      method: 'POST',
      body: { username: form.elements.username.value, password: form.elements.password.value },
    });
    await showApp(user);
  } catch (err) {
    showError($('#login-error'), err.message);
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST', body: {} }).catch(() => {});
  showLogin();
});

['#search', '#filter-client', '#filter-platform', '#filter-poster', '#filter-status', '#filter-paid', '#filter-warranty'].forEach((sel) =>
  $(sel).addEventListener('input', render),
);

document.querySelectorAll('th[data-sort]').forEach((th) =>
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
    render();
  }),
);

$('#add-btn').addEventListener('click', () => openRecordDialog(null));
$('#notif-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#notif-panel').hidden ? openNotifications() : closeNotifications();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.notif')) closeNotifications();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeNotifications();
});
$('#select-all').addEventListener('change', (e) => {
  for (const r of filteredRecords()) e.target.checked ? state.selected.add(r.id) : state.selected.delete(r.id);
  render();
});
$('#bulk-paid').addEventListener('click', () => bulkUpdate({ paid: true }, 'marked poster paid'));
$('#bulk-unpaid').addEventListener('click', () => bulkUpdate({ paid: false }, 'marked poster unpaid'));
$('#bulk-status').addEventListener('change', (e) => {
  const status = e.target.value;
  e.target.value = '';
  if (status) bulkUpdate({ status }, `set to ${status}`);
});
$('#bulk-clear').addEventListener('click', () => {
  state.selected.clear();
  render();
});
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
$('#add-company-btn').addEventListener('click', () => openCompanyDialog(null));
$('#credit-filter').addEventListener('input', renderCredit);
$('#credit-poster').addEventListener('input', renderCredit);
// Renewing starts a new package today: same review count, payment to fill in again.
$('#company-renew').addEventListener('click', () => {
  const form = $('#company-form');
  form.elements.startDate.value = new Date().toLocaleDateString('en-CA');
  form.elements.paymentDate.value = '';
  form.elements.amountPaid.value = '';
  state.renewingAt = new Date().toISOString();
  $('#company-renew').hidden = true;
  form.elements.reviewCount.focus();
  toast('New package starts today. Check the number of reviews and payment, then Save.');
});
$('#add-poster-btn').addEventListener('click', () => openPosterDialog(null));
$('#stats-period').addEventListener('input', renderStats);
$('#stats-company').addEventListener('input', renderStats);
$('#prices-form').addEventListener('submit', savePrices);
$('#poster-form').addEventListener('submit', savePoster);
$('#post-form').addEventListener('submit', savePost);
$('#post-copy').addEventListener('click', copyReview);
$('#company-form').addEventListener('submit', saveCompany);
$('#co-search').addEventListener('input', renderCompanies);
document.querySelectorAll('th[data-co-sort]').forEach((th) =>
  th.addEventListener('click', () => {
    const key = th.dataset.coSort;
    state.coSort = { key, dir: state.coSort.key === key ? -state.coSort.dir : 1 };
    renderCompanies();
  }),
);
// Picking a known company and platform fills in that platform's listing link.
function fillListing() {
  const form = $('#record-form');
  const company = state.companies.find((c) => sameName(c.name, form.elements.client.value));
  const url = company?.listingUrls?.[form.elements.platform.value];
  const known = Object.values(company?.listingUrls ?? {});
  if (url && (!form.elements.listing.value || known.includes(form.elements.listing.value))) form.elements.listing.value = url;
}
$('#record-form').elements.client.addEventListener('change', fillListing);
$('#record-form').elements.platform.addEventListener('change', fillListing);
$('#record-form').addEventListener('submit', saveRecord);
$('#export-btn').addEventListener('click', exportCsv);

$('#import-btn').addEventListener('click', () => {
  $('#import-form').reset();
  previewImport();
  $('#import-dialog').showModal();
});
$('#import-file').addEventListener('change', previewImport);
$('#import-form').addEventListener('submit', runImport);

$('#viewers-btn').addEventListener('click', async () => {
  showError($('#viewer-error'), '');
  resetViewerForm();
  $('#viewers-dialog').showModal();
  await loadViewers().catch((err) => showError($('#viewer-error'), err.message));
});
$('#viewer-form').addEventListener('submit', saveViewer);
$('#viewer-cancel-edit').addEventListener('click', resetViewerForm);

document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

api('/api/me').then(showApp, () => showLogin());
