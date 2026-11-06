const $ = s => document.querySelector(s);
let currentPath = '';
let entries = [];
let activeFilter = 'all';
let toastTimer;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : response;
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
const formatBytes = n => {
  if (!n) return '—';
  const units = ['B','KB','MB','GB'];
  let i = 0; while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
};
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconFor = item => item.type === 'folder' ? '▰' : item.mime?.startsWith('image/') ? '▧' : item.mime === 'application/pdf' ? 'PDF' : item.mime?.includes('zip') ? 'ZIP' : '▤';
const kindFor = item => item.type === 'folder' ? 'folder' : item.mime?.startsWith('image/') ? 'image' : 'document';

function showToast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast show${error ? ' error-toast' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = 'toast', 2800);
}
function showModal(html) {
  $('#modalContent').innerHTML = html; $('#modalBackdrop').classList.remove('hidden');
}
function closeModal() { $('#modalBackdrop').classList.add('hidden'); }
$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', e => { if (e.target === $('#modalBackdrop')) closeModal(); });

async function checkSession() {
  const data = await api('/api/me');
  if (data.user) { $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden'); $('#profileName').textContent = data.user.username; await loadFiles(); }
  else { $('#appView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); }
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginError').textContent = '';
  const form = new FormData(e.currentTarget);
  try { await api('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(form)) }); await checkSession(); }
  catch (err) { $('#loginError').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { await api('/api/logout', {method:'POST'}); currentPath=''; await checkSession(); });

async function loadFiles() {
  try {
    const data = await api(`/api/files?path=${encodeURIComponent(currentPath)}`);
    entries = data.entries;
    render();
    const stats = await api('/api/stats');
    const percent = Math.min(100, stats.bytes / stats.limit * 100);
    $('#storageBar').style.width = `${percent}%`;
    $('#storagePercent').textContent = `${percent.toFixed(1)}%`;
    $('#storageText').textContent = `${formatBytes(stats.bytes)} of 1 GB used`;
  } catch (e) { showToast(e.message, true); }
}
function visibleEntries() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const filtered = entries.filter(item => {
    const matchesSearch = !q || item.name.toLowerCase().includes(q);
    const matchesFilter = activeFilter === 'all' || activeFilter === 'recent' ||
      (activeFilter === 'folder' && item.type === 'folder') ||
      (activeFilter === 'image' && kindFor(item) === 'image') ||
      (activeFilter === 'document' && kindFor(item) === 'document');
    return matchesSearch && matchesFilter;
  });
  if (activeFilter === 'recent') {
    return filtered.filter(item => item.type === 'file')
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
  }
  return filtered;
}
function render() {
  const shown = visibleEntries();
  $('#breadcrumbs').innerHTML = `<button data-crumb="">My files</button>` + (currentPath ? currentPath.split('/').map((part, i, arr) => `<span class="crumb-sep">/</span><button data-crumb="${escapeHtml(arr.slice(0,i+1).join('/'))}">${escapeHtml(part)}</button>`).join('') : '');
  $('#breadcrumbs').querySelectorAll('[data-crumb]').forEach(btn => btn.addEventListener('click', () => { currentPath = btn.dataset.crumb; activeFilter='all'; loadFiles(); }));
  $('#pageTitle').textContent = currentPath ? currentPath.split('/').pop() : (activeFilter === 'all' ? 'My files' : activeFilter[0].toUpperCase()+activeFilter.slice(1));
  $('#listHeading').textContent = activeFilter === 'all' ? (currentPath ? 'Folder contents' : 'All files') : `${activeFilter[0].toUpperCase()+activeFilter.slice(1)} items`;
  $('#itemCount').textContent = `${shown.length} ${shown.length === 1 ? 'item' : 'items'}`;
  $('#totalItems').textContent = entries.length;
  $('#totalFiles').textContent = entries.filter(x => x.type === 'file').length;
  $('#totalFolders').textContent = entries.filter(x => x.type === 'folder').length;
  $('#fileList').innerHTML = shown.map(item => `
    <div class="file-row">
      <div class="file-name-cell">
        <div class="file-type-icon ${item.type === 'folder' ? 'folder-type' : item.mime?.startsWith('image/') ? 'image-type' : 'doc-type'}">${iconFor(item)}</div>
        <button class="file-name ${item.type === 'folder' ? 'folder-name' : ''}" data-open="${escapeHtml(item.path)}" data-kind="${item.type}">${escapeHtml(item.name)}</button>
      </div>
      <span class="file-date">${new Date(item.modified).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span>
      <span class="file-size">${formatBytes(item.size)}</span>
      <div class="row-actions"><button data-menu="${escapeHtml(item.path)}" title="More actions">···</button></div>
    </div>`).join('');
  $('#emptyState').classList.toggle('hidden', shown.length > 0);
  $('#fileList').classList.toggle('hidden', shown.length === 0);
  $('#fileList').querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => {
    const item = entries.find(x => x.path === btn.dataset.open);
    if (btn.dataset.kind === 'folder') { currentPath = item.path; activeFilter='all'; $('#searchInput').value=''; loadFiles(); }
    else preview(item);
  }));
  $('#fileList').querySelectorAll('[data-menu]').forEach(btn => btn.addEventListener('click', () => itemMenu(btn.dataset.menu)));
}
function itemMenu(relative) {
  const item = entries.find(x => x.path === relative);
  if (!item) return;
  showModal(`<p class="eyebrow">ITEM ACTIONS</p><h2>${escapeHtml(item.name)}</h2><div class="action-list">
    ${item.type === 'file' ? `<button class="action-option" data-action="download">↓ <span><b>Download</b><small>Save a copy to your device</small></span></button>` : ''}
    <button class="action-option" data-action="rename">✎ <span><b>Rename</b><small>Change the item name</small></span></button>
    <button class="action-option danger" data-action="delete">⌫ <span><b>Delete</b><small>Remove this item permanently</small></span></button>
  </div>`);
  $('#modalContent').querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', async () => {
    const action = b.dataset.action; closeModal();
    if (action === 'download') window.location.href = `/api/download?path=${encodeURIComponent(relative)}`;
    if (action === 'rename') renameItem(relative, item.name);
    if (action === 'delete') deleteItem(relative, item.name);
  }));
}
function renameItem(relative, oldName) {
  showModal(`<p class="eyebrow">RENAME ITEM</p><h2>Give it a new name</h2><form id="renameForm" class="modal-form"><label>New name<input name="newName" value="${escapeHtml(oldName)}" required maxlength="150"></label><button class="btn primary full">Save changes</button></form>`);
  $('#renameForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/api/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:relative,newName:new FormData(e.currentTarget).get('newName')})}); closeModal(); showToast('Item renamed'); await loadFiles(); }
    catch(err){showToast(err.message,true);}
  });
}
function deleteItem(relative, name) {
  showModal(`<p class="eyebrow">DELETE ITEM</p><h2>Delete this item?</h2><p class="muted">“${escapeHtml(name)}” will be permanently removed from this workspace.</p><div class="modal-buttons"><button class="btn secondary" id="cancelDelete">Cancel</button><button class="btn danger-btn" id="confirmDelete">Delete item</button></div>`);
  $('#cancelDelete').onclick = closeModal;
  $('#confirmDelete').onclick = async () => {
    try { await api('/api/files',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:relative})}); closeModal(); showToast('Item deleted'); await loadFiles(); }
    catch(err){showToast(err.message,true);}
  };
}
function preview(item) {
  const type = item.mime || '';
  let body = `<div class="preview-unavailable"><div class="empty-illustration">▤</div><p>Preview isn't available for this file type.</p><a class="btn primary" href="/api/download?path=${encodeURIComponent(item.path)}">Download file</a></div>`;
  if (type.startsWith('image/')) body = `<img class="preview-image" src="/api/preview?path=${encodeURIComponent(item.path)}" alt="${escapeHtml(item.name)}">`;
  else if (type === 'application/pdf') body = `<iframe class="preview-frame" src="/api/preview?path=${encodeURIComponent(item.path)}"></iframe>`;
  else if (type.startsWith('text/')) body = `<iframe class="preview-frame text-preview" src="/api/preview?path=${encodeURIComponent(item.path)}"></iframe>`;
  showModal(`<p class="eyebrow">FILE PREVIEW</p><h2 class="preview-title">${escapeHtml(item.name)}</h2><div class="preview-area">${body}</div><div class="preview-bottom"><span class="muted small">${formatBytes(item.size)}</span><a href="/api/download?path=${encodeURIComponent(item.path)}" class="btn primary">↓ Download</a></div>`);
}
function createFolder() {
  showModal(`<p class="eyebrow">NEW FOLDER</p><h2>Create a folder</h2><form id="folderForm" class="modal-form"><label>Folder name<input name="name" placeholder="e.g. Project files" required maxlength="100"></label><button class="btn primary full">Create folder</button></form>`);
  $('#folderForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:currentPath,name:new FormData(e.currentTarget).get('name')})}); closeModal(); showToast('Folder created'); await loadFiles(); }
    catch(err){showToast(err.message,true);}
  });
}
function chooseUpload() { $('#filePicker').click(); }
async function uploadFiles(files) {
  if (!files.length) return;
  const data = new FormData(); [...files].forEach(file => data.append('files',file)); data.append('path',currentPath);
  showToast(`Uploading ${files.length} file(s)…`);
  try { const result = await api('/api/upload',{method:'POST',body:data}); showToast(`${result.uploaded.length} file(s) uploaded`); await loadFiles(); }
  catch(err){showToast(err.message,true);}
}
$('#newFolderBtn').addEventListener('click',createFolder);
$('#uploadTopBtn').addEventListener('click',chooseUpload);
$('#emptyUploadBtn').addEventListener('click',chooseUpload);
$('#filePicker').addEventListener('change',e => { uploadFiles(e.target.files); e.target.value=''; });
$('#searchInput').addEventListener('input',render);
document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
  activeFilter=btn.dataset.nav; currentPath=''; $('#searchInput').value='';
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); loadFiles();
}));
document.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => {
  activeFilter=btn.dataset.type; currentPath=''; $('#searchInput').value='';
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); loadFiles();
}));
checkSession().catch(() => { $('#loginView').classList.remove('hidden'); });
