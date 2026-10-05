(function () {
  'use strict';

  const MODES = window.TimerModes;
  const STORAGE_KEY = 'timer3:settings';
  const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
  const MAX_SEC = 12 * 3600;
  const ACCENTS = [
    ['blue', 'Blue'], ['teal', 'Teal'], ['indigo', 'Indigo'],
    ['emerald', 'Emerald'], ['slate', 'Slate'], ['burgundy', 'Burgundy']
  ];
  const MILESTONES = [1800, 900, 600, 300, 120, 60, 30];
  const DEFAULTS = {
    durationSec: 15 * 60,
    mode: 'ring',
    title: '',
    theme: '',            // '' = match system
    accent: 'blue',
    sound: true,
    endChime: true,
    finalTicks: true,
    warnAt: 120,
    overtime: true,
    endMessage: "Time's up",
    showEndTime: true,
    autoHide: true
  };

  const $ = (sel) => document.querySelector(sel);
  const root = document.documentElement;
  const app = $('#app');
  const ui = {
    visual: $('#visual'),
    title: $('#session-title'),
    meta: $('#meta'),
    doneMessage: $('#done-message'),
    start: $('#start-btn'),
    startLabel: $('#start-label'),
    reset: $('#reset-btn'),
    plus: $('#plus-btn'),
    minus: $('#minus-btn'),
    presets: $('#presets'),
    customForm: $('#custom-form'),
    customMin: $('#custom-min'),
    customSec: $('#custom-sec'),
    customError: $('#custom-error'),
    modes: $('#modes'),
    sound: $('#sound-btn'),
    theme: $('#theme-btn'),
    fullscreen: $('#fullscreen-btn'),
    settingsBtn: $('#settings-btn'),
    dialog: $('#settings'),
    announcer: $('#announcer')
  };

  /* ---------- Settings persistence ---------- */
  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { saved = {}; }
    const s = Object.assign({}, DEFAULTS, saved);
    applyUrlParams(s);
    s.durationSec = clampSec(s.durationSec);
    if (!MODES.some((m) => m.id === s.mode)) s.mode = DEFAULTS.mode;
    if (!ACCENTS.some(([id]) => id === s.accent)) s.accent = DEFAULTS.accent;
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
  }

  // ?m=10&s=30&mode=hourglass&title=Coffee%20break&accent=teal
  function applyUrlParams(s) {
    const p = new URLSearchParams(location.search);
    const m = parseFloat(p.get('m'));
    const sec = parseInt(p.get('s'), 10);
    const total = (Number.isFinite(m) ? m * 60 : 0) + (Number.isFinite(sec) ? sec : 0);
    if (total > 0) s.durationSec = Math.round(total);
    if (p.has('mode')) s.mode = p.get('mode');
    if (p.has('title')) s.title = p.get('title').slice(0, 60);
    if (p.has('accent')) s.accent = p.get('accent');
  }

  function clampSec(sec) {
    const n = Math.round(Number(sec));
    if (!Number.isFinite(n) || n < 1) return DEFAULTS.durationSec;
    return Math.min(n, MAX_SEC);
  }

  const settings = loadSettings();

  /* ---------- Timer state ----------
   * Time is derived from a target timestamp rather than counted by intervals,
   * so it never drifts and stays accurate in background tabs. */
  const timer = {
    duration: settings.durationSec * 1000,
    remaining: settings.durationSec * 1000,
    endAt: 0,          // performance.now() target while running / overtime
    endedAtWall: 0,    // Date.now() when the countdown hit zero
    phase: 'idle'      // idle | running | paused | done
  };
  let lastWholeSec = null;
  let activeMode = null;

  const now = () => performance.now();

  function currentRemaining() {
    if (timer.phase === 'running') return timer.endAt - now();
    if (timer.phase === 'done') return settings.overtime ? timer.endAt - now() : 0;
    return timer.remaining;
  }

  function start() {
    unlockAudio();
    if (timer.phase === 'done' || timer.remaining <= 0) {
      timer.duration = settings.durationSec * 1000;
      timer.remaining = timer.duration;
    }
    timer.endAt = now() + timer.remaining;
    timer.phase = 'running';
    lastWholeSec = Math.ceil(timer.remaining / 1000);
    requestWakeLock();
    scheduleHide();
    render();
  }

  function pause() {
    timer.remaining = Math.max(0, timer.endAt - now());
    timer.phase = 'paused';
    releaseWakeLock();
    showChrome();
    render();
  }

  function reset() {
    timer.phase = 'idle';
    timer.duration = settings.durationSec * 1000;
    timer.remaining = timer.duration;
    releaseWakeLock();
    showChrome();
    render();
  }

  function toggle() {
    if (timer.phase === 'running') pause();
    else start();
  }

  function setDuration(sec) {
    settings.durationSec = clampSec(sec);
    saveSettings();
    reset();
    renderPresets();
  }

  function adjust(deltaSec) {
    const d = deltaSec * 1000;
    if (timer.phase === 'idle') {
      setDuration(Math.max(60, settings.durationSec + deltaSec));
      return;
    }
    if (timer.phase === 'done') {
      if (d <= 0) return;
      unlockAudio();
      timer.endAt = now() + d;
      timer.phase = 'running';
      lastWholeSec = deltaSec;
      requestWakeLock();
    } else if (timer.phase === 'running') {
      const rem = Math.max(1000, timer.endAt - now() + d);
      timer.endAt = now() + rem;
      timer.duration = Math.max(timer.duration, rem);
    } else {
      timer.remaining = Math.max(1000, timer.remaining + d);
      timer.duration = Math.max(timer.duration, timer.remaining);
    }
    render();
  }

  function complete() {
    timer.phase = 'done';
    timer.endedAtWall = Date.now();
    if (settings.endChime) playChime();
    announce(settings.endMessage || DEFAULTS.endMessage);
    releaseWakeLock();
    showChrome();
  }

  function tick() {
    if (timer.phase !== 'running') return;
    const rem = timer.endAt - now();
    if (rem <= 0) {
      complete();
      return;
    }
    const sec = Math.ceil(rem / 1000);
    if (sec !== lastWholeSec) {
      lastWholeSec = sec;
      if (settings.finalTicks && sec <= 10) playTick(sec <= 3);
      if (MILESTONES.includes(sec)) announce(`${durationLabel(sec)} remaining`);
    }
  }

  /* ---------- Formatting ---------- */
  const pad = (n) => String(n).padStart(2, '0');

  function formatTime(ms) {
    const over = ms < 0;
    const total = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const body = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    return (over ? '+' : '') + body;
  }

  function durationLabel(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const parts = [];
    if (h) parts.push(`${h} hr`);
    if (m) parts.push(`${m} min`);
    if (s) parts.push(`${s} sec`);
    return parts.join(' ') || '0 sec';
  }

  const clockTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  function levelFor(rem) {
    if (timer.phase === 'done') return 'done';
    if (timer.phase === 'idle' || !settings.warnAt) return 'normal';
    if (rem <= Math.min(30000, settings.warnAt * 1000)) return 'critical';
    if (rem <= settings.warnAt * 1000) return 'warning';
    return 'normal';
  }

  function subLabel() {
    switch (timer.phase) {
      case 'running': return 'remaining';
      case 'paused': return 'paused';
      case 'done': return settings.overtime ? 'overtime' : 'complete';
      default: return 'ready';
    }
  }

  /* ---------- Rendering ---------- */
  let lastMeta = null, lastDocTitle = null, lastPhase = null;

  function render() {
    tick();
    const rem = currentRemaining();
    const text = formatTime(rem);
    const fraction = Math.min(1, Math.max(0, rem / timer.duration));
    const level = levelFor(rem);

    if (app.dataset.state !== level) app.dataset.state = level;
    if (lastPhase !== timer.phase) {
      lastPhase = timer.phase;
      app.dataset.phase = timer.phase;
      updateControls();
    }

    activeMode.update({ remaining: rem, duration: timer.duration, fraction, text, phase: timer.phase, level, sub: subLabel() });

    let meta;
    if (timer.phase === 'running') {
      meta = settings.showEndTime ? `Ends at ${clockTime(new Date(Date.now() + rem))}` : 'In progress';
    } else if (timer.phase === 'paused') {
      meta = 'Paused — press Space to resume';
    } else if (timer.phase === 'done') {
      meta = `Ended at ${clockTime(new Date(timer.endedAtWall))}`;
    } else {
      meta = settings.showEndTime
        ? `${durationLabel(settings.durationSec)} · would end at ${clockTime(new Date(Date.now() + timer.remaining))}`
        : durationLabel(settings.durationSec);
    }
    if (meta !== lastMeta) { ui.meta.textContent = meta; lastMeta = meta; }

    const name = settings.title.trim();
    const docTitle = timer.phase === 'idle'
      ? 'Timer3 — Session Timer'
      : timer.phase === 'done'
        ? `${settings.endMessage || DEFAULTS.endMessage} · ${name || 'Timer3'}`
        : `${text} · ${name || 'Timer3'}`;
    if (docTitle !== lastDocTitle) { document.title = docTitle; lastDocTitle = docTitle; }
  }

  function updateControls() {
    const labels = { idle: 'Start', running: 'Pause', paused: 'Resume', done: 'Restart' };
    ui.startLabel.textContent = labels[timer.phase];
    ui.start.classList.toggle('is-running', timer.phase === 'running');
    const done = timer.phase === 'done';
    ui.doneMessage.hidden = !done;
    ui.doneMessage.textContent = settings.endMessage || DEFAULTS.endMessage;
    ui.minus.disabled = done;
  }

  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  /* ---------- Presets & custom duration ---------- */
  function renderPresets() {
    ui.presets.textContent = '';
    let matched = false;
    for (const min of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = min < 60 ? `${min}m` : `${min / 60}h`;
      b.setAttribute('aria-label', `${durationLabel(min * 60)}`);
      const active = settings.durationSec === min * 60;
      matched = matched || active;
      b.setAttribute('aria-pressed', String(active));
      b.addEventListener('click', () => {
        ui.customForm.hidden = true;
        setDuration(min * 60);
      });
      ui.presets.appendChild(b);
    }
    const custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'chip chip-custom';
    custom.textContent = matched ? 'Custom' : `Custom · ${formatTime(settings.durationSec * 1000)}`;
    custom.setAttribute('aria-pressed', String(!matched));
    custom.setAttribute('aria-expanded', String(!ui.customForm.hidden));
    custom.addEventListener('click', () => {
      ui.customForm.hidden = !ui.customForm.hidden;
      custom.setAttribute('aria-expanded', String(!ui.customForm.hidden));
      if (!ui.customForm.hidden) {
        ui.customMin.value = Math.floor(settings.durationSec / 60);
        ui.customSec.value = settings.durationSec % 60;
        ui.customError.textContent = '';
        ui.customMin.focus();
        ui.customMin.select();
      }
    });
    ui.presets.appendChild(custom);
  }

  ui.customForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const m = ui.customMin.value === '' ? 0 : Number(ui.customMin.value);
    const s = ui.customSec.value === '' ? 0 : Number(ui.customSec.value);
    const valid = Number.isInteger(m) && Number.isInteger(s) && m >= 0 && s >= 0 && s < 60;
    const total = m * 60 + s;
    if (!valid || total < 1 || total > MAX_SEC) {
      ui.customError.textContent = total > MAX_SEC ? 'Maximum is 12 hours.' : 'Enter whole minutes and seconds (0–59).';
      return;
    }
    ui.customError.textContent = '';
    ui.customForm.hidden = true;
    setDuration(total);
  });

  /* ---------- Display modes ---------- */
  function renderModeButtons() {
    ui.modes.textContent = '';
    MODES.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn';
      b.setAttribute('role', 'radio');
      b.dataset.mode = m.id;
      b.title = `${m.name} (${i + 1})`;
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${m.icon}</svg><span>${m.name}</span>`;
      b.addEventListener('click', () => setMode(m.id));
      ui.modes.appendChild(b);
    });
  }

  function setMode(id) {
    const mode = MODES.find((m) => m.id === id) || MODES[0];
    if (activeMode) activeMode.destroy();
    ui.visual.dataset.mode = mode.id;
    activeMode = mode.create(ui.visual);
    settings.mode = mode.id;
    saveSettings();
    for (const b of ui.modes.children) {
      b.setAttribute('aria-checked', String(b.dataset.mode === mode.id));
    }
    lastPhase = null;
    render();
  }

  /* ---------- Sound (Web Audio, no files needed) ---------- */
  let audioCtx = null;

  function unlockAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, offset, dur, gain, type) {
    const ctx = unlockAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // A soft three-note ascending chime (E major triad) with a faint overtone.
  function playChime(force) {
    if (!settings.sound && !force) return;
    [[659.25, 0], [830.61, 0.24], [987.77, 0.48]].forEach(([f, t]) => {
      tone(f, t, 1.8, 0.2);
      tone(f * 2, t, 0.9, 0.035);
    });
  }

  function playTick(accent) {
    if (!settings.sound) return;
    tone(accent ? 1318.5 : 1046.5, 0, 0.08, 0.06, 'triangle');
  }

  /* ---------- Screen-reader announcements ---------- */
  function announce(msg) {
    ui.announcer.textContent = '';
    setTimeout(() => { ui.announcer.textContent = msg; }, 50);
  }

  /* ---------- Keep the screen awake while running ---------- */
  let wakeLock = null;

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) {
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && timer.phase === 'running') requestWakeLock();
  });

  /* ---------- Auto-hide chrome while running ---------- */
  let hideTimer = 0;

  function scheduleHide() {
    clearTimeout(hideTimer);
    if (!settings.autoHide || timer.phase !== 'running') return;
    hideTimer = setTimeout(() => {
      const busy = ui.dialog.open || document.activeElement === ui.title || !ui.customForm.hidden;
      if (timer.phase === 'running' && !busy) app.classList.add('chrome-hidden');
    }, 3500);
  }

  function showChrome() {
    app.classList.remove('chrome-hidden');
    scheduleHide();
  }

  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, showChrome, { passive: true });
  });

  /* ---------- Theme, accent, sound, full screen ---------- */
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (settings.theme ? settings.theme === 'dark' : systemDark.matches);

  function applyAppearance() {
    if (settings.theme) root.dataset.theme = settings.theme;
    else delete root.dataset.theme;
    root.dataset.accent = settings.accent;
    ui.theme.classList.toggle('is-dark', isDark());
    ui.sound.setAttribute('aria-pressed', String(settings.sound));
    ui.sound.title = settings.sound ? 'Sound on (M)' : 'Sound off (M)';
  }
  systemDark.addEventListener('change', applyAppearance);

  function toggleTheme() {
    settings.theme = isDark() ? 'light' : 'dark';
    saveSettings();
    applyAppearance();
    syncSettingsForm();
  }

  function toggleSound() {
    settings.sound = !settings.sound;
    if (settings.sound) unlockAudio();
    saveSettings();
    applyAppearance();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  }

  document.addEventListener('fullscreenchange', () => {
    const fs = Boolean(document.fullscreenElement);
    app.classList.toggle('is-fullscreen', fs);
    ui.fullscreen.classList.toggle('is-active', fs);
    ui.fullscreen.title = fs ? 'Exit full screen (F)' : 'Full screen (F)';
  });

  /* ---------- Settings dialog ---------- */
  const form = {
    theme: $('#set-theme'),
    warn: $('#set-warn'),
    endTime: $('#set-endtime'),
    autoHide: $('#set-autohide'),
    message: $('#set-message'),
    overtime: $('#set-overtime'),
    chime: $('#set-chime'),
    ticks: $('#set-ticks'),
    share: $('#share-url'),
    copy: $('#copy-url'),
    test: $('#test-sound'),
    swatches: $('#accent-swatches')
  };

  function renderSwatches() {
    form.swatches.textContent = '';
    for (const [id, name] of ACCENTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.accent = id;
      b.title = name;
      b.setAttribute('aria-label', name);
      b.addEventListener('click', () => {
        settings.accent = id;
        saveSettings();
        applyAppearance();
        syncSettingsForm();
      });
      form.swatches.appendChild(b);
    }
  }

  function shareUrl() {
    const base = location.href.split(/[?#]/)[0];
    const p = new URLSearchParams();
    const sec = settings.durationSec;
    if (sec % 60 === 0) p.set('m', sec / 60);
    else { p.set('m', Math.floor(sec / 60)); p.set('s', sec % 60); }
    p.set('mode', settings.mode);
    if (settings.title.trim()) p.set('title', settings.title.trim());
    if (settings.accent !== DEFAULTS.accent) p.set('accent', settings.accent);
    return `${base}?${p.toString()}`;
  }

  function syncSettingsForm() {
    form.theme.value = settings.theme;
    form.warn.value = String(settings.warnAt);
    form.endTime.checked = settings.showEndTime;
    form.autoHide.checked = settings.autoHide;
    form.message.value = settings.endMessage;
    form.overtime.checked = settings.overtime;
    form.chime.checked = settings.endChime;
    form.ticks.checked = settings.finalTicks;
    form.share.value = shareUrl();
    for (const b of form.swatches.children) {
      b.setAttribute('aria-pressed', String(b.dataset.accent === settings.accent));
    }
  }

  function bindSetting(input, key, read) {
    input.addEventListener(input.type === 'text' ? 'input' : 'change', () => {
      settings[key] = read(input);
      saveSettings();
      applyAppearance();
      updateControls();
      lastMeta = null;
      render();
    });
  }

  bindSetting(form.theme, 'theme', (i) => i.value);
  bindSetting(form.warn, 'warnAt', (i) => Number(i.value));
  bindSetting(form.endTime, 'showEndTime', (i) => i.checked);
  bindSetting(form.autoHide, 'autoHide', (i) => i.checked);
  bindSetting(form.message, 'endMessage', (i) => i.value.slice(0, 60));
  bindSetting(form.overtime, 'overtime', (i) => i.checked);
  bindSetting(form.chime, 'endChime', (i) => i.checked);
  bindSetting(form.ticks, 'finalTicks', (i) => i.checked);

  form.test.addEventListener('click', () => playChime(true));

  form.copy.addEventListener('click', async () => {
    const url = form.share.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch (e) {
      form.share.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    }
    form.copy.textContent = ok ? 'Copied' : 'Select & copy';
    setTimeout(() => { form.copy.textContent = 'Copy'; }, 1800);
  });

  function openSettings() {
    syncSettingsForm();
    clearTimeout(hideTimer);
    ui.dialog.showModal();
  }

  ui.dialog.addEventListener('close', showChrome);
  ui.dialog.addEventListener('click', (e) => {
    if (e.target === ui.dialog) ui.dialog.close(); // click on backdrop
  });

  /* ---------- Session title ---------- */
  ui.title.value = settings.title;
  ui.title.addEventListener('input', () => {
    settings.title = ui.title.value.slice(0, 60);
    saveSettings();
  });
  ui.title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') ui.title.blur();
  });
  ui.title.addEventListener('blur', scheduleHide);

  /* ---------- Buttons & keyboard ---------- */
  ui.start.addEventListener('click', toggle);
  ui.reset.addEventListener('click', reset);
  ui.plus.addEventListener('click', () => adjust(60));
  ui.minus.addEventListener('click', () => adjust(-60));
  ui.sound.addEventListener('click', toggleSound);
  ui.theme.addEventListener('click', toggleTheme);
  ui.fullscreen.addEventListener('click', toggleFullscreen);
  ui.settingsBtn.addEventListener('click', openSettings);

  // After a mouse click, drop focus so Space keeps meaning "start/pause"
  // instead of re-activating whichever button was clicked last.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && e.detail > 0 && !ui.dialog.contains(b)) b.blur();
  });

  document.addEventListener('keydown', (e) => {
    if (ui.dialog.open || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest('input, select, textarea')) return;
    const onButton = t.closest && t.closest('button');

    switch (e.key) {
      case ' ':
      case 'Spacebar':
        if (onButton) return;
        e.preventDefault();
        toggle();
        break;
      case 'r': case 'R': reset(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 't': case 'T': toggleTheme(); break;
      case 'm': case 'M': toggleSound(); break;
      case 'ArrowUp': case '+': case '=': e.preventDefault(); adjust(60); break;
      case 'ArrowDown': case '-': case '_': e.preventDefault(); adjust(-60); break;
      case '?': openSettings(); break;
      default:
        if (/^[1-9]$/.test(e.key) && MODES[Number(e.key) - 1]) setMode(MODES[Number(e.key) - 1].id);
    }
  });

  // Run the countdown logic even when the tab is hidden (rAF pauses there),
  // so the chime still plays on time.
  setInterval(tick, 250);

  /* ---------- Boot ---------- */
  applyAppearance();
  renderSwatches();
  renderPresets();
  renderModeButtons();
  setMode(settings.mode);
  requestAnimationFrame(loop);
})();
