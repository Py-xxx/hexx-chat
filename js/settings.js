/* Settings page: form <-> config, live preview, and the OBS link. */
(function () {
  const { DEFAULTS, parse, toQuery } = window.HexxConfig;
  const STORE_KEY = 'hexx-chat-settings';

  // Changing these needs the preview to reload; everything else restyles live.
  const RELOAD_KEYS = ['channel', 'direction', 'emotes7tv', 'emotesBttv', 'emotesFfz', 'showConnected', 'counter', 'counterWords', 'counterMilestone'];

  const $ = (sel) => document.querySelector(sel);
  const form = $('#form');
  const frame = $('#previewFrame');
  const counterFrame = $('#counterFrame');
  let previewMode = 'sample';
  let cfg = loadInitial();
  let reloadTimer = null;

  /* ---------------- Load / save ---------------- */

  function loadInitial() {
    const search = new URLSearchParams(location.search);
    if ([...search.keys()].some((k) => k in DEFAULTS)) return parse(location.search);
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved, channel: saved.channel || DEFAULTS.channel };
    } catch { /* private window or blocked storage: just use defaults */ }
    return { ...DEFAULTS };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  }

  /* ---------------- Form ---------------- */

  function fields() {
    return form.querySelectorAll('[name]');
  }

  function fillForm() {
    for (const el of fields()) {
      const v = cfg[el.name];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    }
    updateOutputs();
    updateSwatches();
  }

  function readField(el) {
    const type = typeof DEFAULTS[el.name];
    if (type === 'boolean') return el.checked;
    if (type === 'number') return parseFloat(el.value);
    if (el.name === 'channel') {
      const name = el.value.trim().replace(/^.*twitch\.tv\//i, '').replace(/^[#@]/, '').replace(/[/?#].*$/, '').toLowerCase();
      return name || DEFAULTS.channel;
    }
    return el.value;
  }

  function formatLifetime(s) {
    if (!s) return 'never';
    if (s < 60) return s + ' sec';
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m} min ${r} sec` : `${m} min`;
  }

  function updateOutputs() {
    const fmt = {
      fontSize: (v) => v + 'px',
      emoteScale: (v) => (+v).toFixed(1) + '×',
      lifetime: formatLifetime,
      maxMessages: (v) => v,
      cardOpacity: (v) => (v == 0 ? 'none' : v + '%'),
      badgeScale: (v) => (+v).toFixed(1) + '×',
      counterMilestone: (v) => (v == 0 ? 'never' : v + ' counts'),
      width: (v) => v + 'px',
    };
    for (const out of document.querySelectorAll('output[data-for]')) {
      const key = out.dataset.for;
      out.textContent = fmt[key] ? fmt[key](cfg[key]) : cfg[key];
    }
    $('#obsW').textContent = cfg.width;
  }

  function updateSwatches() {
    for (const sw of document.querySelectorAll('.swatch[data-color]')) {
      sw.classList.toggle('on', sw.dataset.color.toLowerCase() === String(cfg.accent).toLowerCase());
    }
    const custom = document.querySelector('.swatch.custom');
    custom.classList.toggle('on', !document.querySelector('.swatch.on[data-color]'));
    custom.style.setProperty('--c', cfg.accent);
  }

  function set(key, value) {
    const before = cfg[key];
    cfg[key] = value;
    save();
    updateOutputs();
    updateSwatches();
    updateLink();
    if (before !== value) refreshPreview(key);
  }

  form.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el.name || !(el.name in DEFAULTS)) return;
    set(el.name, readField(el));
  });

  document.querySelectorAll('.swatch[data-color]').forEach((sw) => {
    sw.addEventListener('click', () => {
      form.querySelector('[name=accent]').value = sw.dataset.color;
      set('accent', sw.dataset.color);
    });
  });

  /* ---------------- OBS link ---------------- */

  function overlayLink() {
    const base = new URL('overlay.html', location.href);
    base.search = '';
    base.hash = '';
    return base.href + toQuery(cfg);
  }

  function counterLink() {
    const base = new URL('overlay.html', location.href);
    base.search = '';
    base.hash = '';
    return base.href + toQuery(cfg, { view: 'counter' });
  }

  function updateLink() {
    $('#overlayUrl').value = overlayLink();
    $('#counterUrl').value = counterLink();
    $('#counterLinkBox').hidden = !cfg.counter;
    $('#counterFields').classList.toggle('off', !cfg.counter);
    const missing = !cfg.channel;
    $('#noChannelWarn').hidden = !missing;
    $('#copyBtn').disabled = missing;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const input = $('#overlayUrl');
      input.focus();
      input.select();
      try { return document.execCommand('copy'); } catch { return false; }
    }
  }

  $('#copyBtn').addEventListener('click', async () => {
    const ok = await copy(overlayLink());
    toast(ok ? 'Copied! Now paste it into the OBS Browser source.' : 'Select the link and press Ctrl+C / ⌘C to copy it.');
  });

  $('#copyCounterBtn').addEventListener('click', async () => {
    const ok = await copy(counterLink());
    toast(ok ? 'Counter link copied! Add it as a second Browser source.' : 'Select the link and press Ctrl+C / ⌘C to copy it.');
  });

  $('#overlayUrl').addEventListener('focus', (e) => e.target.select());
  $('#counterUrl').addEventListener('focus', (e) => e.target.select());

  $('#importBtn').addEventListener('click', () => {
    const raw = $('#importUrl').value.trim();
    let search = '';
    try { search = new URL(raw).search; } catch { search = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''; }
    if (!search) { toast("That doesn't look like an overlay link."); return; }
    cfg = parse(search);
    save();
    fillForm();
    updateLink();
    reloadPreview();
    toast('Settings loaded from your link ✦');
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Reset every setting to the default? Your channel name is kept.')) return;
    cfg = { ...DEFAULTS, channel: cfg.channel };
    save();
    fillForm();
    updateLink();
    reloadPreview();
    toast('Back to defaults ✦');
  });

  /* ---------------- Preview ---------------- */

  function previewSrc(view) {
    const extra = previewMode === 'sample' ? { test: '1' } : {};
    if (view) extra.view = view;
    return 'overlay.html' + toQuery({ ...cfg, showConnected: previewMode === 'live' && cfg.showConnected }, extra);
  }

  function reloadPreview() {
    frame.src = previewSrc();
    counterFrame.hidden = !cfg.counter;
    counterFrame.src = cfg.counter ? previewSrc('counter') : 'about:blank';
    positionColumn();
    const hint = $('#previewHint');
    if (previewMode === 'live') {
      hint.textContent = cfg.channel
        ? `Showing real chat from twitch.tv/${cfg.channel}. Messages appear as people type.`
        : 'Enter your channel name to see your real chat here.';
    } else {
      hint.textContent = 'Sample messages use Twitch emotes plus emotes from 7TV, BTTV and FFZ.';
    }
  }

  function refreshPreview(key) {
    positionColumn();
    if (RELOAD_KEYS.includes(key)) {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(reloadPreview, key === 'channel' ? 700 : 150);
      return;
    }
    try {
      for (const f of [frame, counterFrame]) {
        f.contentWindow.postMessage({ type: 'hexx-style', cfg: { ...cfg } }, '*');
      }
    } catch {
      reloadPreview();
    }
  }

  function positionColumn() {
    const left = cfg.align === 'right' ? 1920 - cfg.width - 32 : 32;
    for (const el of [frame, $('#colOutline')]) {
      el.style.width = cfg.width + 'px';
      el.style.left = left + 'px';
    }
    // Counter sits in the opposite top corner of the preview.
    counterFrame.style.width = '400px';
    counterFrame.style.left = (cfg.align === 'right' ? 40 : 1920 - 400 - 40) + 'px';
  }

  function scaleStage() {
    const stage = $('#stage');
    $('#stageInner').style.transform = `scale(${stage.clientWidth / 1920})`;
  }

  document.querySelectorAll('[data-preview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      previewMode = btn.dataset.preview;
      document.querySelectorAll('[data-preview]').forEach((b) => b.classList.toggle('on', b === btn));
      reloadPreview();
    });
  });

  /* ---------------- Toast ---------------- */

  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ---------------- Start ---------------- */

  if (location.protocol === 'file:') $('#fileHint').hidden = false;
  fillForm();
  updateLink();
  scaleStage();
  new ResizeObserver(scaleStage).observe($('#stage'));
  reloadPreview();
})();
