const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const multer = require('multer');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const USERS = path.join(DATA, 'users');
const DEMO_USER = process.env.DEMO_USERNAME || 'admin';
const DEMO_PASS = process.env.DEMO_PASSWORD || 'CloudVault@123';

for (const dir of [DATA, UPLOADS, USERS]) fs.mkdirSync(dir, { recursive: true });

const userFile = path.join(USERS, 'accounts.json');
if (!fs.existsSync(userFile)) {
  fs.writeFileSync(userFile, JSON.stringify([{ username: DEMO_USER, passwordHash: bcrypt.hashSync(DEMO_PASS, 10) }], null, 2));
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'cloudvault.sid',
  secret: process.env.SESSION_SECRET || 'change-this-local-demo-secret-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, userRoot(req.session.user.username)),
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 150) || 'upload';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }
});

function userRoot(username) {
  const folder = path.join(UPLOADS, crypto.createHash('sha256').update(username).digest('hex').slice(0, 24));
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}
function safePath(username, relative = '') {
  const base = userRoot(username);
  const normalized = String(relative).replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(base, normalized);
  if (target !== base && !target.startsWith(base + path.sep)) {
    const err = new Error('Invalid path'); err.status = 400; throw err;
  }
  return target;
}
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in again.' });
  next();
}
function readAccounts() {
  return JSON.parse(fs.readFileSync(userFile, 'utf8'));
}
function listDirectory(dir, relative = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).map(entry => {
    const full = path.join(dir, entry.name);
    const stat = fs.statSync(full);
    return {
      name: entry.name,
      path: relative ? `${relative}/${entry.name}` : entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
      size: entry.isDirectory() ? null : stat.size,
      modified: stat.mtime.toISOString(),
      mime: entry.isDirectory() ? null : (mime.lookup(entry.name) || 'application/octet-stream')
    };
  }).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'folder' ? -1 : 1));
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const account = readAccounts().find(a => a.username === username);
  if (!account || !bcrypt.compareSync(String(password || ''), account.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start session.' });
    req.session.user = { username: account.username };
    res.json({ username: account.username });
  });
});
app.post('/api/logout', requireAuth, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.get('/api/files', requireAuth, (req, res, next) => {
  try {
    const relative = req.query.path || '';
    const target = safePath(req.session.user.username, relative);
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return res.status(404).json({ error: 'Folder not found.' });
    res.json({ path: relative, entries: listDirectory(target, relative) });
  } catch (e) { next(e); }
});

app.post('/api/folders', requireAuth, (req, res, next) => {
  try {
    const { path: parent = '', name } = req.body || {};
    if (!name || name.length > 100 || /[\\/]/.test(name) || name === '.' || name === '..') return res.status(400).json({ error: 'Enter a valid folder name.' });
    const destination = safePath(req.session.user.username, parent ? `${parent}/${name}` : name);
    if (fs.existsSync(destination)) return res.status(409).json({ error: 'An item with that name already exists.' });
    fs.mkdirSync(destination);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/upload', requireAuth, upload.array('files', 10), (req, res) => {
  const targetDir = safePath(req.session.user.username, req.body.path || '');
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return res.status(404).json({ error: 'Destination folder not found.' });
  const moved = [];
  for (const file of req.files || []) {
    const cleanName = path.basename(file.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 150) || 'upload';
    const extension = path.extname(cleanName);
    const stem = path.basename(cleanName, extension);
    let finalName = cleanName;
    let counter = 1;
    while (fs.existsSync(path.join(targetDir, finalName))) {
      finalName = `${stem} (${counter++})${extension}`;
    }
    fs.renameSync(file.path, path.join(targetDir, finalName));
    moved.push(finalName);
  }
  res.json({ ok: true, uploaded: moved });
});

app.get('/api/download', requireAuth, (req, res, next) => {
  try {
    const target = safePath(req.session.user.username, req.query.path);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return res.status(404).json({ error: 'File not found.' });
    res.download(target, path.basename(target).replace(/^\d+-[a-f0-9]+-/, ''));
  } catch (e) { next(e); }
});

app.get('/api/preview', requireAuth, (req, res, next) => {
  try {
    const target = safePath(req.session.user.username, req.query.path);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return res.status(404).json({ error: 'File not found.' });
    const type = mime.lookup(target) || 'application/octet-stream';
    if (!(type.startsWith('image/') || type === 'application/pdf' || type.startsWith('text/'))) return res.status(415).json({ error: 'Preview is not available for this file type.' });
    res.type(type);
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(target).pipe(res);
  } catch (e) { next(e); }
});

app.post('/api/rename', requireAuth, (req, res, next) => {
  try {
    const { path: relative, newName } = req.body || {};
    if (!relative || !newName || newName.length > 150 || /[\\/]/.test(newName) || newName === '.' || newName === '..') return res.status(400).json({ error: 'Enter a valid new name.' });
    const source = safePath(req.session.user.username, relative);
    const destination = safePath(req.session.user.username, path.posix.join(path.posix.dirname(relative.replace(/\\/g, '/')), newName));
    if (!fs.existsSync(source)) return res.status(404).json({ error: 'Item not found.' });
    if (fs.existsSync(destination)) return res.status(409).json({ error: 'That name is already in use.' });
    fs.renameSync(source, destination);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/files', requireAuth, (req, res, next) => {
  try {
    const target = safePath(req.session.user.username, req.body.path);
    if (target === userRoot(req.session.user.username)) return res.status(400).json({ error: 'Cannot delete the root folder.' });
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'Item not found.' });
    fs.rmSync(target, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/stats', requireAuth, (req, res) => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return acc + walk(full);
    return acc + fs.statSync(full).size;
  }, 0);
  const base = userRoot(req.session.user.username);
  res.json({ bytes: walk(base), limit: 1024 * 1024 * 1024 });
});

app.use(express.static(path.join(ROOT, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  res.status(status).json({ error: err instanceof multer.MulterError ? 'Upload limit exceeded (maximum 50 MB per file, 10 files at a time).' : (err.message || 'Server error.') });
});

app.listen(PORT, () => console.log(`CloudVault running at http://localhost:${PORT}`));
