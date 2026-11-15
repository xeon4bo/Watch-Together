import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Camera, Check, ChevronDown, DoorOpen, Headphones,
  Link2, LoaderCircle, Lock, LogOut, MessageCircle, Mic, MicOff, MonitorPlay, Pause,
  Play, Plus, Send, Settings, Shield, Sparkles, Users, Video, VideoOff, Volume2, VolumeX,
  X,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || window.location.origin;
const WS = import.meta.env.VITE_WS_URL || (import.meta.env.PROD
  ? 'wss://watch-together-0ygf.onrender.com'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`);
const isNgrokPreview = /\.ngrok-free\.(app|dev)$/.test(window.location.hostname);
const getToken = () => localStorage.getItem('wwf_token');
const getUser = () => JSON.parse(localStorage.getItem('wwf_user') || 'null');

function getApiErrorMessage(data) {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(getApiErrorMessage).find(Boolean) || '';
  if (!data || typeof data !== 'object') return '';
  for (const key of ['detail', 'avatar', 'non_field_errors']) {
    const message = getApiErrorMessage(data[key]);
    if (message) return message;
  }
  return Object.values(data).map(getApiErrorMessage).find(Boolean) || '';
}

async function api(path, options = {}) {
  const isAuthRequest = /^\/auth\/(login|register)\/$/.test(path);
  const token = isAuthRequest ? null : getToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${API}/api${path}`, {
    ...options,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(isNgrokPreview ? { 'ngrok-skip-browser-warning': 'true' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (response.status === 401 && token) {
    localStorage.removeItem('wwf_token');
    localStorage.removeItem('wwf_user');
    window.dispatchEvent(new Event('wwf-auth-change'));
  }
  if (!response.ok) {
    const message = getApiErrorMessage(data);
    throw new Error(message || `The request failed (HTTP ${response.status}). Please try again.`);
  }
  return data;
}

async function logoutUser() {
  try { await api('/auth/logout/', { method: 'POST' }); } catch { /* Local credentials are still cleared. */ }
  localStorage.removeItem('wwf_token');
  localStorage.removeItem('wwf_user');
  window.dispatchEvent(new Event('wwf-auth-change'));
}

function Avatar({ name = '?', size = 'normal', online = false, photo }) {
  return <span className={`avatar ${size}`} title={name}>{photo ? <img src={photo} alt="" /> : name.slice(0, 1).toUpperCase()}{online && <i />}</span>;
}

function Shell({ children, user }) {
  return <div className="app-shell">
    <header className="topbar">
      <Link to="/dashboard" className="brand">
        <span className="brand-name">
          <span className="brand-watch">Watch<svg className="brand-heart-art" viewBox="0 0 64 68" aria-hidden="true">
            <defs><linearGradient id="brand-heart-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff3434" /><stop offset="1" stopColor="#d90016" /></linearGradient></defs>
            <path fill="url(#brand-heart-red)" d="M29 43C23 35 7 25 7 16 7 8 12 4 19 5c5 0 9 4 11 10 2-6 7-10 13-9 7 1 10 6 9 13-1 8-14 19-23 24Z" />
            <path fill="#fff" d="M39 23c-4-4-8-7-8-11 0-3 2-5 5-5 3 0 5 2 6 4 2-3 4-4 7-3 3 0 5 2 4 5-1 4-9 9-14 10Z" />
            <path fill="url(#brand-heart-red)" d="M46 51c-3-4-9-8-9-13 0-4 2-6 5-6 2 0 4 2 5 4 1-3 3-4 6-4 3 1 4 3 4 6-1 4-7 9-11 13Z" />
            <path fill="url(#brand-heart-red)" d="M30 57c-2-3-7-6-7-9 0-3 2-4 4-4 2 0 3 1 4 3 1-2 2-3 4-3 3 0 4 2 4 4 0 3-6 7-9 9Z" />
            <path fill="url(#brand-heart-red)" d="M42 67c-1-2-4-4-4-6 0-2 1-3 3-3 1 0 2 1 2 2 1-1 2-2 3-2 2 0 3 1 3 3s-4 5-7 6Z" />
          </svg></span>
          <span className="brand-bottom"><span className="brand-icon"><MonitorPlay size={17} /></span><span>Together<span className="brand-period">.</span></span></span>
        </span>
      </Link>
      <div className="topbar-right">
        {user && <><Link className="nav-link" to="/dashboard">Rooms</Link><Link className="nav-link" to="/profile">Profile</Link>
          <Link className="user-chip" to="/settings" aria-label="Settings" title="Settings"><Avatar name={user.username} size="small" photo={user.avatar_url} /><Settings size={15} /></Link></>}
      </div>
    </header>
    {children}
  </div>;
}

function AuthPage({ register = false }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api(`/auth/${register ? 'register' : 'login'}/`, { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem('wwf_token', data.token); localStorage.setItem('wwf_user', JSON.stringify(data.user));
      window.dispatchEvent(new Event('wwf-auth-change'));
      navigate('/dashboard');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Shell><main className="auth-page">
    <motion.section className="auth-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <div className="eyebrow"><Sparkles size={14} /> YOUR PEOPLE, YOUR SCREEN</div>
      <h1>{register ? 'Make it a movie night.' : 'Good to see you again.'}</h1>
      <p className="muted">{register ? 'Create your account and bring everyone into the same room.' : 'Sign in to pick up where your friends left off.'}</p>
      <form onSubmit={submit} className="stack-form">
        <label>Username<input autoComplete="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} minLength="3" required placeholder="yourname" /></label>
        <label>Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={register ? 8 : undefined} required placeholder={register ? 'At least 8 characters' : 'Your password'} /></label>
        {error && <div className="alert">{error}</div>}
        <button className="button primary wide" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null}{register ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
      </form>
      <p className="auth-switch">{register ? 'Already have an account?' : 'New to together?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
      <small className="fineprint">Your account is private. We never store your video streams.</small>
    </motion.section>
  </main></Shell>;
}

function Landing({ user }) {
  return <Shell user={user}><main className="landing">
    <div className="landing-glow" />
    <motion.div className="hero-copy" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="eyebrow"><span className="live-dot" /> THE DISTANCE DOESN'T MATTER</div>
      <h1>Same moment.<br /><span>Different couches.</span></h1>
      <p>Press play together, laugh together, stay a little longer. Your next movie night is one link away.</p>
      <div className="hero-actions">{user ? <><Link className="button primary" to="/dashboard">Open your rooms <ArrowRight size={17} /></Link><Link className="button quiet" to="/settings">Settings</Link></> : <><Link className="button primary" to="/register">Start a room <ArrowRight size={17} /></Link><Link className="button quiet" to="/login">I have an account</Link></>}</div>
      <div className="hero-proof"><div className="avatar-stack"><Avatar name="A" /><Avatar name="M" /><Avatar name="J" /></div><span>Better when you're together.</span></div>
    </motion.div>
    <motion.div className="preview-card" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .12 }}>
      <div className="preview-screen"><div className="preview-top"><span className="window-lights"><i /><i /><i /></span><span className="live-pill"><i /> LIVE ROOM</span></div><div className="preview-center"><div className="preview-play"><Play fill="currentColor" size={25} /></div><span>movie night, together</span></div><div className="preview-bottom"><span>01:24:08</span><div className="preview-progress"><i /></div><span>02:10:32</span></div></div>
      <div className="preview-controls"><span className="preview-av"><Avatar name="R" online /><Avatar name="K" online /><Avatar name="S" online /></span><span className="preview-status"><span className="live-dot" /> 3 friends watching</span><span className="preview-chat">Save me a spot 🎬</span></div>
    </motion.div>
    <div className="landing-foot"><span>SYNCED PLAYBACK</span><span>PRIVATE ROOMS</span><span>BUILT FOR FRIENDS</span></div>
  </main><footer className="site-footer"><span>© {new Date().getFullYear()} Watch Together</span><span>Save me a spot 🎬</span></footer></Shell>;
}

function Dashboard() {
  const user = getUser();
  const [rooms, setRooms] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [roomId, setRoomId] = useState('');
  const [modal, setModal] = useState('');
  const [publicRoom, setPublicRoom] = useState(false);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    try { setRooms(await api('/rooms/')); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function createRoom(event) {
    event.preventDefault(); setError('');
    try {
      const room = await api('/rooms/', { method: 'POST', body: JSON.stringify({ name: roomName || `${user.username}'s room`, is_public: publicRoom, video_url: streamUrl.trim() }) });
      navigate(`/room/${room.id}`);
    } catch (e) { setError(e.message); }
  }
  async function joinRoom(event) {
    event.preventDefault(); setError('');
    const id = roomId.trim().split('/').filter(Boolean).pop();
    try { await api(`/rooms/${id}/`, { method: 'POST' }); navigate(`/room/${id}`); }
    catch (e) { setError(e.message); }
  }
  return <Shell user={user}><main className="dashboard page-wrap">
    <section className="welcome-row">
      <div><div className="eyebrow"><span className="live-dot" /> YOUR WATCH SPACE</div><h1>Hey, {user?.username}<span className="brand-period">.</span></h1><p className="muted">Good stories are even better shared.</p></div>
      <div className="welcome-actions"><button className="button secondary" onClick={() => setModal('join')}><Link2 size={17} /> Join a room</button><button className="button primary" onClick={() => setModal('create')}><Plus size={18} /> Create a room</button></div>
    </section>
    {error && <div className="alert">{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
    <section className="rooms-section"><div className="section-heading"><div><h2>Your rooms</h2><p className="muted">Pick up the conversation where you left off.</p></div><span className="count-pill">{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span></div>
      {busy ? <div className="loading"><LoaderCircle className="spin" /> Loading your rooms...</div> : rooms.length ? <div className="room-grid">{rooms.map((room, index) => <motion.article className="room-card" key={room.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}>
        <div className="room-art"><span className="room-art-icon"><MonitorPlay size={25} /></span><span className="room-lock">{room.is_public ? <Users size={14} /> : <Lock size={14} />}{room.is_public ? 'Public' : 'Private'}</span><div className="room-art-shape" /></div>
        <div className="room-card-body"><div><h3>{room.name}</h3><span className="muted small">Hosted by {room.owner_name}</span></div><div className="room-card-bottom"><span className="participant-stack"><Avatar size="tiny" name={room.owner_name} photo={room.members?.find(member => member.id === room.owner_id)?.avatar_url} /><span>{room.members?.length || 1} here</span></span><Link className="icon-button" aria-label="Open room" to={`/room/${room.id}`}><ArrowRight size={17} /></Link></div></div>
      </motion.article>)}</div> : <div className="empty-state"><div className="empty-icon"><MonitorPlay size={24} /></div><h3>Your next movie night starts here.</h3><p>Create a room, share the invite link, and press play together.</p><button className="button primary" onClick={() => setModal('create')}><Plus size={17} /> Create your first room</button></div>}
    </section>
    <div className="feature-strip"><span><Shield size={17} /> Private by default</span><span><Headphones size={17} /> Voice & video calls</span><span><MonitorPlay size={17} /> Synced playback</span></div>
    <AnimatePresence>{modal && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal('')}><motion.div className="modal-card" initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}><button className="modal-close" onClick={() => setModal('')}><X size={17} /></button><div className="eyebrow">{modal === 'create' ? 'MAKE IT A MOVIE NIGHT' : 'YOUR FRIENDS ARE WAITING'}</div><h2>{modal === 'create' ? 'Create a room' : 'Join a room'}</h2><p className="muted">{modal === 'create' ? 'A private space for your people.' : 'Paste an invite link or room ID.'}</p>
      {modal === 'create' ? <form className="stack-form" onSubmit={createRoom}><label>Room name<input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder={`${user.username}'s room`} maxLength="100" /></label><label>Stream URL <span className="muted small">Optional — direct browser-playable MP4 or HLS</span><input type="url" value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="https://example.com/video.mp4" /></label><label className="toggle-row">Make this room public<input type="checkbox" checked={publicRoom} onChange={e => setPublicRoom(e.target.checked)} /><span className="toggle" /></label><button className="button primary wide"><Plus size={17} /> Create room</button></form>
        : <form className="stack-form" onSubmit={joinRoom}><label>Invite link or room ID<input required value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Paste your invite link" /></label><button className="button primary wide"><ArrowRight size={17} /> Join room</button></form>}
      </motion.div></div>}</AnimatePresence>
  </main></Shell>;
}

function Player({ room, send, setSyncing }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState('');
  const [quality, setQuality] = useState(-1);
  const [seekFeedback, setSeekFeedback] = useState('');
  const lastTap = useRef({ time: 0, side: '' });
  const seekFeedbackTimer = useRef(null);
  useEffect(() => () => clearTimeout(seekFeedbackTimer.current), []);
  useEffect(() => {
    let active = true;
    const setupSource = async () => {
      const video = videoRef.current;
      if (!video || !room?.video_url) return;
      setError(''); setPosition(0); setDuration(0); setAutoplayBlocked(false);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (/\.m3u8($|\?)/i.test(room.video_url) && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = room.video_url;
      } else if (/\.m3u8($|\?)/i.test(room.video_url)) {
        const { default: Hls } = await import('hls.js');
        if (!active) return;
        if (!Hls.isSupported()) {
          setError('HLS playback is not supported in this browser.');
          return;
        }
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(room.video_url); hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => setQuality(hls.currentLevel));
        hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError('This HLS stream could not be played. Check the URL, CORS access, and stream compatibility.'); });
      } else if (/^https?:\/\//i.test(room.video_url)) {
        video.src = room.video_url;
      } else {
        setError('Unsupported stream URL. Use an HTTP(S) direct video link or compatible HLS (.m3u8) link. Protected or platform-only streams are not supported.');
      }
    };
    setupSource().catch(error => { if (active) setError(`Could not load HLS support: ${error.message}`); });
    return () => { active = false; if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [room?.video_url]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !room) return;
    const next = room.is_playing ? (room.position || 0) : (room.position || 0);
    setSyncing(true);
    if (Math.abs(video.currentTime - next) > 1.4) video.currentTime = next;
    if (room.is_playing) video.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
    else video.pause();
    setPlaying(room.is_playing);
    const timer = setTimeout(() => setSyncing(false), 350);
    return () => clearTimeout(timer);
  }, [room?.position, room?.is_playing, room?.video_url, setSyncing]);
  useEffect(() => {
    const keydown = event => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (JSON.parse(localStorage.getItem('wwf_preferences') || '{}').keyboardShortcuts === false) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      if (event.key === 'ArrowLeft') seekBy(-10);
      if (event.key === 'ArrowRight') seekBy(10);
      if (event.key.toLowerCase() === 'm') setVolume(current => current ? 0 : 1);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (room.is_playing && (autoplayBlocked || video.paused)) {
      video.play().then(() => setAutoplayBlocked(false)).catch(() => setError('Your browser blocked playback. Press play again after interacting with the page.'));
      return;
    }
    send({ type: playing ? 'pause' : 'play' });
  }
  function seekBy(delta) {
    const video = videoRef.current;
    if (video) send({ type: 'seek', position: Math.max(0, video.currentTime + delta), is_playing: playing });
  }
  function onStageTouchEnd(event) {
    if (!room.video_url || error) return;
    if (event.target.closest?.('button, input, select')) {
      lastTap.current = { time: 0, side: '' };
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const side = touch.clientX - bounds.left < bounds.width / 2 ? 'left' : 'right';
    const now = Date.now();
    if (now - lastTap.current.time <= 300 && lastTap.current.side === side) {
      const direction = side === 'left' ? -10 : 10;
      seekBy(direction);
      setSeekFeedback(side);
      clearTimeout(seekFeedbackTimer.current);
      seekFeedbackTimer.current = setTimeout(() => setSeekFeedback(''), 650);
      lastTap.current = { time: 0, side: '' };
      if (event.cancelable) event.preventDefault();
    } else {
      lastTap.current = { time: now, side };
    }
  }
  function onSeek(event) { send({ type: 'seek', position: Number(event.target.value), is_playing: playing }); }
  function onUrl(event) {
    event.preventDefault();
    const url = event.currentTarget.elements.stream.value.trim();
    if (url) send({ type: 'video_changed', video_url: url });
    event.currentTarget.reset();
  }
  function fullscreen() {
    const element = videoRef.current?.parentElement;
    if (!document.fullscreenElement) element?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  async function explainVideoError(event) {
    const video = event.currentTarget;
    const source = room.video_url;
    const code = video.error?.code;
    let message = code === 2
      ? 'The stream could not be reached. It may be unavailable or blocked by the stream server.'
      : code === 3
        ? 'The browser received this stream but could not decode its video or audio codecs.'
        : 'This browser cannot play the stream format. Use a direct MP4 (H.264/AAC) or compatible HLS (.m3u8) link.';

    if (code === 4) {
      try {
        const response = await fetch(source, { headers: { Range: 'bytes=0-0' } });
        const contentType = response.headers.get('content-type') || '';
        await response.body?.cancel();
        if (/matroska/i.test(contentType)) {
          message = 'This link serves Matroska (MKV), which browsers generally cannot play directly. Use an MP4 (H.264/AAC) or compatible HLS (.m3u8) stream instead.';
        } else if (!response.ok && response.status !== 206) {
          message = `The stream URL returned HTTP ${response.status}. Check that the link is still available.`;
        }
      } catch {
        message = 'This browser cannot play the stream format. Use a direct MP4 (H.264/AAC) or compatible HLS (.m3u8) link, and make sure the stream server allows browser access.';
      }
    }

    setError(message);
  }
  const fmt = time => `${Math.floor((time || 0) / 60).toString().padStart(2, '0')}:${Math.floor((time || 0) % 60).toString().padStart(2, '0')}`;
  return <div className="player-wrap">
    <div className="video-stage" onTouchEnd={onStageTouchEnd}>
      <video ref={videoRef} playsInline onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onDurationChange={e => setDuration(e.currentTarget.duration || 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={explainVideoError} />
      {seekFeedback && <div className={`seek-feedback ${seekFeedback}`} aria-live="polite">{seekFeedback === 'left' ? '−10 sec' : '+10 sec'}</div>}
      {!room.video_url && <div className="player-empty"><div className="player-empty-icon"><Play size={22} fill="currentColor" /></div><span className="eyebrow">YOUR ROOM, YOUR MOVIE</span><h2>What are we watching?</h2><p>Share a direct MP4 or compatible HLS link to get everyone in sync.</p><form className="stream-form" onSubmit={onUrl}><Link2 size={17} /><input name="stream" placeholder="Paste a video stream URL" aria-label="Video stream URL" /><button className="button primary">Add video <ArrowRight size={15} /></button></form></div>}
      {room.video_url && error && <div className="video-error"><div><MonitorPlay size={22} /><p>{error}</p></div><button className="button secondary" onClick={() => send({ type: 'video_changed', video_url: '' })}>Change video</button></div>}
      {room.video_url && !error && <button className="fullscreen-button" title="Fullscreen" onClick={fullscreen}><MonitorPlay size={17} /></button>}
    </div>
    {room.video_url && <div className="player-controls">
      <div className="timeline"><span>{fmt(position)}</span><input aria-label="Seek video" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(position, duration || position)} onChange={onSeek} style={{ '--progress': `${duration ? position / duration * 100 : 0}%` }} /><span>{fmt(duration)}</span></div>
      <div className="control-row"><div className="controls-left"><button className="control-button" title="Back 10 seconds" onClick={() => seekBy(-10)}><span className="skip-label">10</span><ArrowLeft size={18} /></button><button className="play-button" title={playing && !autoplayBlocked ? 'Pause' : 'Play'} onClick={togglePlay}>{playing && !autoplayBlocked ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><button className="control-button" title="Forward 10 seconds" onClick={() => seekBy(10)}><span className="skip-label">10</span><ArrowRight size={18} /></button></div>
        <div className="controls-right"><button className="control-button" onClick={() => setVolume(volume ? 0 : 1)} title="Mute / unmute">{volume ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><input className="volume-range" aria-label="Volume" type="range" min="0" max="1" step=".05" value={volume} onChange={e => { setVolume(Number(e.target.value)); if (videoRef.current) videoRef.current.volume = Number(e.target.value); }} /><select aria-label="Playback speed" className="speed-select" onChange={e => { if (videoRef.current) videoRef.current.playbackRate = Number(e.target.value); }}><option value="1">1×</option><option value=".75">0.75×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>{hlsRef.current?.levels?.length > 1 && <select aria-label="Video quality" className="speed-select" value={quality} onChange={e => { const level = Number(e.target.value); hlsRef.current.currentLevel = level; setQuality(level); }}><option value="-1">Auto</option>{hlsRef.current.levels.map((level, index) => <option value={index} key={index}>{level.height}p</option>)}</select>}<button className="control-button" onClick={fullscreen} title="Fullscreen"><MonitorPlay size={17} /></button></div>
      </div>
    </div>}
    {room.video_url && <form className="change-stream" onSubmit={onUrl}><Link2 size={15} /><input name="stream" placeholder="Paste a new video link to share with everyone…" aria-label="Change video URL" /><button aria-label="Change video"><ArrowRight size={16} /></button></form>}
  </div>;
}

function RoomPage() {
  const { roomId } = useParams();
  const user = getUser();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [participants, setParticipants] = useState([]);
  const [callParticipants, setCallParticipants] = useState([]);
  const [speakingIds, setSpeakingIds] = useState([]);
  const [chatOpen, setChatOpen] = useState(() => JSON.parse(localStorage.getItem('wwf_preferences') || '{}').chatOpenByDefault !== false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const [call, setCall] = useState(false);
  const [callMode, setCallMode] = useState(null);
  const [callOptionsOpen, setCallOptionsOpen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [facingMode, setFacingMode] = useState('user');
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioInput, setAudioInput] = useState('');
  const [typing, setTyping] = useState('');
  const [copied, setCopied] = useState(false);
  const localStream = useRef(null);
  const socketRef = useRef(null);
  const peers = useRef({});
  const videos = useRef({});
  const remoteStreams = useRef({});
  const voiceMonitor = useRef({ context: null, frame: null, speaking: false });
  const chatEnd = useRef(null);
  const syncing = useRef(false);
  const setPlayerSyncing = useCallback(value => { syncing.current = value; }, []);
  const send = useCallback(event => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(event));
  }, []);
  const syncState = useCallback(next => {
    setRoom(current => current ? { ...current, ...next, position: next.position ?? current.position } : { ...next, members: [] });
  }, []);
  useEffect(() => {
    let active = true;
    let reconnectTimer;
    api(`/rooms/${roomId}/`, { method: 'POST' }).then(() => api(`/rooms/${roomId}/`)).then(data => {
      if (!active) return;
      setRoom(data); setMessages(data.messages || []); setParticipants(data.members || []);
      const url = `${WS}/ws/rooms/${roomId}/?token=${encodeURIComponent(getToken())}`;
      const connect = () => {
        if (!active) return;
        const ws = new WebSocket(url);
        socketRef.current = ws;
        ws.onmessage = event => {
          const message = JSON.parse(event.data);
          if (message.type === 'playback_state') syncState(message);
          else if (message.type === 'chat_message') setMessages(current => [...current, message.message]);
          else if (message.type === 'user_joined') setParticipants(current => current.some(p => p.id === message.user.id) ? current : [...current, message.user]);
          else if (message.type === 'user_left' || message.type === 'member_removed') {
            setParticipants(current => current.filter(p => p.id !== message.user.id));
            setCallParticipants(current => current.filter(id => id !== message.user.id));
            peers.current[message.user.id]?.close(); delete peers.current[message.user.id];
            if (message.type === 'member_removed' && message.user.id === user.id) { setError('You were removed from this room.'); ws.close(4403); navigate('/dashboard'); }
          } else if (message.type === 'error') setError(message.detail);
          else if (message.type === 'room_closed') { setError('The host closed this room.'); navigate('/dashboard'); }
          else if (message.type === 'room_settings') setRoom(current => ({ ...current, ...message.settings }));
          else if (message.type === 'call_joined') setCallParticipants(current => current.includes(message.user_id) ? current : [...current, message.user_id]);
          else if (message.type === 'call_left') {
            setCallParticipants(current => current.filter(id => id !== message.user_id));
            setSpeakingIds(current => current.filter(id => id !== message.user_id));
            peers.current[message.user_id]?.close(); delete peers.current[message.user_id];
          }
          else if (message.type === 'voice_state_changed') {
            setSpeakingIds(current => message.speaking
              ? (current.includes(message.user_id) ? current : [...current, message.user_id])
              : current.filter(id => id !== message.user_id));
          }
          else if (message.type === 'typing' && message.user !== user.username) {
            setTyping(`${message.user} is typing…`); setTimeout(() => setTyping(''), 1500);
          } else if (['offer', 'answer', 'ice_candidate'].includes(message.type) && message.target === user.id) handleSignal(message);
        };
        ws.onerror = () => setError('Connection hiccup. Reconnecting…');
        ws.onclose = event => {
          if (!active || event.code === 4403) return;
          setError('Room connection lost. Reconnecting…');
          reconnectTimer = setTimeout(connect, 1500);
        };
      };
      connect();
    }).catch(e => { if (active) setError(e.message); });
    return () => {
      active = false; clearTimeout(reconnectTimer);
      if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'call_left' }));
      socketRef.current?.close();
      Object.values(peers.current).forEach(pc => pc.close()); peers.current = {};
      localStream.current?.getTracks().forEach(track => track.stop());
      localStream.current = null;
      stopVoiceMonitor();
    };
  }, [roomId]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (!room) return undefined;
    const timer = setInterval(async () => {
      try { const latest = await api(`/rooms/${roomId}/`); if (!syncing.current) syncState({ ...latest, position: latest.position }); }
      catch { /* The websocket is still the primary room transport. */ }
    }, 10000);
    return () => clearInterval(timer);
  }, [roomId, room?.id, syncState]);
  async function invite() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError('Could not access clipboard. Copy the room URL from your browser.'); }
  }
  async function submitChat(event) { event.preventDefault(); if (!text.trim()) return; send({ type: 'chat_message', text: text.trim() }); setText(''); }
  async function updateSetting(field, value) {
    try { const updated = await api(`/rooms/${roomId}/`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) }); setRoom(current => ({ ...current, ...updated })); }
    catch (e) { setError(e.message); }
  }
  async function leave() {
    try { await api(`/rooms/${roomId}/leave/`, { method: 'POST' }); } catch { /* Navigate out even if the network is down. */ }
    socketRef.current?.close(); navigate('/dashboard');
  }
  function stopCall() {
    send({ type: 'call_left' });
    stopVoiceMonitor();
    localStream.current?.getTracks().forEach(track => track.stop());
    Object.values(peers.current).forEach(peer => peer.close());
    peers.current = {};
    remoteStreams.current = {};
    videos.current = {};
    localStream.current = null;
    setCall(false);
    setCallMode(null);
    setCallParticipants([]);
    setCameraOn(false);
    setMicOn(false);
  }
  async function toggleCall(mode) {
    if (call && callMode === mode) {
      stopCall();
      return;
    }
    if (call) stopCall();
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
      setAudioInputs((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput'));
      setCallMode(mode); setCall(true); setCallParticipants([user.id]); setCameraOn(mode === 'video'); setMicOn(true);
      startVoiceMonitor(localStream.current);
      send({ type: 'call_joined', mode });
    } catch (e) { setError(`Could not access ${mode === 'video' ? 'camera or microphone' : 'microphone'}: ${e.message}`); }
  }
  function createPeer(peerId, initiator = false) {
    if (peers.current[peerId] || !localStream.current) return peers.current[peerId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peers.current[peerId] = pc;
    localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current));
    pc.onicecandidate = event => { if (event.candidate) send({ type: 'ice_candidate', target: peerId, candidate: event.candidate, mode: callMode || 'video' }); };
    pc.ontrack = event => { remoteStreams.current[peerId] = event.streams[0]; const video = videos.current[peerId]; if (video) video.srcObject = event.streams[0]; };
    if (initiator) pc.createOffer().then(offer => pc.setLocalDescription(offer).then(() => send({ type: 'offer', target: peerId, sdp: offer, mode: callMode || 'video' }))).catch(e => setError(`Call setup failed: ${e.message}`));
    return pc;
  }
  useEffect(() => {
    if (!call || !localStream.current) return;
    participants.filter(peer => peer.id !== user.id && callParticipants.includes(peer.id) && !peers.current[peer.id]).forEach(peer => {
      if (Number(user.id) < Number(peer.id)) createPeer(peer.id, true);
      else createPeer(peer.id);
    });
  }, [call, callMode, participants, callParticipants, user.id]);
  useEffect(() => {
    if (!room?.voice_enabled) setCallOptionsOpen(false);
    if (call && room && (!room.voice_enabled || (callMode === 'video' && !room.video_enabled))) {
      stopCall();
    }
  }, [call, callMode, room?.voice_enabled, room?.video_enabled]);
  async function handleSignal(data) {
    try {
      let pc = peers.current[data.from];
      if (data.type === 'offer') {
        if (!pc) pc = createPeer(data.from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        send({ type: 'answer', target: data.from, sdp: answer, mode: callMode || 'video' });
      } else if (data.type === 'answer' && pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      else if (data.type === 'ice_candidate' && pc && data.candidate) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) { setError(`Video call signaling failed: ${e.message}`); }
  }
  function toggleTrack(kind) {
    const track = localStream.current?.getTracks().find(item => item.kind === kind);
    if (track) track.enabled = !track.enabled;
    if (kind === 'audio') setMicOn(Boolean(track?.enabled));
    else setCameraOn(Boolean(track?.enabled));
    if (kind === 'audio') send({ type: 'voice_state_changed', speaking: false, muted: !track?.enabled });
    else send({ type: 'camera_state_changed', enabled: Boolean(track?.enabled) });
  }
  function startVoiceMonitor(stream) {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return;
    const context = new AudioContextType();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    voiceMonitor.current = { context, frame: null, speaking: false };
    const measure = () => {
      analyser.getByteTimeDomainData(samples);
      const energy = samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length;
      const speaking = stream.getAudioTracks().some(track => track.enabled) && Math.sqrt(energy) > 0.035;
      if (speaking !== voiceMonitor.current.speaking) {
        voiceMonitor.current.speaking = speaking;
        send({ type: 'voice_state_changed', speaking });
      }
      voiceMonitor.current.frame = requestAnimationFrame(measure);
    };
    measure();
  }
  function stopVoiceMonitor() {
    if (voiceMonitor.current.frame) cancelAnimationFrame(voiceMonitor.current.frame);
    if (voiceMonitor.current.speaking) send({ type: 'voice_state_changed', speaking: false });
    voiceMonitor.current.context?.close();
    voiceMonitor.current = { context: null, frame: null, speaking: false };
  }
  async function switchCamera() {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing } } });
      const track = stream.getVideoTracks()[0];
      track.enabled = cameraOn;
      await Promise.all(Object.values(peers.current).map(peer => peer.getSenders().find(sender => sender.track?.kind === 'video')?.replaceTrack(track)));
      localStream.current.getVideoTracks().forEach(oldTrack => { localStream.current.removeTrack(oldTrack); oldTrack.stop(); });
      localStream.current.addTrack(track); setFacingMode(nextFacing);
    } catch (e) { setError(`Could not switch camera: ${e.message}`); }
  }
  async function changeAudioInput(deviceId) {
    setAudioInput(deviceId);
    if (!deviceId || !call) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const track = stream.getAudioTracks()[0];
      track.enabled = micOn;
      await Promise.all(Object.values(peers.current).map(peer => peer.getSenders().find(sender => sender.track?.kind === 'audio')?.replaceTrack(track)));
      localStream.current.getAudioTracks().forEach(oldTrack => { localStream.current.removeTrack(oldTrack); oldTrack.stop(); });
      localStream.current.addTrack(track);
      stopVoiceMonitor(); startVoiceMonitor(localStream.current);
    } catch (e) { setError(`Could not change microphone: ${e.message}`); }
  }
  async function closeRoom() {
    if (!window.confirm('Close this room for everyone?')) return;
    try { await api(`/rooms/${roomId}/`, { method: 'DELETE' }); navigate('/dashboard'); }
    catch (e) { setError(e.message); }
  }
  async function removeParticipant(peer) {
    try { await api(`/rooms/${roomId}/members/${peer.id}/`, { method: 'DELETE' }); }
    catch (e) { setError(e.message); }
  }
  if (!room && !error) return <Shell user={user}><div className="loading full-loading"><LoaderCircle className="spin" /> Joining your room...</div></Shell>;
  return <Shell user={user}><main className="watch-page">
    <div className="watch-toolbar"><div className="room-title"><Link className="back-button" to="/dashboard"><ArrowLeft size={18} /></Link><div><h1>{room?.name || 'Watch room'}</h1><span className="room-status"><span className="live-dot" /> {participants.length || 1} here now</span></div></div><div className="toolbar-actions"><button className="button secondary invite-button" onClick={invite}>{copied ? <Check size={16} /> : <Link2 size={16} />}{copied ? 'Copied!' : 'Invite friends'}</button>{room?.owner_id === user.id && <button className="icon-button" title="Room settings" onClick={() => setSettingsOpen(!settingsOpen)}><Settings size={18} /></button>}<button className="icon-button" title="Leave room" onClick={leave}><DoorOpen size={18} /></button></div></div>
    {error && <div className="alert room-alert">{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
    <div className={`watch-layout ${chatOpen ? '' : 'chat-collapsed'}`}><section className="watch-main">
      <div className="room-video-card"><Player room={room || {}} send={send} setSyncing={setPlayerSyncing} /></div>
      {call && <div className="call-panel"><div className="call-panel-heading"><div><span className="live-dot" /> <b>{callMode === 'audio' ? 'Voice chat' : 'Video call'}</b><span className="muted small"> · {callParticipants.length} in call</span></div><div className="device-controls">{audioInputs.length > 1 && <select aria-label="Microphone input" value={audioInput} onChange={e => changeAudioInput(e.target.value)}><option value="">Default microphone</option>{audioInputs.map(device => <option value={device.deviceId} key={device.deviceId}>{device.label || 'Microphone'}</option>)}</select>}{callMode === 'video' && <button className="control-button" onClick={switchCamera} title="Switch front/rear camera"><Camera size={16} /></button>}</div></div><div className={`video-tiles ${callMode === 'audio' ? 'voice-tiles' : ''}`}>
        <div className={`video-tile local-tile ${callMode === 'audio' && speakingIds.includes(user.id) ? 'speaking' : ''}`}><video autoPlay muted playsInline ref={element => { if (element && localStream.current) element.srcObject = localStream.current; }} /><span><Avatar size="tiny" name={user.username} photo={user.avatar_url} /> You</span>{(callMode === 'audio' || !cameraOn) && <div className="camera-off"><Avatar name={user.username} photo={user.avatar_url} /></div>}</div>
        {participants.filter(peer => peer.id !== user.id && callParticipants.includes(peer.id)).map(peer => <div className={`video-tile ${callMode === 'audio' ? 'voice-tile' : ''} ${speakingIds.includes(peer.id) ? 'speaking' : ''}`} key={peer.id}><video autoPlay playsInline ref={element => { videos.current[peer.id] = element; if (element && remoteStreams.current[peer.id]) element.srcObject = remoteStreams.current[peer.id]; }} />{callMode === 'audio' && <div className="voice-avatar"><Avatar name={peer.username} size="large" photo={peer.avatar_url} /></div>}<span><Avatar size="tiny" name={peer.username} online photo={peer.avatar_url} /> {peer.username}</span></div>)}
      </div></div>}
      <div className="room-social"><div className="participant-area"><div className="participant-avatars">{participants.slice(0, 5).map(peer => <Avatar key={peer.id} name={peer.username} online={speakingIds.includes(peer.id)} photo={peer.avatar_url} />)}{participants.length > 5 && <span className="more-people">+{participants.length - 5}</span>}</div><div><b>{participants.length || 1} here</b><span className="muted small"> · {speakingIds.length ? `${participants.find(peer => peer.id === speakingIds[0])?.username || 'Someone'} speaking` : 'watching together'}</span></div></div><div className="social-controls"><button className={`social-button ${micOn ? '' : 'is-off'}`} onClick={() => call && toggleTrack('audio')} title={call ? 'Toggle microphone' : 'Join audio chat or video call to use microphone'} disabled={!room?.voice_enabled}>{micOn && call ? <Mic size={17} /> : <MicOff size={17} />}<span>{micOn && call ? 'Mic on' : 'Mic off'}</span></button><button className={`social-button ${cameraOn && call ? '' : 'is-off'}`} onClick={() => call && toggleTrack('video')} title="Toggle camera" disabled={!room?.video_enabled || callMode !== 'video'}>{cameraOn && call ? <Video size={17} /> : <VideoOff size={17} />}<span>{cameraOn && call ? 'Camera on' : 'Camera off'}</span></button><div className="call-options-wrap"><button className={`social-button call-action ${call ? 'is-live' : ''}`} onClick={() => setCallOptionsOpen(open => !open)} aria-haspopup="menu" aria-expanded={callOptionsOpen} disabled={!room?.voice_enabled}>{callMode === 'audio' ? <Headphones size={17} /> : callMode === 'video' ? <Video size={17} /> : <Headphones size={17} />}<span>{callMode === 'audio' ? 'Audio chat active' : callMode === 'video' ? 'Video call active' : 'Start a call'}</span><ChevronDown size={14} /></button>{callOptionsOpen && <div className="call-options-menu" role="menu"><button role="menuitem" onClick={() => { toggleCall('audio'); setCallOptionsOpen(false); }} disabled={!room?.voice_enabled}>{callMode === 'audio' ? <MicOff size={16} /> : <Headphones size={16} />}<span>{callMode === 'audio' ? 'Leave audio chat' : 'Start audio chat'}</span></button><button role="menuitem" onClick={() => { toggleCall('video'); setCallOptionsOpen(false); }} disabled={!room?.voice_enabled || !room?.video_enabled}>{callMode === 'video' ? <VideoOff size={16} /> : <Video size={16} />}<span>{callMode === 'video' ? 'Leave video call' : 'Start video call'}</span></button></div>}</div><button className={`social-button chat-toggle ${chatOpen ? 'selected' : ''}`} onClick={() => setChatOpen(!chatOpen)}><MessageCircle size={17} /><span>{chatOpen ? 'Hide chat' : 'Open chat'}</span></button></div></div>
      {settingsOpen && room?.owner_id === user.id && <div className="settings-card">
        <div className="settings-title"><div><h3>Room settings</h3><p className="muted small">You’re the host. Make this space yours.</p></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={16} /></button></div>
        <label className="toggle-row">Only host can control playback<input type="checkbox" checked={room.host_controls_only} onChange={e => updateSetting('host_controls_only', e.target.checked)} /><span className="toggle" /></label>
        <label className="toggle-row">Allow audio chat<input type="checkbox" checked={room.voice_enabled} onChange={e => updateSetting('voice_enabled', e.target.checked)} /><span className="toggle" /></label>
        <label className="toggle-row">Allow video calls<input type="checkbox" checked={room.video_enabled} onChange={e => updateSetting('video_enabled', e.target.checked)} /><span className="toggle" /></label>
        <label className="toggle-row">Lock room<input type="checkbox" checked={room.is_locked} onChange={e => updateSetting('is_locked', e.target.checked)} /><span className="toggle" /></label>
        <div className="member-management"><b>Participants</b>{participants.filter(peer => peer.id !== user.id).map(peer => <div className="member-row" key={peer.id}><span><Avatar name={peer.username} size="tiny" online photo={peer.avatar_url} />{peer.username}</span><button className="remove-member" onClick={() => removeParticipant(peer)} aria-label={`Remove ${peer.username}`}><X size={14} /></button></div>)}</div>
        <button className="button danger" onClick={closeRoom}><X size={16} /> Close room for everyone</button>
      </div>}
    </section>
    <aside className={`chat-panel ${chatOpen ? 'open' : ''}`}><div className="chat-heading"><div><h2>Room chat</h2><p><span className="live-dot" /> {participants.length} online</p></div><button className="icon-button mobile-chat-close" onClick={() => setChatOpen(false)}><X size={17} /></button></div>
      <div className="chat-messages">{messages.map(message => <div className={`chat-message ${message.username === user.username ? 'own' : ''}`} key={message.id || `${message.created_at}-${message.username}`}><Avatar name={message.username} size="small" photo={message.avatar_url} /><div className="message-content"><div className="message-meta"><b>{message.username === user.username ? 'You' : message.username}</b><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></div></div>)}{typing && <div className="typing-indicator"><span className="typing-dots"><i /><i /><i /></span> {typing}</div>}<div ref={chatEnd} /></div>
      <form className="chat-compose" onSubmit={submitChat}><input value={text} onChange={e => { setText(e.target.value); send({ type: 'typing' }); }} placeholder="Say something nice…" maxLength={2000} aria-label="Chat message" /><button className="send-button" disabled={!text.trim()} aria-label="Send message"><Send size={17} /></button></form><div className="chat-note">Be kind. This is your little corner.</div>
    </aside></div>
    <div className="room-footer"><span><Lock size={13} /> Private invite-only room</span><span>{room?.host_controls_only ? 'Host controls playback' : 'Everyone controls playback'} · Changes sync for everyone</span></div>
  </main></Shell>;
}

function Profile() { const user = getUser(); return <Shell user={user}><main className="page-wrap simple-page"><div className="eyebrow">YOUR ACCOUNT</div><h1>Your profile</h1><div className="profile-card"><Avatar name={user?.username || '?'} size="large" photo={user?.avatar_url} /><div><h2>{user?.username}</h2><p className="muted">Together is better.</p></div></div><p className="muted profile-note">Manage your profile photo in Settings.</p></main></Shell>; }

function SettingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser);
  const [preferences, setPreferences] = useState(() => ({ keyboardShortcuts: true, chatOpenByDefault: true, ...JSON.parse(localStorage.getItem('wwf_preferences') || '{}') }));
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef(null);
  function update(field, value) {
    const next = { ...preferences, [field]: value };
    setPreferences(next); localStorage.setItem('wwf_preferences', JSON.stringify(next));
  }
  async function savePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Choose an image smaller than 5 MB.');
      event.target.value = '';
      return;
    }
    setPhotoBusy(true); setPhotoError('');
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const updated = await api('/auth/me/avatar/', { method: 'PATCH', body: formData });
      setUser(updated);
      localStorage.setItem('wwf_user', JSON.stringify(updated));
      window.dispatchEvent(new Event('wwf-auth-change'));
    } catch (e) { setPhotoError(e.message); }
    finally { setPhotoBusy(false); event.target.value = ''; }
  }
  async function removePhoto() {
    setPhotoBusy(true); setPhotoError('');
    try {
      const updated = await api('/auth/me/avatar/', { method: 'DELETE' });
      setUser(updated);
      localStorage.setItem('wwf_user', JSON.stringify(updated));
      window.dispatchEvent(new Event('wwf-auth-change'));
    } catch (e) { setPhotoError(e.message); }
    finally { setPhotoBusy(false); }
  }
  async function handleLogout() {
    await logoutUser();
    navigate('/login');
  }
  return <Shell user={user}><main className="page-wrap simple-page"><div className="eyebrow">MAKE IT YOURS</div><h1>Settings</h1><p className="muted settings-intro">Small things that make movie night feel like yours.</p>
    <section className="preferences-card account-preferences"><h2>Account</h2><div className="photo-setting"><Avatar name={user?.username || '?'} size="large" photo={user?.avatar_url} /><div><b>{user?.username}</b><p className="muted small">Your photo appears beside your name in rooms and chat.</p><div className="photo-actions"><input ref={photoInput} className="file-input-hidden" type="file" accept="image/*" onChange={savePhoto} /><button className="button secondary" type="button" onClick={() => photoInput.current?.click()} disabled={photoBusy}>{photoBusy ? 'Saving…' : user?.avatar_url ? 'Change photo' : 'Add photo'}</button>{user?.avatar_url && <button className="button quiet" type="button" onClick={removePhoto} disabled={photoBusy}>Remove</button>}</div></div></div>{photoError && <div className="alert">{photoError}</div>}<button className="button danger logout-button" type="button" onClick={handleLogout}><LogOut size={16} /> Log out</button></section>
    <section className="preferences-card"><h2>Watch room</h2><label className="toggle-row">Keyboard shortcuts<input type="checkbox" checked={preferences.keyboardShortcuts} onChange={e => update('keyboardShortcuts', e.target.checked)} /><span className="toggle" /></label><p className="muted small">Space to play or pause, arrow keys to seek, and M to mute.</p><label className="toggle-row">Open room chat by default<input type="checkbox" checked={preferences.chatOpenByDefault} onChange={e => update('chatOpenByDefault', e.target.checked)} /><span className="toggle" /></label></section><p className="muted profile-note">Your preferences are saved in this browser. Room playback and invite privacy are managed by the room host.</p></main></Shell>;
}

function App() {
  const [token, setToken] = useState(getToken);
  useEffect(() => {
    const updateAuth = () => setToken(getToken());
    window.addEventListener('wwf-auth-change', updateAuth);
    return () => window.removeEventListener('wwf-auth-change', updateAuth);
  }, []);
  return <Routes>
    <Route path="/" element={<Landing user={token ? getUser() : null} />} />
    <Route path="/register" element={token ? <Navigate to="/dashboard" replace /> : <AuthPage register />} />
    <Route path="/login" element={token ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
    <Route path="/dashboard" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
    <Route path="/room/:roomId" element={token ? <RoomPage /> : <Navigate to="/login" replace />} />
    <Route path="/profile" element={token ? <Profile /> : <Navigate to="/login" replace />} />
    <Route path="/settings" element={token ? <SettingsPage /> : <Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export default App;
