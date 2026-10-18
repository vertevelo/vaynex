/* Beat Store, shared by /beats/ and /de/beats/.
   The beat list is beats.json on the Bunny CDN, published by the Vaynex app ("Live stellen").
   Paths inside it (covers, previews) are relative to the file. Buying is an email to Vaynex, no checkout. */
(() => {
  'use strict';

  const CATALOG = 'https://vaynex.b-cdn.net/store/beats.json';
  const MAIL = 'mail@vaynex.ch';
  const MOOD_ORDER = ['Soul', 'Industrial', 'Orchestral', 'Dissonant'];
  // NEW flag: days since the beat came into the store ("added", set by the app). Same number as BeatStore.newDays in the app.
  const NEW_DAYS = 30;

  const de = (document.documentElement.lang || '').toLowerCase().startsWith('de');
  const T = de ? {
    all: 'Alle', new: 'Neu', buy: 'Kaufen', ask: 'Anfragen', reserved: 'Reserviert', sold: 'Verkauft',
    tally: (n, a, r, s) => [`<b>${n}</b> Beats`, `<span class="dot available"></span>${a} verfügbar`,
      r ? `<span class="dot reserved"></span>${r} reserviert` : '', s ? `<span class="dot sold"></span>${s} verkauft` : ''],
    preview: 'Vorschau mit Voice-Tag', soldLine: 'Exklusiv verkauft',
    play: name => `${name} abspielen`, pause: 'Pause', copyLink: name => `Link zu ${name} kopieren`,
    copied: 'Link kopiert', addressCopied: 'Adresse kopiert',
    noMatch: 'Kein Beat passt dazu.', showAll: 'Alle Beats zeigen',
    loadError: 'Die Beats liessen sich gerade nicht laden. Lade die Seite neu oder schreib mir an',
    audioError: 'Die Vorschau lädt gerade nicht. Versuch es gleich nochmals.',
    subject: b => `Beat-Lizenz: ${b.name} (${b.bpm} BPM)`,
    body: (b, url) => `Hallo Vaynex\n\nIch möchte die Exklusivlizenz für "${b.name}" (${b.bpm} BPM, CHF ${b.price}) kaufen.\n${url}\n\nArtist-Name:\nInstagram oder Spotify:\nWofür (Single, EP, Video …):\n\nDanke!`,
    askSubject: b => `Reservierter Beat: ${b.name}`,
    askBody: (b, url) => `Hallo Vaynex\n\n"${b.name}" ist als reserviert markiert. Falls er wieder frei wird, sag mir bitte Bescheid.\n${url}\n\nArtist-Name:\nInstagram oder Spotify:\n\nDanke!`
  } : {
    all: 'All', new: 'New', buy: 'Buy', ask: 'Ask', reserved: 'Reserved', sold: 'Sold',
    tally: (n, a, r, s) => [`<b>${n}</b> beats`, `<span class="dot available"></span>${a} available`,
      r ? `<span class="dot reserved"></span>${r} reserved` : '', s ? `<span class="dot sold"></span>${s} sold` : ''],
    preview: 'Preview with voice tag', soldLine: 'Exclusive, sold',
    play: name => `Play ${name}`, pause: 'Pause', copyLink: name => `Copy link to ${name}`,
    copied: 'Link copied', addressCopied: 'Address copied',
    noMatch: 'No beats match that.', showAll: 'Show all beats',
    loadError: "The beats didn't load right now. Reload the page or write to",
    audioError: "This preview didn't load. Try again in a moment.",
    subject: b => `Beat license: ${b.name} (${b.bpm} BPM)`,
    body: (b, url) => `Hi Vaynex,\n\nI'd like to buy the exclusive license for "${b.name}" (${b.bpm} BPM, CHF ${b.price}).\n${url}\n\nArtist name:\nInstagram or Spotify:\nWhat it's for (single, EP, video ...):\n\nThanks!`,
    askSubject: b => `Reserved beat: ${b.name}`,
    askBody: (b, url) => `Hi Vaynex,\n\n"${b.name}" is marked reserved. If it becomes available again, please let me know.\n${url}\n\nArtist name:\nInstagram or Spotify:\n\nThanks!`
  };

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  // Whole days since a YYYY-MM-DD date, counted in the visitor's time zone
  const daysSince = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? Math.floor((Date.now() - new Date(d + 'T00:00:00')) / 864e5) : Infinity;
  const fmt = s => (isFinite(s) && s > 0) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';

  // A catalog from elsewhere only on a local test server, never on vaynex.ch
  const params = new URLSearchParams(location.search);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.localhost');
  const catalogURL = new URL((local && params.get('catalog')) || CATALOG, location.href).href;

  const rowsEl = $('rows'), chipsEl = $('chips'), tallyEl = $('tally'), player = $('player'), pWave = $('pWave');
  const audio = new Audio();
  audio.preload = 'none';
  let beats = [], visible = [], loadedIndex = -1;
  const state = { cur: -1, mood: 'all', q: '', sort: 'new', only: false };

  const PLAY = '<path d="M7 4.5v15l13-7.5z"/>';
  const PAUSE = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
  const LINK = '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';

  // ---------- Data ----------
  function prep(raw, i) {
    const status = ['available', 'reserved', 'sold'].includes(raw.status) ? raw.status : 'available';
    const b = {
      i, status,
      id: String(raw.id || ''), name: String(raw.name || ''), bpm: Math.round(+raw.bpm || 0),
      mood: String(raw.mood || ''), tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      price: Math.round(+raw.price || 0), date: String(raw.date || ''), added: String(raw.added || ''),
      cover: raw.cover ? new URL(raw.cover, catalogURL).href : '',
      audio: raw.audio && status !== 'sold' ? new URL(raw.audio, catalogURL).href : '',
      dur: +raw.duration || 0,
      peaks: Array.isArray(raw.peaks) && raw.peaks.length ? raw.peaks.map(Number) : null
    };
    if (!b.id) b.id = slugify(b.name);
    b.isNew = status !== 'sold' && daysSince(b.added) < NEW_DAYS;
    return b;
  }
  const playable = b => !!b.audio;
  // Newest first: latest into the store, then by production date. Beats from the launch have no "added".
  const newest = (a, b) => b.added.localeCompare(a.added) || b.date.localeCompare(a.date) || a.name.localeCompare(b.name);
  const meta = b => [b.bpm ? b.bpm + ' BPM' : '', b.mood].filter(Boolean).join(' · ');
  const shareURL = b => location.origin + location.pathname + '#' + b.id;

  function mailto(subject, body) {
    return `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
  }
  const buyHref = b => mailto(T.subject(b), T.body(b, shareURL(b)));
  const askHref = b => mailto(T.askSubject(b), T.askBody(b, shareURL(b)));

  // ---------- Waveform ----------
  function bars(b, n = 64) {
    const p = b.peaks;
    if (!p) return Array(n).fill(0.35);
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = Math.floor(k * p.length / n);
      const z = Math.max(a + 1, Math.floor((k + 1) * p.length / n));
      let m = 0;
      for (let j = a; j < z; j++) m = Math.max(m, p[j] || 0);
      out.push(Math.max(0.08, Math.min(1, m)));
    }
    return out;
  }
  function waveSVG(vals) {
    const w = vals.length * 3;
    return `<svg viewBox="0 0 ${w} 32" preserveAspectRatio="none" aria-hidden="true">${vals.map((v, k) =>
      `<rect x="${k * 3}" y="${((32 - v * 32) / 2).toFixed(2)}" width="2" height="${(v * 32).toFixed(2)}" rx="1"/>`).join('')}</svg>`;
  }
  function waveBlock(b) { const s = waveSVG(bars(b)); return `<div class="base">${s}</div><div class="top">${s}</div>`; }
  function coverHTML(b, stamp) {
    const img = b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" width="56" height="56">` : `<span class="ph">${esc(b.name)}</span>`;
    return img + (stamp && b.status === 'sold' ? `<span class="stamp">${esc(T.sold.toUpperCase())}</span>` : '');
  }

  // ---------- Filters ----------
  function moods() {
    const present = [...new Set(beats.map(b => b.mood).filter(Boolean))];
    const ordered = MOOD_ORDER.filter(m => present.includes(m));
    return ['all', ...ordered, ...present.filter(m => !ordered.includes(m)).sort()];
  }
  function renderChips() {
    const pool = beats.filter(b => !state.only || b.status === 'available');
    chipsEl.innerHTML = moods().map(m => {
      const c = m === 'all' ? pool.length : pool.filter(b => b.mood === m).length;
      return `<button class="chip" aria-pressed="${state.mood === m}" data-mood="${esc(m)}">${esc(m === 'all' ? T.all : m)}<span class="count num">${c}</span></button>`;
    }).join('');
  }
  function renderTally() {
    const n = s => beats.filter(b => b.status === s).length;
    tallyEl.innerHTML = T.tally(beats.length, n('available'), n('reserved'), n('sold')).filter(Boolean).map(t => `<span>${t}</span>`).join('');
  }

  // ---------- List ----------
  function renderRows() {
    const q = state.q.trim().toLowerCase();
    visible = beats.filter(b =>
      (state.mood === 'all' || b.mood === state.mood) &&
      (!state.only || b.status === 'available') &&
      (!q || b.name.toLowerCase().includes(q) || b.mood.toLowerCase().includes(q) || b.tags.some(t => t.toLowerCase().includes(q)) || String(b.bpm) === q));
    const s = state.sort;
    visible.sort((a, b) =>
      s === 'bpm-asc' ? a.bpm - b.bpm || a.name.localeCompare(b.name) :
      s === 'bpm-desc' ? b.bpm - a.bpm || a.name.localeCompare(b.name) :
      s === 'name' ? a.name.localeCompare(b.name) :
      newest(a, b));
    if (!visible.length) {
      rowsEl.innerHTML = `<p class="empty">${esc(T.noMatch)} <button type="button" id="clear">${esc(T.showAll)}</button></p>`;
      return;
    }
    rowsEl.innerHTML = visible.map(rowHTML).join('');
    syncUI(true);
  }

  function rowHTML(b) {
    const sold = b.status === 'sold', reserved = b.status === 'reserved';
    const statusText = sold ? T.sold : reserved ? T.reserved : '';
    const cover = playable(b)
      ? `<button class="cover" type="button" data-act="play" aria-label="${esc(T.play(b.name))}">${coverHTML(b)}<span class="ov"><svg viewBox="0 0 24 24">${PLAY}</svg></span></button>`
      : `<span class="cover">${coverHTML(b, true)}</span>`;
    const wave = playable(b) ? `<div class="wave" data-act="seek">${waveBlock(b)}</div>` : `<span class="soldline">${sold ? esc(T.soldLine) : ''}</span>`;
    const price = sold ? `<span class="pill sold">${esc(T.sold)}</span>` : reserved ? `<span class="pill reserved">${esc(T.reserved)}</span>` : `CHF ${b.price}`;
    let acts = '';
    if (!sold) {
      acts += `<button class="icon-btn" type="button" data-act="link" aria-label="${esc(T.copyLink(b.name))}" title="${esc(T.copyLink(b.name))}">${LINK}</button>`;
      acts += reserved
        ? `<a class="ask" href="${esc(askHref(b))}">${esc(T.ask)}</a>`
        : `<button class="buy" type="button" data-act="buy"><span class="long">${esc(T.buy)}</span><span class="short num">CHF ${b.price}</span></button>`;
    }
    return `
      <div class="row beat ${b.status}" id="${esc(b.id)}" data-i="${b.i}">
        ${cover}
        <div class="title"><b><span class="nm">${esc(b.name)}</span>${b.isNew ? `<span class="new">${esc(T.new)}</span>` : ''}<span class="eq" hidden><i></i><i></i><i></i></span></b><span class="meta num">${esc([meta(b), statusText].filter(Boolean).join(' · '))}</span></div>
        <span class="mood">${esc(b.mood)}</span>
        <span class="bpm num">${b.bpm || ''}</span>
        ${wave}
        <span class="price num">${price}</span>
        <div class="acts">${acts}</div>
      </div>`;
  }

  // ---------- Player ----------
  function current() { return beats[state.cur]; }
  function prime(i) {
    if (loadedIndex === i) return;
    loadedIndex = i;
    audio.src = beats[i].audio;
    mediaSession(beats[i]);
  }
  function select(i) {
    if (state.cur === i) return;
    state.cur = i;
    pWave.innerHTML = waveBlock(beats[i]);
    syncUI(true);
  }
  function playNow() {
    const p = audio.play();
    if (p && p.catch) p.catch(err => { if (err && err.name !== 'AbortError') say(T.audioError); syncUI(true); });
  }
  function load(i, at) {
    const b = beats[i];
    if (!b || !playable(b)) return;
    select(i);
    prime(i);
    if (at > 0) {
      const seek = () => { try { audio.currentTime = at; } catch (e) { /* not seekable yet */ } };
      if (audio.readyState >= 1) seek(); else audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    playNow();
    syncUI(true);
  }
  function toggle(i) {
    if (i === undefined || i === state.cur) {
      if (state.cur < 0) return;
      if (audio.paused || loadedIndex !== state.cur) { prime(state.cur); playNow(); } else audio.pause();
    } else load(i, 0);
  }
  function step(dir) {
    const pool = (visible.some(playable) ? visible : beats).filter(playable);
    if (!pool.length) return;
    let k = pool.findIndex(b => b.i === state.cur);
    k = k < 0 ? 0 : (k + dir + pool.length) % pool.length;
    load(pool[k].i, 0);
  }
  function duration() {
    const b = current();
    return (loadedIndex === state.cur && isFinite(audio.duration) && audio.duration > 0) ? audio.duration : (b ? b.dur : 0);
  }
  function position() { return loadedIndex === state.cur ? audio.currentTime || 0 : 0; }
  const isPlaying = () => loadedIndex === state.cur && !audio.paused && !audio.ended;

  function syncUI(full) {
    const b = current();
    if (!b) return;
    const d = duration();
    const p = d ? Math.min(100, position() / d * 100).toFixed(2) + '%' : '0%';
    const playing = isPlaying();
    if (full) {
      $('pCover').innerHTML = coverHTML(b);
      $('pName').textContent = b.name;
      $('pMeta').textContent = [meta(b), b.status === 'reserved' ? T.reserved : T.preview].filter(Boolean).join(' · ');
      $('tDur').textContent = fmt(d);
      $('playIcon').innerHTML = playing ? PAUSE : PLAY;
      $('play').setAttribute('aria-label', playing ? T.pause : T.play(b.name));
      const pb = $('pBuy');
      pb.hidden = b.status !== 'available';
      pb.querySelector('.long').textContent = `${T.buy} · CHF ${b.price}`;
      pb.querySelector('.short').textContent = T.buy;
    }
    pWave.style.setProperty('--p', p);
    $('thin').style.setProperty('--p', p);
    $('tCur').textContent = fmt(position());
    rowsEl.querySelectorAll('.row.beat').forEach(r => {
      const on = +r.dataset.i === state.cur;
      r.classList.toggle('is-current', on);
      r.classList.toggle('playing', on && playing);
      const eq = r.querySelector('.eq'); if (eq) eq.hidden = !(on && playing);
      const w = r.querySelector('.wave'); if (w) w.style.setProperty('--p', on ? p : '0%');
      const ov = r.querySelector('.cover .ov svg'); if (ov) ov.innerHTML = on && playing ? PAUSE : PLAY;
    });
  }

  ['play', 'pause', 'loadedmetadata', 'durationchange'].forEach(ev => audio.addEventListener(ev, () => syncUI(true)));
  audio.addEventListener('timeupdate', () => syncUI(false));
  audio.addEventListener('waiting', () => $('play').classList.add('loading'));
  ['playing', 'pause', 'error'].forEach(ev => audio.addEventListener(ev, () => $('play').classList.remove('loading')));
  audio.addEventListener('ended', () => step(1));
  audio.addEventListener('error', () => { if (audio.src) say(T.audioError); syncUI(true); });

  function mediaSession(b) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: b.name, artist: 'Vaynex', album: 'Beat Store',
        artwork: b.cover ? [{ src: b.cover, sizes: '600x600', type: 'image/jpeg' }] : []
      });
    } catch (e) { /* older browsers */ }
  }
  if ('mediaSession' in navigator) {
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported action */ } };
    set('play', () => toggle());
    set('pause', () => audio.pause());
    set('previoustrack', () => step(-1));
    set('nexttrack', () => step(1));
    set('seekto', d => { if (d && isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
  }

  function seekFromClick(e, el, i) {
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const d = i === state.cur ? duration() : beats[i].dur;
    if (i === state.cur && loadedIndex === i && audio.readyState >= 1) { audio.currentTime = ratio * d; if (audio.paused) playNow(); }
    else load(i, ratio * d);
  }

  // ---------- Buy sheet ----------
  const sheet = $('sheet');
  let lastFocus = null;
  function openSheet(b) {
    $('sCover').innerHTML = coverHTML(b);
    $('sTitle').textContent = b.name;
    $('sMeta').textContent = [meta(b), `CHF ${b.price}`].filter(Boolean).join(' · ');
    $('sGo').href = buyHref(b);
    lastFocus = document.activeElement;
    sheet.hidden = false;
    $('sGo').focus();
  }
  function closeSheet() { sheet.hidden = true; if (lastFocus) lastFocus.focus(); }
  $('sClose').addEventListener('click', closeSheet);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  $('sCopy').addEventListener('click', () => copy(MAIL, T.addressCopied));
  $('sGo').addEventListener('click', () => setTimeout(closeSheet, 400));

  // ---------- Toast, copy ----------
  const toast = $('toast');
  let toastT;
  function say(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toast.hidden = true; }, 2600); }
  function copy(text, ok) {
    try { navigator.clipboard.writeText(text).then(() => say(ok), () => say(text)); } catch (e) { say(text); }
  }

  // ---------- Events ----------
  chipsEl.addEventListener('click', e => {
    const t = e.target.closest('.chip'); if (!t) return;
    state.mood = t.dataset.mood; renderChips(); renderRows();
  });
  rowsEl.addEventListener('click', e => {
    if (e.target.id === 'clear') {
      Object.assign(state, { mood: 'all', q: '', only: false });
      $('q').value = ''; $('only').checked = false;
      renderChips(); renderRows(); return;
    }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const b = beats[+el.closest('.row').dataset.i];
    const act = el.dataset.act;
    if (act === 'play') toggle(b.i);
    if (act === 'seek') seekFromClick(e, el, b.i);
    if (act === 'buy') openSheet(b);
    if (act === 'link') copy(shareURL(b), `${T.copied}: ${shareURL(b).replace(/^https?:\/\/(www\.)?/, '')}`);
  });
  $('q').addEventListener('input', e => { state.q = e.target.value; renderRows(); });
  $('sort').addEventListener('change', e => { state.sort = e.target.value; renderRows(); });
  $('only').addEventListener('change', e => { state.only = e.target.checked; if (state.only && state.mood !== 'all' && !beats.some(b => b.mood === state.mood && b.status === 'available')) state.mood = 'all'; renderChips(); renderRows(); });
  $('play').addEventListener('click', () => toggle());
  $('prev').addEventListener('click', () => { if (position() > 3) audio.currentTime = 0; else step(-1); });
  $('next').addEventListener('click', () => step(1));
  pWave.addEventListener('click', e => { if (state.cur >= 0) seekFromClick(e, pWave, state.cur); });
  $('pBuy').addEventListener('click', () => { const b = current(); if (b) openSheet(b); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !sheet.hidden) closeSheet();
    if (e.code === 'Space' && sheet.hidden && !e.target.closest('input, select, textarea, button, a')) { e.preventDefault(); toggle(); }
  });

  function reveal(id, flash) {
    const b = beats.find(x => x.id === id);
    if (!b) return;
    if (playable(b)) select(b.i);
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }
  window.addEventListener('hashchange', () => reveal(decodeURIComponent(location.hash.slice(1)), true));

  // ---------- Start ----------
  function init(data) {
    const list = Array.isArray(data && data.beats) ? data.beats : [];
    beats = list.map(prep).filter(b => b.name);
    renderTally();
    renderChips();
    renderRows();
    const first = beats.filter(playable).sort(newest)[0];
    if (first) {
      player.hidden = false;
      document.body.classList.add('has-player');
      select(first.i);
    }
    const h = decodeURIComponent(location.hash.slice(1));
    if (h) reveal(h, true);
  }
  function fail() {
    rowsEl.innerHTML = `<p class="error">${esc(T.loadError)} <a href="mailto:${MAIL}">${MAIL}</a>.</p>`;
    tallyEl.innerHTML = '';
  }
  fetch(catalogURL, { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(init)
    .catch(fail);
})();
