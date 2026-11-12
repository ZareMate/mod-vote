import 'node:process';
import express from 'express';
import helmet from 'helmet';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, modResults } from './db.js';
import { parseRoles, permissions, token, tokenHash, safeEqual, validText, validUrl } from './security.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
try { process.loadEnvFile(envPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const env = process.env;
const PORT = Number(env.PORT || 3000);
const PUBLIC_URL = (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const origin = new URL(PUBLIC_URL).origin;
const redirectUri = PUBLIC_URL + '/auth/callback';
const voterRoles = parseRoles(env.DISCORD_VOTER_ROLE_IDS);
const adminRoles = parseRoles(env.DISCORD_ADMIN_ROLE_IDS);
const required = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID'];
for (const key of required) if (!env[key]) { console.error('Missing configuration: ' + key); process.exit(1); }
if (!voterRoles.size || !adminRoles.size) { console.error('Set both DISCORD_VOTER_ROLE_IDS and DISCORD_ADMIN_ROLE_IDS'); process.exit(1); }
const db = createDatabase(env.DATABASE_PATH || './data/votes.sqlite');
const app = express();
if (env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '16kb' }));
const secure = origin.startsWith('https:');
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const roleCache = new Map();
const cacheLifetime = 60_000;

function cookie(req, name) {
  const value = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  return value?.slice(name.length + 1) || '';
}
function session(req) {
  const raw = cookie(req, 'mv_session');
  if (!raw) return null;
  return db.prepare('SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?').get(tokenHash(raw), Date.now()) || null;
}
function clearLogin(res) { res.clearCookie('mv_session', cookieOptions); }
async function discord(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const error = new Error('Discord HTTP ' + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
async function guildPermissions(userId) {
  const cached = roleCache.get(userId);
  if (cached && cached.until > Date.now()) return cached.permissions;
  let member;
  try {
    member = await discord('https://discord.com/api/v10/guilds/' + encodeURIComponent(env.DISCORD_GUILD_ID) + '/members/' + encodeURIComponent(userId), {
      headers: { Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN },
    });
  } catch (error) {
    if (error.status === 404) {
      const denied = { voter: false, admin: false };
      roleCache.set(userId, { permissions: denied, until: Date.now() + cacheLifetime });
      return denied;
    }
    throw error;
  }
  const result = permissions(member.roles || [], voterRoles, adminRoles);
  roleCache.set(userId, { permissions: result, until: Date.now() + cacheLifetime });
  return result;
}
async function auth(req, res, next) {
  try {
    const loggedIn = session(req);
    if (!loggedIn) return res.status(401).json({ error: 'Sign in with Discord first.' });
    const access = await guildPermissions(loggedIn.user_id);
    if (!access.voter) return res.status(403).json({ error: 'You need an allowed Discord guild role.' });
    req.user = { id: loggedIn.user_id, username: loggedIn.username, avatar: loggedIn.avatar, ...access };
    next();
  } catch (error) { next(error); }
}
function admin(req, res, next) {
  if (!req.user.admin) return res.status(403).json({ error: 'Admin role required.' });
  next();
}
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const source = req.headers.origin;
  if (source !== origin) return res.status(403).json({ error: 'Invalid request origin.' });
  next();
}
app.use('/api', csrf);
app.post('/auth/logout', csrf, (req, res) => {
  const raw = cookie(req, 'mv_session');
  if (raw) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(tokenHash(raw));
  clearLogin(res);
  res.json({ ok: true });
});
app.get('/auth/login', (req, res) => {
  const state = token();
  res.cookie('mv_oauth', state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify',
    state,
    prompt: 'none',
  });
  // Regular consent prompt on first authorization; Discord can skip it for returning users.
  params.delete('prompt');
  res.redirect('https://discord.com/oauth2/authorize?' + params.toString());
});
app.get('/auth/callback', async (req, res) => {
  const state = cookie(req, 'mv_oauth');
  res.clearCookie('mv_oauth', cookieOptions);
  if (!state || typeof req.query.state !== 'string' || !safeEqual(state, req.query.state) || typeof req.query.code !== 'string') {
    return res.redirect('/?error=invalid_oauth_state');
  }
  try {
    const body = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: req.query.code,
      redirect_uri: redirectUri,
    });
    const access = await discord('https://discord.com/api/v10/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const user = await discord('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: 'Bearer ' + access.access_token },
    });
    const allowed = await guildPermissions(user.id);
    if (!allowed.voter) return res.redirect('/?error=missing_role');
    const old = cookie(req, 'mv_session');
    if (old) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(tokenHash(old));
    const id = token();
    db.prepare('INSERT INTO sessions (id_hash, user_id, username, avatar, expires_at) VALUES (?, ?, ?, ?, ?)').run(
      tokenHash(id), user.id, user.global_name || user.username, user.avatar || null, Date.now() + sessionLifetime,
    );
    res.cookie('mv_session', id, { ...cookieOptions, maxAge: sessionLifetime });
    res.redirect('/');
  } catch (error) {
    console.error('Discord OAuth failed:', error.message);
    res.redirect('/?error=discord_auth_failed');
  }
});
app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));
app.get('/api/mods', auth, (req, res) => res.json({
  mods: modResults(db, req.user.id),
  votingOpen: db.prepare("SELECT value FROM settings WHERE key = 'voting_open'").get().value === 'true',
}));
app.put('/api/mods/:id/vote', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid mod ID.' });
  if (db.prepare("SELECT value FROM settings WHERE key = 'voting_open'").get().value !== 'true')
    return res.status(409).json({ error: 'Voting is currently closed.' });
  if (!db.prepare('SELECT 1 FROM mods WHERE id = ?').get(id)) return res.status(404).json({ error: 'Mod not found.' });
  if (req.body?.voted === true) db.prepare('INSERT OR IGNORE INTO votes (mod_id, user_id) VALUES (?, ?)').run(id, req.user.id);
  else if (req.body?.voted === false) db.prepare('DELETE FROM votes WHERE mod_id = ? AND user_id = ?').run(id, req.user.id);
  else return res.status(400).json({ error: 'Expected voted: true or false.' });
  res.json({ mods: modResults(db, req.user.id) });
});
app.get('/api/admin/stats', auth, admin, (req, res) => {
  const totalVoters = db.prepare('SELECT COUNT(DISTINCT user_id) AS count FROM votes').get().count;
  const totalVotes = db.prepare('SELECT COUNT(*) AS count FROM votes').get().count;
  res.json({ totalVoters, totalVotes });
});
app.post('/api/admin/mods', auth, admin, (req, res) => {
  const { name, description = '', category = 'General', url = '' } = req.body || {};
  if (!validText(name, 100) || typeof description !== 'string' || description.length > 1000 || !validText(category, 60) || !validUrl(url))
    return res.status(400).json({ error: 'Invalid mod details.' });
  const row = db.prepare('INSERT INTO mods (name, description, category, url) VALUES (?, ?, ?, ?)').run(name.trim(), description.trim(), category.trim(), url);
  res.status(201).json({ id: row.lastInsertRowid });
});
app.patch('/api/admin/mods/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const mod = Number.isSafeInteger(id) && db.prepare('SELECT * FROM mods WHERE id = ?').get(id);
  if (!mod) return res.status(404).json({ error: 'Mod not found.' });
  const { name = mod.name, description = mod.description, category = mod.category, url = mod.url } = req.body || {};
  if (!validText(name, 100) || typeof description !== 'string' || description.length > 1000 || !validText(category, 60) || !validUrl(url))
    return res.status(400).json({ error: 'Invalid mod details.' });
  db.prepare('UPDATE mods SET name = ?, description = ?, category = ?, url = ? WHERE id = ?').run(name.trim(), description.trim(), category.trim(), url, id);
  res.json({ ok: true });
});
app.delete('/api/admin/mods/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid mod ID.' });
  const result = db.prepare('DELETE FROM mods WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ error: 'Mod not found.' });
  res.json({ ok: true });
});
app.put('/api/admin/voting', auth, admin, (req, res) => {
  if (typeof req.body?.open !== 'boolean') return res.status(400).json({ error: 'Expected open: true or false.' });
  db.prepare("UPDATE settings SET value = ? WHERE key = 'voting_open'").run(String(req.body.open));
  res.json({ votingOpen: req.body.open });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use('/auth', (_req, res) => res.status(404).send('Not found'));
app.use(express.static(path.join(root, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html'), (error) => {
  if (error && !res.headersSent) res.status(404).send('Frontend not built. Run npm run build.');
}));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
});
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  for (const [id, entry] of roleCache) if (entry.until <= Date.now()) roleCache.delete(id);
}, 60 * 60 * 1000).unref();
app.listen(PORT, () => console.log('Mod Vote listening on http://localhost:' + PORT));
