/* The chat overlay itself: renders messages, emotes, badges and effects. */
(function () {
  const { parse, list, THEME_PALETTE } = window.HexxConfig;
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const COUNTER_VIEW = params.get('view') === 'counter';

  let cfg = parse(location.search);
  const chatEl = document.getElementById('chat');
  const fxEl = document.getElementById('fx');
  const emotes = new EmoteStore(cfg);

  /* ---------------- Colours & settings ---------------- */

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;

  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /** Name colour: palette-matched by default, or the user's Twitch colour made readable. */
  function nameColor(login, twitchColor) {
    if (cfg.nameColors === 'twitch') {
      const rgb = hexToRgb(twitchColor);
      if (rgb) {
        const [h, s, l] = rgbToHsl(rgb);
        return `hsl(${Math.round(h)}, ${Math.round(Math.min(s, 90))}%, ${Math.round(Math.max(l, 66))}%)`;
      }
    }
    return THEME_PALETTE[hash(login || '') % THEME_PALETTE.length];
  }

  function applyStyle() {
    const root = document.documentElement.style;
    const accent = hexToRgb(cfg.accent) || [255, 179, 71];
    const a = Math.max(0, Math.min(100, cfg.cardOpacity)) / 100;
    root.setProperty('--font-size', cfg.fontSize + 'px');
    root.setProperty('--emote-h', `calc(${cfg.fontSize}px * ${cfg.emoteScale})`);
    root.setProperty('--px', Math.max(2, Math.round(cfg.fontSize * 0.13)) + 'px');
    root.setProperty('--badge-scale', cfg.badgeScale);
    root.setProperty('--card-bg', `rgba(24, 8, 40, ${a})`);
    root.setProperty('--card-bg-hi', `rgba(60, 24, 88, ${Math.min(1, a + 0.12)})`);
    root.setProperty('--card-bg-own', `rgba(150, 70, 38, ${Math.min(0.92, a + 0.25)})`);
    root.setProperty('--accent', cfg.accent);
    root.setProperty('--border', rgba(accent, Math.max(0.35, Math.min(0.85, a + 0.3))));
    root.setProperty('--glow', rgba(accent, 0.12 + a * 0.3));
    root.setProperty('--name-font', {
      pixel: "'Pixelify Sans', 'Nunito', sans-serif",
      script: "'Dancing Script', 'Nunito', cursive",
      clean: "'Nunito', 'Segoe UI', sans-serif",
    }[cfg.nameFont] || "'Pixelify Sans', sans-serif");
    root.setProperty('--text-font', cfg.textFont === 'pixel'
      ? "'Pixelify Sans', 'Nunito', sans-serif"
      : "'Nunito', 'Segoe UI', system-ui, sans-serif");

    const b = document.body.classList;
    b.toggle('dir-up', cfg.direction !== 'down');
    b.toggle('dir-down', cfg.direction === 'down');
    b.toggle('align-right', cfg.align === 'right');
    b.toggle('layout-inline', cfg.layout === 'inline');
    b.toggle('hide-badges', !cfg.badges);
    b.toggle('animate', cfg.animations);
    b.toggle('sparkles', cfg.sparkles);
    b.toggle('edge-fade', cfg.edgeFade);
    b.toggle('hl-first', cfg.highlightFirst);
    b.toggle('hl-mention', cfg.highlightMentions);
    b.toggle('view-counter', COUNTER_VIEW);
    b.toggle('hl-returning', cfg.highlightReturning);
    b.toggle('hl-own', cfg.highlightOwn);
    document.body.className = document.body.className.replace(/\bfont-\S+/g, '').trim();
    b.add('font-name-' + cfg.nameFont, 'font-text-' + cfg.textFont);

    for (const el of chatEl.querySelectorAll('.msg[data-login]')) {
      setNameColor(el, el.dataset.login, el.dataset.color);
    }
    if (COUNTER_VIEW) renderCounter(false);
  }

  function setNameColor(el, login, color) {
    const c = nameColor(login, color);
    el.style.setProperty('--name', c);
    el.style.setProperty('--name-glow', c.startsWith('#') ? rgba(hexToRgb(c), 0.55) : c.replace('hsl', 'hsla').replace(')', ', 0.55)'));
  }

  /* ---------------- Message parsing ---------------- */

  const twitchEmoteUrl = (id) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;

  /** Split a message into text and emote parts. Twitch emote positions are in code points. */
  function buildParts(text, emotesTag) {
    const chars = Array.from(text);
    const ranges = [];
    if (emotesTag) {
      for (const group of emotesTag.split('/')) {
        const [id, positions] = group.split(':');
        if (!positions) continue;
        for (const p of positions.split(',')) {
          const [s, e] = p.split('-').map(Number);
          ranges.push({ s, e, id });
        }
      }
      ranges.sort((a, b) => a.s - b.s);
    }

    const raw = [];
    let i = 0;
    for (const r of ranges) {
      if (r.s < i) continue;
      if (r.s > i) raw.push({ type: 'text', text: chars.slice(i, r.s).join('') });
      raw.push({ type: 'emote', name: chars.slice(r.s, r.e + 1).join(''), url: twitchEmoteUrl(r.id) });
      i = r.e + 1;
    }
    if (i < chars.length) raw.push({ type: 'text', text: chars.slice(i).join('') });

    // Third-party emotes are matched word by word in the remaining text.
    const parts = [];
    for (const p of raw) {
      if (p.type !== 'text') { parts.push(p); continue; }
      for (const tok of p.text.split(/(\s+)/)) {
        if (!tok) continue;
        const em = emotes.get(tok);
        if (em) parts.push({ type: 'emote', name: tok, url: em.url, zeroWidth: em.zeroWidth });
        else parts.push({ type: 'text', text: tok });
      }
    }
    return parts;
  }

  const LINK_RE = /^(?:https?:\/\/|www\.)\S+$|^[\w-]+(?:\.[\w-]+)+\/\S*$/i;

  function linkHost(url) {
    try {
      return new URL(/^https?:/i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, '');
    } catch {
      return 'link';
    }
  }

  function renderParts(parts, container) {
    let lastGroup = null;     // the emote a zero-width emote can sit on
    let pendingSpace = null;  // whitespace between that emote and the next part
    let emoteCount = 0, wordCount = 0;

    const img = (p, zw) => {
      const el = document.createElement('img');
      el.src = p.url;
      el.alt = p.name;
      el.title = p.name;
      if (zw) el.className = 'zw';
      // If an emote image is gone, show its name instead of a broken icon.
      el.onerror = () => {
        const group = el.parentNode;
        if (group && group.children.length === 1) group.replaceWith(p.name);
        else el.remove();
      };
      return el;
    };

    for (const p of parts) {
      if (p.type === 'text' && /^\s+$/.test(p.text)) {
        if (lastGroup) { pendingSpace = p.text; continue; }
        container.append(p.text);
        continue;
      }
      if (p.type === 'emote' && p.zeroWidth && lastGroup) {
        lastGroup.append(img(p, true));
        pendingSpace = null;
        continue;
      }
      if (pendingSpace) { container.append(pendingSpace); pendingSpace = null; }

      if (p.type === 'emote') {
        const g = document.createElement('span');
        g.className = 'emote-group';
        g.append(img(p, false));
        container.append(g);
        lastGroup = g;
        emoteCount++;
      } else {
        lastGroup = null;
        wordCount++;
        if (cfg.tidyLinks && LINK_RE.test(p.text)) {
          const link = document.createElement('span');
          link.className = 'link';
          link.textContent = '🔗 ' + linkHost(p.text);
          container.append(link);
        } else if (/^@\w+/.test(p.text)) {
          // Colour @mentions inside messages
          const at = document.createElement('span');
          at.className = 'at';
          at.textContent = p.text;
          container.append(at);
        } else {
          container.append(p.text);
        }
      }
    }
    if (pendingSpace) container.append(pendingSpace);
    return { emoteOnly: emoteCount > 0 && emoteCount <= 3 && wordCount === 0 };
  }

  /* ---------------- Filtering ---------------- */

  function isFiltered(m) {
    const login = (m.login || '').toLowerCase();
    if (cfg.hideBots && list(cfg.bots).includes(login)) return true;
    if (cfg.hideCommands && m.text.trim().startsWith('!')) return true;
    if (list(cfg.blockedUsers).includes(login)) return true;
    const lower = m.text.toLowerCase();
    if (list(cfg.blockedWords).some((w) => lower.includes(w))) return true;
    return false;
  }

  function mentionsStreamer(text) {
    if (!cfg.channel) return false;
    return new RegExp('(^|[^\\w])@?' + cfg.channel + '\\b', 'i').test(text);
  }

  /* ---------------- Cards ---------------- */

  function card(classes) {
    const el = document.createElement('div');
    el.className = 'msg ' + (classes || '');
    const spark = document.createElement('span');
    spark.className = 'spark';
    spark.innerHTML = HexxBadges.sparkle();
    spark.style.animationDelay = (-Math.random() * 2.6).toFixed(2) + 's';
    el.append(spark);
    return el;
  }

  function addChat(m) {
    const maker = magic.isMaker(m.login);
    if (maker && magic.cast(m)) return;
    if (isFiltered(m)) return;
    const entrance = maker && !TEST && isNewThisStream(m.login);
    const returning = TEST ? !!m.sampleReturning : trackReturning(m);

    let text = m.text;
    if (m.replyTo) {
      // Twitch prefixes replies with "@name " — the reply line already says who.
      text = text.replace(new RegExp('^@' + m.replyTo.replace(/\W/g, '\\$&') + '\\s*', 'i'), '');
    }
    // If the reply prefix was removed, emote positions shifted — rebuild them.
    const parts = text === m.text ? buildParts(text, m.emotes) : buildParts(text, shiftEmotes(m, text));

    const combo = cfg.combos ? comboKey(parts) : null;
    if (combo && joinCombo(combo)) return;

    const own = m.login === cfg.channel;
    const classes = [];
    if (m.firstMessage) classes.push('first');
    else if (returning && !own && !maker) classes.push('returning');
    if (m.highlighted) classes.push('highlighted');
    if (m.action) classes.push('action');
    if (own) classes.push('own');
    else if (mentionsStreamer(m.text)) classes.push('mention');

    const el = card(classes.join(' '));
    el.dataset.id = m.id || '';
    el.dataset.user = m.userId || '';
    el.dataset.login = m.login;
    el.dataset.color = m.color || '';
    setNameColor(el, m.login, m.color);

    if (m.replyTo) {
      const reply = document.createElement('div');
      reply.className = 'reply';
      reply.textContent = '↪ replying to ' + m.replyTo;
      el.append(reply);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    const badges = document.createElement('span');
    badges.className = 'badges';
    badges.innerHTML = (maker ? HexxBadges.maker() : '') + HexxBadges.render(m.badges, m.badgeInfo);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = m.displayName;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = m.firstMessage ? 'first chat ✦' : 'welcome back ✦';
    meta.append(badges, name, tag);

    const body = document.createElement('div');
    body.className = 'text';
    const { emoteOnly } = renderParts(parts, body);
    if (emoteOnly) el.classList.add('emote-only');

    el.append(meta, body);
    magic.decorate(el, m, { maker, entrance });
    insert(el);
    magic.afterInsert(el);
    lastSingle = combo ? { key: combo.key, el } : null;
  }

  /* ---------------- Emote combos ---------------- */

  // The newest card holding just one kind of emote, and the combo card if one is going.
  let lastSingle = null;
  let activeCombo = null;

  /** If a message is only one emote (once or repeated), return it; otherwise null. */
  function comboKey(parts) {
    let found = null;
    for (const p of parts) {
      if (p.type === 'text') {
        if (/^\s+$/.test(p.text)) continue;
        return null;
      }
      if (p.zeroWidth) continue;
      if (found && found.key !== p.name) return null;
      found = found || { key: p.name, url: p.url };
    }
    return found;
  }

  function newestCard() {
    const cards = chatEl.querySelectorAll('.msg:not(.leaving)');
    return cards.length ? cards[cfg.direction === 'down' ? 0 : cards.length - 1] : null;
  }

  /** Add to a running combo, or turn the previous same-emote card into one. */
  function joinCombo(combo) {
    const newest = newestCard();
    if (activeCombo && activeCombo.key === combo.key && activeCombo.el === newest) {
      activeCombo.count++;
      updateCombo(true);
      return true;
    }
    if (lastSingle && lastSingle.key === combo.key && lastSingle.el === newest) {
      const el = card('combo');
      el.innerHTML += `<div class="combo-row"><span class="emote-group"><img alt=""></span>` +
        `<span class="combo-x">×</span><span class="combo-num"></span></div><div class="combo-label">combo</div>`;
      const img = el.querySelector('img');
      img.src = combo.url;
      img.alt = combo.key;
      clearTimeout(newest._timer);
      newest.replaceWith(el);
      activeCombo = { key: combo.key, el, count: 2 };
      lastSingle = null;
      updateCombo(false);
      return true;
    }
    return false;
  }

  function updateCombo(bump) {
    const { el, count } = activeCombo;
    const num = el.querySelector('.combo-num');
    num.textContent = count;
    if (bump) {
      restartAnimation(num, 'bump');
      if (cfg.animations && cfg.sparkles) burst(el, { count: 3 });
    }
    // A combo stays on screen while chat keeps it going.
    setLifetime(el, cfg.lifetime);
  }

  function restartAnimation(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---------------- Welcome back ---------------- */

  // Remembers when each viewer last chatted (in OBS's own storage). A stream
  // "session" starts after 6 quiet hours; a viewer seen before this session
  // gets "welcome back" on their first message of it.
  const SESSION_GAP = 6 * 60 * 60 * 1000;
  const seen = { key: 'hexx-seen:' + cfg.channel, users: {}, start: Date.now(), saveTimer: null };

  function loadSeen() {
    try {
      const d = JSON.parse(localStorage.getItem(seen.key) || 'null');
      if (!d) return;
      const now = Date.now();
      const cutoff = now - 120 * 24 * 60 * 60 * 1000; // forget viewers not seen in 4 months
      for (const [login, t] of Object.entries(d.users || {})) if (t > cutoff) seen.users[login] = t;
      seen.start = now - d.lastActivity < SESSION_GAP ? d.start : now;
    } catch { /* storage blocked: nobody is "returning" */ }
  }

  function saveSeen() {
    clearTimeout(seen.saveTimer);
    seen.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(seen.key, JSON.stringify({ users: seen.users, start: seen.start, lastActivity: Date.now() }));
      } catch { /* ignore */ }
    }, 3000);
  }

  function isNewThisStream(login) {
    const last = seen.users[String(login).toLowerCase()];
    return !last || last < seen.start;
  }

  function trackReturning(m) {
    const login = (m.login || '').toLowerCase();
    const last = seen.users[login];
    seen.users[login] = Date.now();
    saveSeen();
    return !!last && last < seen.start;
  }

  /** Recompute Twitch emote ranges after trimming the start of a message. */
  function shiftEmotes(m, newText) {
    if (!m.emotes) return '';
    const cut = Array.from(m.text).length - Array.from(newText).length;
    return m.emotes.split('/').map((group) => {
      const [id, pos] = group.split(':');
      const kept = pos.split(',').map((p) => p.split('-').map(Number))
        .filter(([s]) => s >= cut)
        .map(([s, e]) => `${s - cut}-${e - cut}`);
      return kept.length ? `${id}:${kept.join(',')}` : null;
    }).filter(Boolean).join('/');
  }

  function addSystem(text, lifetime) {
    const el = card('system');
    el.append(text);
    insert(el, lifetime);
    return el;
  }

  function insert(el, lifetimeOverride) {
    if (cfg.direction === 'down') chatEl.prepend(el);
    else chatEl.append(el);

    // Keep at most `maxMessages`; the oldest leave first.
    const live = [...chatEl.querySelectorAll('.msg:not(.leaving)')];
    const extra = live.length - Math.max(1, cfg.maxMessages);
    if (extra > 0) {
      const oldest = cfg.direction === 'down' ? live.slice(-extra) : live.slice(0, extra);
      oldest.forEach((o) => remove(o, 'pushed'));
    }

    setLifetime(el, lifetimeOverride !== undefined ? lifetimeOverride : cfg.lifetime);
  }

  function setLifetime(el, seconds) {
    clearTimeout(el._timer);
    if (seconds > 0) el._timer = setTimeout(() => remove(el, 'expire'), seconds * 1000);
  }

  function remove(el, mode) {
    if (!el || el.classList.contains('leaving')) return;
    el.classList.add('leaving');
    clearTimeout(el._timer);

    if (!cfg.animations) { el.remove(); return; }
    if (cfg.sparkles && mode === 'expire') burst(el);

    if (mode !== 'expire') el.classList.add('fast');
    el.classList.add('fading');
    const fadeMs = mode === 'expire' ? 700 : 300;
    setTimeout(() => {
      el.style.height = el.offsetHeight + 'px';
      void el.offsetHeight; // commit the height so it can animate to 0
      el.classList.add('collapsing');
      setTimeout(() => el.remove(), 380);
    }, fadeMs);
  }

  /** Little sparkles drifting up from a card as it fades away. */
  function burst(el, opts = {}) {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const count = opts.count || Math.min(9, 4 + Math.round(r.width / 90));
    const spread = opts.spread || 1;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'particle' + (opts.cls ? ' ' + opts.cls : '');
      p.innerHTML = opts.html || HexxBadges.sparkle();
      p.style.left = (r.left + Math.random() * r.width) + 'px';
      p.style.top = (r.top + Math.random() * r.height) + 'px';
      p.style.setProperty('--dx', ((Math.random() * 40 - 20) * spread).toFixed(0) + 'px');
      p.style.setProperty('--dy', ((-30 - Math.random() * 50) * spread).toFixed(0) + 'px');
      if (opts.big) p.classList.add('big');
      p.style.setProperty('--rot', (Math.random() * 180 - 90).toFixed(0) + 'deg');
      p.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
      fxEl.append(p);
      setTimeout(() => p.remove(), 1600);
    }
  }

  /* ---------------- Moderation ---------------- */

  function clearChat(userId) {
    const sel = userId ? `.msg[data-user="${CSS.escape(userId)}"]` : '.msg';
    chatEl.querySelectorAll(sel).forEach((el) => remove(el, 'deleted'));
  }
  function clearMessage(id) {
    if (id) remove(chatEl.querySelector(`.msg[data-id="${CSS.escape(id)}"]`), 'deleted');
  }

  /* ---------------- Sample chat (test / preview mode) ---------------- */

  const SAMPLE_USERS = [
    { login: 'moonlitmarrow', badges: 'moderator/1,subscriber/24', info: 'subscriber/26', color: '#8A2BE2' },
    { login: 'potionpixie', badges: 'vip/1,subscriber/6', info: 'subscriber/7', color: '#FF69B4' },
    { login: 'hexedhedgehog', badges: 'subscriber/3', info: 'subscriber/4', color: '#1E90FF' },
    { login: 'd20dreamer', badges: 'subscriber/0', info: 'subscriber/1', color: '#00FF7F' },
    { login: 'cozycauldron', badges: '', info: '', color: '#FF4500' },
    { login: 'starryfern', badges: 'subscriber/12', info: 'subscriber/15', color: '' },
    { login: 'witchyweaver', badges: '', info: '', color: '#DAA520' },
    { login: 'catnap_coven', badges: 'subscriber/6', info: 'subscriber/9', color: '#5F9EA0' },
  ];
  const SAMPLE_TEXT = [
    'hiii {Kappa} the new overlay looks so cozy',
    'that moon art is gorgeous {<3}',
    'rolling for initiative... nat 1 {NotLikeThis}',
    'the cat approves {CoolCat} {ZW}',
    'LET\'S GOOO {HeyGuys}',
    'the kitty is sleeping on the spellbooks again {CoolCat}',
    'tea check! what are we drinking tonight?',
    '{SeemsGood} {SeemsGood} {SeemsGood}',
    'hi @{channel} how was your day?',
    'just got here, what did I miss?',
    'that was such a clutch play {PogChamp}',
    'brewing a potion of +2 vibes {VoHiYo}',
    '{7TV} {7TV}',
    'chat is so wholesome tonight {BTTV}',
    'look what I found https://imgur.com/a/hexx-cat-pics {<3}',
  ];
  const OWN_TEXT = [
    'thank you all for hanging out tonight {<3}',
    'okay chat, one more round and then tea break',
    'welcome in everyone {HeyGuys}',
  ];
  const TWITCH_SAMPLE_EMOTES = {
    Kappa: '25', '<3': '9', HeyGuys: '30259', CoolCat: '58127', SeemsGood: '64138',
    PogChamp: '305954156', VoHiYo: '81274', NotLikeThis: '58765',
  };

  function pickThirdParty(provider) {
    const all = emotes.names(provider).filter((e) => !e.zeroWidth);
    return all.length ? all[Math.floor(Math.random() * all.length)].name : null;
  }

  function pickZeroWidth() {
    const zw = emotes.names().filter((e) => e.zeroWidth && e.provider === '7tv');
    return zw.length ? zw[Math.floor(Math.random() * zw.length)].name : null;
  }

  const COUNTER_SAMPLES = ['{w}', '{w} {w} {w}', 'omg {w}', '{w}!!!', 'chat, {w}'];

  function sampleMessage(n, comboTpl) {
    const own = !comboTpl && n % 11 === 6;
    const u = own
      ? { login: cfg.channel, badges: 'broadcaster/1,subscriber/0', info: 'subscriber/1', color: '' }
      : SAMPLE_USERS[n % SAMPLE_USERS.length];
    let tpl = comboTpl || (own ? OWN_TEXT[n % OWN_TEXT.length] : SAMPLE_TEXT[n % SAMPLE_TEXT.length]);
    const words = list(cfg.counterWords);
    if (!comboTpl && !own && words.length && n % 3 === 1) {
      tpl = COUNTER_SAMPLES[n % COUNTER_SAMPLES.length].replace(/\{w\}/g, words[n % words.length]);
    }
    tpl = tpl.replace('{channel}', cfg.channel || 'cinnamonhexx')
      .replace('{ZW}', () => pickZeroWidth() || '')
      .replace(/\{7TV\}/g, () => pickThirdParty('7tv') || 'nice')
      .replace('{BTTV}', () => pickThirdParty('bttv') || pickThirdParty() || '{HeyGuys}');

    // Turn {Emote} markers into text + a Twitch emote tag with code-point positions.
    let text = '';
    const pos = {};
    for (const piece of tpl.split(/(\{[^}]+\})/)) {
      const name = piece.startsWith('{') ? piece.slice(1, -1) : null;
      if (name && TWITCH_SAMPLE_EMOTES[name]) {
        const start = Array.from(text).length;
        text += name;
        const id = TWITCH_SAMPLE_EMOTES[name];
        (pos[id] = pos[id] || []).push(`${start}-${start + Array.from(name).length - 1}`);
      } else {
        text += name || piece;
      }
    }
    const emotesTag = Object.entries(pos).map(([id, p]) => `${id}:${p.join(',')}`).join('/');

    return {
      id: 'sample-' + n,
      userId: 'u' + u.login,
      login: u.login,
      displayName: u.login === 'd20dreamer' ? 'D20Dreamer' : u.login,
      color: u.color,
      badges: u.badges,
      badgeInfo: u.info,
      emotes: emotesTag,
      text,
      action: false,
      firstMessage: !own && n % 9 === 4,
      sampleReturning: !own && n % 9 === 7,
      highlighted: false,
      replyTo: '',
    };
  }

  function startSamples() {
    let n = 0;
    const handle = COUNTER_VIEW ? countMessage : addChat;
    const prefill = Math.min(4, cfg.maxMessages);
    for (; n < prefill; n++) handle(sampleMessage(n));
    let ticks = 0;
    const tick = () => {
      // Every so often a few viewers spam the same emote, to show off combos.
      if (++ticks % 5 === 0) {
        const emote = pickThirdParty('7tv') || 'SeemsGood';
        const tpl = TWITCH_SAMPLE_EMOTES[emote] ? '{' + emote + '}' : emote;
        const size = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < size; i++) {
          setTimeout(() => handle(sampleMessage(n++, i % 3 === 2 ? tpl + ' ' + tpl : tpl)), i * (350 + Math.random() * 400));
        }
        setTimeout(tick, size * 600 + 2000);
        return;
      }
      handle(sampleMessage(n++));
      setTimeout(tick, 1800 + Math.random() * 2400);
    };
    setTimeout(tick, 1500);
  }

  /* ---------------- Word counter ---------------- */

  // A new stream = nobody said the word for 6 hours. Mods can also type
  // !resetcount or !setcount 42 in chat.
  const COUNTER_IDLE_RESET = 6 * 60 * 60 * 1000;
  const counterEl = document.getElementById('counter');
  const counter = { count: 0, last: 0, re: null, key: '' };

  function counterRegex(words) {
    if (!words.length) return null;
    const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Whole words only: "hexx" counts, "hexxing" doesn't.
    return new RegExp('(?:^|[^\\p{L}\\p{N}_])(?:' + esc.join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'iu');
  }

  function initCounter() {
    const words = list(cfg.counterWords);
    counter.re = counterRegex(words);
    counter.key = 'hexx-counter:' + cfg.channel + ':' + words.join(',');
    if (!TEST) {
      try {
        const saved = JSON.parse(localStorage.getItem(counter.key) || 'null');
        if (saved && Date.now() - saved.last < COUNTER_IDLE_RESET) {
          counter.count = saved.count;
          counter.last = saved.last;
        }
      } catch { /* storage blocked: count from 0 */ }
    }
    const every = Math.floor(cfg.counterMilestone);
    if (TEST && every > 3) counter.count = every - 3;
    counterEl.innerHTML =
      '<div class="counter-card"><span class="spark"></span>' +
      '<div class="counter-label"></div><div class="counter-num"></div></div>';
    counterEl.querySelector('.spark').innerHTML = HexxBadges.sparkle();
    renderCounter(false);
  }

  function renderCounter(bump) {
    if (!counterEl.firstChild) return;
    const words = list(cfg.counterWords);
    const label = cfg.counterLabel.trim() || (words.length ? `chat said "${words[0]}"` : 'pick a word on the settings page');
    if (!counterEl.firstChild.classList.contains('milestone')) {
      counterEl.querySelector('.counter-label').textContent = label;
    }
    const num = counterEl.querySelector('.counter-num');
    num.textContent = words.length ? counter.count.toLocaleString() : '–';
    if (bump) {
      restartAnimation(num, 'bump');
      if (cfg.animations && cfg.sparkles) burst(counterEl.firstChild);
    }
  }

  /** Every `counterMilestone` counts: a big wobble, glow and shower of sparkles. */
  function celebrate() {
    const cardEl = counterEl.firstChild;
    const label = cardEl.querySelector('.counter-label');
    restartAnimation(cardEl, 'milestone');
    label.textContent = '✦ ' + counter.count.toLocaleString() + '! ✦';
    if (cfg.animations && cfg.sparkles) {
      burst(cardEl, { count: 18, spread: 2.2, big: true });
      setTimeout(() => burst(cardEl, { count: 10, spread: 1.6 }), 450);
    }
    clearTimeout(counter.celebrateTimer);
    counter.celebrateTimer = setTimeout(() => {
      cardEl.classList.remove('milestone');
      renderCounter(false);
    }, 3200);
  }

  function setCount(n) {
    counter.count = Math.max(0, n);
    counter.last = Date.now();
    if (!TEST) {
      try { localStorage.setItem(counter.key, JSON.stringify({ count: counter.count, last: counter.last })); } catch { /* ignore */ }
    }
    renderCounter(true);
  }

  function countMessage(m) {
    const login = (m.login || '').toLowerCase();
    if (cfg.hideBots && list(cfg.bots).includes(login)) return;
    if (list(cfg.blockedUsers).includes(login)) return;

    const isMod = /(^|,)(broadcaster|moderator|lead_moderator)\//.test(m.badges || '');
    const cmd = /^!(resetcount|setcount)(?:\s+(\d+))?/i.exec(m.text.trim());
    if (cmd && isMod) {
      setCount(cmd[1].toLowerCase() === 'resetcount' ? 0 : parseInt(cmd[2] || '0', 10));
      return;
    }
    // Each message counts once, so spamming the word in one message doesn't inflate it.
    if (counter.re && counter.re.test(m.text)) {
      setCount(counter.count + 1);
      const every = Math.floor(cfg.counterMilestone);
      if (every > 0 && counter.count % every === 0) celebrate();
    }
  }

  /* ---------------- Start ---------------- */

  const magic = HexxMagic({
    chatEl,
    fxEl,
    backEl: document.getElementById('fxBack'),
    burst,
    announce: (text, seconds) => addSystem(text, seconds),
  });

  applyStyle();

  // The settings page can restyle the preview live without reloading it.
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'hexx-style') {
      cfg = { ...cfg, ...ev.data.cfg };
      applyStyle();
    }
  });

  if (COUNTER_VIEW) initCounter();
  else {
    emotes.loadGlobal();
    if (!TEST) loadSeen();
  }

  if (cfg.channel) {
    const chat = new TwitchChat(cfg.channel, {
      message: (m) => {
        if (TEST) return;
        if (COUNTER_VIEW) countMessage(m);
        else addChat(m);
      },
      clearChat: (id) => { if (!TEST && !COUNTER_VIEW) clearChat(id); },
      clearMessage: (id) => { if (!TEST && !COUNTER_VIEW) clearMessage(id); },
      roomState: (roomId) => { if (!COUNTER_VIEW) emotes.loadChannel(roomId); },
      status: (state, detail) => {
        console.info('[chat]', state, detail || '');
        if (state === 'connected' && !TEST && !COUNTER_VIEW && cfg.showConnected && !chat.announced) {
          chat.announced = true;
          addSystem('✦ connected to #' + cfg.channel + ' ✦', 6);
        }
        if (state === 'error') addSystem('⚠ ' + detail, 0);
      },
    });
    chat.connect();
  } else if (!TEST && !COUNTER_VIEW) {
    addSystem('✦ Add your Twitch channel on the settings page ✦', 0);
  }

  if (TEST) startSamples();
})();
