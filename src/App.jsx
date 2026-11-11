import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, send } from './api.js';

function Icon({ name, size = 18 }) {
  const icons = {
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    external: <><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v6H5V5h6"/></>,
    shield: <><path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Z"/><path d="m9 12 2 2 4-4"/></>,
    chart: <><path d="M4 20V10m6 10V4m6 16v-8m6 8H2"/></>,
    trash: <><path d="M4 7h16M10 7V4h4v3m-8 0 1 14h10l1-14M10 11v6m4-6v6"/></>,
    edit: <><path d="M12 20h9M4 16l-1 5 5-1L20 8l-4-4L4 16Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}
function Button({ children, icon, variant = 'primary', ...props }) {
  return <button className={'btn btn-' + variant} {...props}>{icon && <Icon name={icon} size={17} />}{children}</button>;
}
function Header({ user, logout }) {
  return <header className="header"><div className="shell header-inner">
    <Link className="brand" to="/"><span className="brand-mark"><Icon name="box" size={21}/></span><span>MOD<span className="brand-light">VOTE</span></span><span className="brand-season">SEASON PLANNING</span></Link>
    <nav className="nav"><Link to="/">Voting</Link>{user?.admin && <Link to="/admin">Admin panel</Link>}</nav>
    <div className="header-user">{user ? <><span className="user-name">{user.username}</span><button className="text-btn" onClick={logout}>Log out</button></> : <a className="btn btn-small btn-secondary" href="/auth/login">Log in with Discord</a>}</div>
  </div></header>;
}
function Empty({ title, detail }) {
  return <div className="empty"><div className="empty-symbol"><Icon name="box" size={28}/></div><h3>{title}</h3><p>{detail}</p></div>;
}
function ModCard({ mod, votingOpen, onVote, busy }) {
  return <article className={'mod-card ' + (mod.voted ? 'mod-selected' : '')}>
    <div className="mod-card-top"><span className="category">{mod.category}</span><span className="vote-count"><span className="vote-dot"/> {mod.votes} {mod.votes === 1 ? 'vote' : 'votes'}</span></div>
    <h3>{mod.name}</h3><p className="mod-description">{mod.description || 'No description yet.'}</p>
    <div className="mod-card-footer">{mod.url ? <a href={mod.url} target="_blank" rel="noopener noreferrer" className="mod-link">Mod page <Icon name="external" size={14}/></a> : <span/>}
      <Button icon={mod.voted ? 'check' : 'plus'} variant={mod.voted ? 'selected' : 'secondary'} disabled={!votingOpen || busy} onClick={() => onVote(mod.id, !mod.voted)}>
        {mod.voted ? 'Voted' : 'Vote'}
      </Button>
    </div>
  </article>;
}
function Voting({ mods, votingOpen, onVote, busy }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All mods');
  const categories = useMemo(() => ['All mods', ...new Set(mods.map((mod) => mod.category))], [mods]);
  const filtered = mods.filter((mod) => (category === 'All mods' || mod.category === category) &&
    (mod.name + ' ' + mod.description).toLowerCase().includes(search.toLowerCase()));
  const totalVotes = mods.reduce((total, mod) => total + mod.votes, 0);
  const myVotes = mods.filter((mod) => mod.voted).length;
  return <main className="shell">
    <section className="hero"><div className="eyebrow"><span className="pulse"/> COMMUNITY VOTING · NEXT SEASON</div>
      <h1>Shape the next <span>season.</span></h1>
      <p>Help choose which mods make it into the next season. Browse the candidates and vote for the ones you'd love to play with.</p>
      <div className="hero-stats"><div><strong>{mods.length}</strong><span>Mods proposed</span></div><div><strong>{totalVotes}</strong><span>Community votes</span></div><div><strong>{myVotes}</strong><span>Your votes</span></div></div>
    </section>
    <div className="section-header"><div><div className="eyebrow muted">THE LINEUP</div><h2>Mod candidates <span className="number">({mods.length})</span></h2></div><span className={'status ' + (votingOpen ? 'status-open' : 'status-closed')}><span className="status-dot"/>{votingOpen ? 'Voting is open' : 'Voting is closed'}</span></div>
    <div className="filters"><div className="search-box"><Icon name="search"/><input aria-label="Search mods" placeholder="Search mods..." value={search} onChange={(e) => setSearch(e.target.value)}/></div>
      <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((name) => <option key={name}>{name}</option>)}</select>
    </div>
    {filtered.length ? <div className="mod-grid">{filtered.map((mod) => <ModCard key={mod.id} mod={mod} votingOpen={votingOpen} onVote={onVote} busy={busy === mod.id}/>)}</div> :
      <Empty title={mods.length ? 'No matching mods' : 'No mods yet'} detail={mods.length ? 'Try another search or category.' : 'The admins have not added mod candidates yet.'}/>}
    <footer className="footer">One vote per mod, per Discord account. You can change your mind while voting is open.</footer>
  </main>;
}
function ModForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || { name: '', description: '', category: 'General', url: '' });
  const field = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.value }));
  return <form className="mod-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    <label>Mod name<input required maxLength={100} placeholder="e.g. Create" value={form.name} onChange={field('name')}/></label>
    <label>Category<input required maxLength={60} placeholder="e.g. Technology" value={form.category} onChange={field('category')}/></label>
    <label className="full">Description<textarea rows={3} maxLength={1000} placeholder="What does this mod add?" value={form.description} onChange={field('description')}/></label>
    <label className="full">Mod page URL (optional)<input type="url" maxLength={500} placeholder="https://modrinth.com/mod/..." value={form.url} onChange={field('url')}/></label>
    <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving} type="submit" icon="check">{saving ? 'Saving...' : 'Save mod'}</Button></div>
  </form>;
}
function Admin({ mods, votingOpen, refresh, report }) {
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/api/admin/stats').then(setStats).catch((e) => report(e.message)); }, [mods]);
  async function save(form) {
    setSaving(true);
    try {
      if (editing === 'new') await send('/api/admin/mods', 'POST', form);
      else await send('/api/admin/mods/' + editing.id, 'PATCH', form);
      await refresh();
      setEditing(null);
    } catch (error) { report(error.message); } finally { setSaving(false); }
  }
  async function remove(mod) {
    if (!window.confirm('Delete ' + mod.name + ' and all of its votes?')) return;
    try { await api('/api/admin/mods/' + mod.id, { method: 'DELETE' }); await refresh(); }
    catch (error) { report(error.message); }
  }
  async function toggle() {
    try { await send('/api/admin/voting', 'PUT', { open: !votingOpen }); await refresh(); }
    catch (error) { report(error.message); }
  }
  return <main className="shell admin-main">
    <div className="eyebrow"><Icon name="shield" size={15}/> ADMINISTRATION</div><div className="admin-heading"><div><h1>Control center<span className="period">.</span></h1><p>Manage the candidates and keep an eye on community voting.</p></div><Button icon="plus" onClick={() => setEditing('new')}>Add mod</Button></div>
    <div className="admin-stats"><div className="stat-tile"><span>Mod candidates</span><strong>{mods.length}</strong></div><div className="stat-tile"><span>Total votes</span><strong>{stats?.totalVotes ?? '—'}</strong></div><div className="stat-tile"><span>Unique voters</span><strong>{stats?.totalVoters ?? '—'}</strong></div><div className="stat-tile voting-tile"><span>Voting status</span><strong className={votingOpen ? 'green' : ''}>{votingOpen ? 'Open' : 'Closed'}</strong><button className="text-btn" onClick={toggle}>{votingOpen ? 'Close voting' : 'Open voting'}</button></div></div>
    <div className="admin-list-heading"><div><div className="eyebrow muted">MANAGE THE LINEUP</div><h2>All candidates</h2></div></div>
    {editing && <div className="editor"><h3>{editing === 'new' ? 'Add a candidate' : 'Edit candidate'}</h3><ModForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} saving={saving} onSave={save} onCancel={() => setEditing(null)}/></div>}
    <div className="admin-list">{mods.length ? mods.map((mod) => <article key={mod.id} className="admin-row"><div className="admin-row-info"><span className="category">{mod.category}</span><h3>{mod.name}</h3><p>{mod.description || 'No description'}</p></div><div className="admin-row-actions"><span className="admin-votes"><Icon name="chart"/>{mod.votes} votes</span><Button variant="secondary" icon="edit" onClick={() => setEditing(mod)}>Edit</Button><button className="icon-button danger" aria-label={'Delete ' + mod.name} onClick={() => remove(mod)}><Icon name="trash"/></button></div></article>) : <Empty title="No candidates" detail="Add your first mod to start planning the next season."/>}</div>
  </main>;
}
function Landing({ reason }) {
  const messages = { missing_role: 'Your Discord account does not have an allowed role in the server.', discord_auth_failed: 'Discord login failed. Please try again.', invalid_oauth_state: 'Login expired or could not be verified. Please try again.' };
  return <main className="shell landing"><div className="eyebrow"><span className="pulse"/> NEXT SEASON · COMMUNITY VOTE</div><h1>Your server.<br/><span>Your choice.</span></h1><p>Vote for the Minecraft mods you want to see in the next season. Sign in to get started.</p>{reason && <div className="notice">{messages[reason] || 'Could not sign in.'}</div>}<a className="btn btn-primary login-cta" href="/auth/login">Continue with Discord <Icon name="arrow"/></a><div className="login-note"><Icon name="shield" size={16}/> Access is limited to eligible Discord server members.</div></main>;
}
export default function App() {
  const [user, setUser] = useState(undefined);
  const [mods, setMods] = useState([]);
  const [votingOpen, setVotingOpen] = useState(true);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState('');
  const location = useLocation();
  const reason = new URLSearchParams(location.search).get('error');
  async function refresh() {
    const data = await api('/api/mods');
    setMods(data.mods);
    setVotingOpen(data.votingOpen);
  }
  useEffect(() => {
    api('/api/me').then(async ({ user }) => { setUser(user); await refresh(); })
      .catch((error) => { setUser(null); if (!error.message.includes('Sign in') && !error.message.includes('allowed Discord')) setMessage(error.message); });
  }, []);
  async function onVote(id, voted) {
    setBusy(id);
    try { const data = await send('/api/mods/' + id + '/vote', 'PUT', { voted }); setMods(data.mods); }
    catch (error) { setMessage(error.message); } finally { setBusy(null); }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); setUser(null); setMods([]); window.location.assign('/'); }
    catch (error) { setMessage(error.message); }
  }
  if (user === undefined) return <div className="loading-screen"><div className="spinner"/><p>Loading season votes…</p></div>;
  return <><Header user={user} logout={logout}/>{message && <div className="global-error" role="alert">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
    <Routes><Route path="/" element={user ? <Voting mods={mods} votingOpen={votingOpen} onVote={onVote} busy={busy}/> : <Landing reason={reason}/>}/>
    <Route path="/admin" element={user?.admin ? <Admin mods={mods} votingOpen={votingOpen} refresh={refresh} report={setMessage}/> : user ? <div className="shell"><Empty title="Access denied" detail="This page requires the configured Discord admin role."/></div> : <Navigate to="/"/>}/>
    <Route path="*" element={<Navigate to="/"/>}/></Routes></>;
}
