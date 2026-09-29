const $ = (sel, root = document) => root.querySelector(sel);

const COLUMNS = [
  ['client', 'Client'],
  ['listing', 'Listing'],
  ['pace', 'Pace'],
  ['review', 'Review'],
  ['imageUrl', 'Image URL'],
  ['postDate', 'Post Date'],
  ['posterName', 'Poster Name'],
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
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#login-form').reset();
  $('input[name=username]', $('#login-form')).focus();
}

async function showApp(user) {
  state.user = user;
  document.body.classList.toggle('is-admin', user.role === 'admin');
  document.body.classList.toggle('is-poster', user.role === 'poster');
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
  const { records, statuses } = await api('/api/records');
  state.records = records;
  state.statuses = statuses;
  const ids = new Set(records.map((r) => r.id));
  for (const id of state.selected) if (!ids.has(id)) state.selected.delete(id);
  fillSelect($('#bulk-status'), statuses, 'Change status to…');
  fillSelect($('#filter-status'), statuses, 'All statuses');
  fillSelect($('[name=status]', $('#record-form')), statuses);
  const clients = [...new Set(records.map((r) => r.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  fillSelect($('#filter-client'), clients, 'All clients');
  const names = [...new Set([...clients, ...state.companies.map((c) => c.name)])].sort((a, b) => a.localeCompare(b));
  $('#client-options').replaceChildren(...names.map((c) => new Option(c)));
  $('#poster-options').replaceChildren(...state.posters.map((p) => new Option(p.name)));
  render();
  if (state.user?.role === 'admin') {
    renderCompanies();
    renderPosters();
  }
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
  const paid = $('#filter-paid').value;
  const { key, dir } = state.sort;
  return state.records
    .filter((r) => !client || r.client === client)
    .filter((r) => !status || r.status === status)
    .filter((r) => !paid || (paid === 'yes') === r.paid)
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
      if (isAdmin) tr.append(selectCell(r));
      tr.append(
        cell(r.client, 'strong'),
        cell(r.listing),
        cell(r.pace),
        reviewCell(r.review),
        linkCell(r.imageUrl, 'View ↗'),
        cell(formatDate(r.postDate), 'nowrap'),
        cell(r.posterName),
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
      : state.user?.companies?.length === 0
        ? isPoster
          ? 'No companies are assigned to you yet. Ask your manager to set it up.'
          : 'No company is linked to this login yet. Ask your account manager to set it up.'
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
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
    form.elements.postDate.value = new Date().toLocaleDateString('en-CA');
    form.elements.status.value = state.statuses[0] ?? '';
    const client = $('#filter-client').value;
    if (client) form.elements.client.value = client;
  }
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
HEADER_KEYS.place = 'pace';
HEADER_KEYS.date = 'postDate';
HEADER_KEYS.poster = 'posterName';
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
  const cols = state.user?.role === 'admin' ? COLUMNS : COLUMNS.filter(([k]) => k !== 'paid');
  const lines = [cols.map(([, l]) => l).join(',')];
  for (const r of filteredRecords()) {
    lines.push(cols.map(([k]) => esc(k === 'paid' ? (r.paid ? 'Yes' : 'No') : r[k])).join(','));
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
}

async function loadCompanies() {
  const { companies } = await api('/api/companies');
  state.companies = companies;
}

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const liveCount = (company) => state.records.filter((r) => r.status === 'Live' && sameName(r.client, company.name)).length;
const money = (n) => (n == null ? '' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }));

function renderCompanies() {
  const q = $('#co-search').value.trim().toLowerCase();
  const { key, dir } = state.coSort;
  const rows = state.companies
    .filter((c) => !q || [c.name, c.listingUrl].some((v) => String(v ?? '').toLowerCase().includes(q)))
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
        linkCell(c.listingUrl),
        progressCell(liveCount(c), c.reviewCount),
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

function progressCell(live, ordered) {
  const td = document.createElement('td');
  td.className = 'progress-cell';
  const label = document.createElement('span');
  label.textContent = ordered ? `${live} of ${ordered} live` : `${live} live`;
  td.append(label);
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
  if (company) {
    for (const key of ['name', 'listingUrl', 'reviewCount', 'paymentDate', 'amountPaid', 'startDate']) {
      form.elements[key].value = company[key] ?? '';
    }
  } else {
    form.elements.startDate.value = new Date().toLocaleDateString('en-CA');
  }
  $('#company-dialog').showModal();
}

async function saveCompany(e) {
  e.preventDefault();
  const form = e.target;
  const body = Object.fromEntries(['name', 'listingUrl', 'reviewCount', 'paymentDate', 'amountPaid', 'startDate'].map((k) => [k, form.elements[k].value]));
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
      const posted = state.records.filter((r) => sameName(r.posterName, p.name) && (r.status === 'Posted' || r.status === 'Live')).length;
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
  $('#post-listing').textContent = r.listing || '—';
  $('#post-review').textContent = r.review || 'No review text.';
  const img = $('#post-image');
  const hasImage = /^https?:\/\//i.test(r.imageUrl || '');
  img.href = hasImage ? r.imageUrl : '#';
  img.textContent = r.imageUrl || '';
  $('#post-image-row').hidden = !r.imageUrl;
  img.toggleAttribute('aria-disabled', !hasImage);
  $('#post-copy').hidden = !r.review;
  fillSelect($('#post-status'), state.statuses);
  $('#post-status').value = r.status;
  $('#post-poster').value = r.posterName || state.user?.name || '';
  $('#post-link').value = r.reviewLink || '';
  $('#post-dialog').showModal();
}

async function savePost(e) {
  e.preventDefault();
  const form = e.target;
  const body = {
    posterName: form.elements.posterName.value,
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

['#search', '#filter-client', '#filter-status', '#filter-paid'].forEach((sel) =>
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
$('#add-poster-btn').addEventListener('click', () => openPosterDialog(null));
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
// Picking a known company as the client fills in its listing URL.
$('#record-form').elements.client.addEventListener('change', (e) => {
  const listing = $('#record-form').elements.listing;
  const company = state.companies.find((c) => sameName(c.name, e.target.value));
  if (company?.listingUrl && !listing.value) listing.value = company.listingUrl;
});
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
