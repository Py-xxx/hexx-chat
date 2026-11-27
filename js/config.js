/*
 * Shared settings for the overlay and the settings page.
 * Settings travel in the overlay URL (?channel=...&fontSize=...), and only
 * values that differ from the defaults are written, so the URL stays short.
 */
(function () {
  const DEFAULTS = {
    // Connection
    channel: 'cinnamonhexx', // used whenever the channel box is left empty

    // Layout
    fontSize: 20,          // px
    emoteScale: 1.6,       // emote height relative to the text
    direction: 'up',       // 'up' = newest at the bottom, 'down' = newest at the top
    align: 'left',         // which side the cards hug: 'left' | 'right'
    layout: 'stacked',     // 'stacked' = name above message, 'inline' = name: message
    width: 400,            // OBS browser source width (only used for the preview + instructions)

    // Timing
    lifetime: 45,          // seconds before a message fades (0 = stay forever)
    maxMessages: 10,

    // Look
    cardOpacity: 55,       // % opacity of the card background
    accent: '#ffb347',     // border + glow colour
    nameColors: 'theme',   // 'theme' = matched to the palette, 'twitch' = the user's own colour
    nameFont: 'pixel',     // 'pixel' | 'script' | 'clean'
    textFont: 'clean',     // 'clean' | 'pixel'
    badges: true,
    badgeScale: 1,         // badge size multiplier (handy for custom badge art)
    animations: true,
    sparkles: true,
    edgeFade: true,        // soft fade where messages leave the column

    // Emotes
    emotes7tv: true,
    emotesBttv: true,
    emotesFfz: true,

    // Filtering
    hideBots: true,
    bots: 'nightbot, streamelements, streamlabs, moobot, fossabot, wizebot, soundalerts, sery_bot, kofistreambot',
    hideCommands: true,
    blockedUsers: '',
    blockedWords: '',

    // Highlights
    highlightFirst: true,
    highlightMentions: true,
    showConnected: true,

    // Word counter (shown by its own Browser source: overlay.html?...&view=counter)
    counter: false,
    counterWords: '',      // comma separated: all of these add to one count
    counterLabel: '',      // empty = 'chat said "word"'
  };

  // Colours picked from the CinnamonHexx banner, used for "theme" name colours.
  const THEME_PALETTE = [
    '#ffb347', // amber moon
    '#ff9ecf', // logo pink
    '#c9a2ff', // lavender
    '#ffd36e', // candle gold
    '#ff8a5c', // cinnamon
    '#e59cff', // orchid
    '#ffc4a3', // peach
    '#a9b8ff', // night-sky blue
  ];

  function typeOf(key) {
    return typeof DEFAULTS[key];
  }

  function parse(search) {
    const params = new URLSearchParams(search);
    const cfg = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (!params.has(key)) continue;
      const raw = params.get(key);
      switch (typeOf(key)) {
        case 'boolean': cfg[key] = raw === '1' || raw === 'true'; break;
        case 'number': {
          const n = parseFloat(raw);
          if (!Number.isNaN(n)) cfg[key] = n;
          break;
        }
        default: cfg[key] = raw;
      }
    }
    cfg.channel = String(cfg.channel || '').trim().replace(/^#/, '').toLowerCase() || DEFAULTS.channel;
    return cfg;
  }

  function toQuery(cfg, extra) {
    const params = new URLSearchParams();
    for (const key of Object.keys(DEFAULTS)) {
      const value = cfg[key];
      if (value === undefined || value === DEFAULTS[key]) continue;
      params.set(key, typeOf(key) === 'boolean' ? (value ? '1' : '0') : String(value));
    }
    if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
    const q = params.toString();
    return q ? '?' + q : '';
  }

  function list(str) {
    return String(str || '')
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
  }

  window.HexxConfig = { DEFAULTS, THEME_PALETTE, parse, toQuery, list };
})();
