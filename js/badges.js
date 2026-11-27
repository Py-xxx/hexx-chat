/*
 * Custom pixel-art badges drawn as crisp SVG, so they match the banner art
 * and don't need Twitch's authenticated badge API.
 *
 *   broadcaster -> triple moon
 *   moderator   -> four-point sparkle
 *   vip         -> crystal shard
 *   subscriber  -> moon that fills up with sub months (crescent -> full)
 */
(function () {
  const COLORS = {
    a: '#ffb347', // amber
    A: '#d9772b', // deep amber (craters / shading)
    g: '#ffd98a', // pale gold
    w: '#fff4dc', // highlight
    l: '#e3c4ff', // lavender
    k: '#ff9ecf', // pink
    p: '#a66bff', // purple
    P: '#6a34b8', // dark purple
    d: 'rgba(120, 70, 110, 0.55)', // unlit side of the moon
  };

  /** Turn rows of palette letters into an SVG string ('.' = transparent). */
  function sprite(rows, cls) {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    let rects = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        let run = 1;
        while (row[x + run] === c) run++;
        if (c !== '.' && COLORS[c]) {
          rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${COLORS[c]}"/>`;
        }
        x += run;
      }
    });
    return `<svg class="${cls || ''}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  const SPRITES = {
    broadcaster: [
      '.aa...ggg...aa.',
      'aa...ggggg...aa',
      'a...ggAgggg...a',
      'a...gggggAg...a',
      'a...gAggggg...a',
      'aa...ggggg...aa',
      '.aa...ggg...aa.',
    ],
    moderator: [
      '....g....',
      '....a....',
      '...aga...',
      '..aagaa..',
      'gaggwggag',
      '..aagaa..',
      '...aga...',
      '....a....',
      '....g....',
    ],
    vip: [
      '....w....',
      '...lkp...',
      '..llpPp..',
      '..lpPPp..',
      '.llpPPPp.',
      '.lppPPPp.',
      '..lpPPp..',
      '...lpP...',
      '....p....',
    ],
    sparkle: [
      '..a..',
      '..a..',
      'aawaa',
      '..a..',
      '..a..',
    ],
  };

  /**
   * Build a 9x9 moon. `phase` 0..1: 0 = thin crescent, 1 = full moon.
   * The lit part is the main disc minus a second disc slid to the right.
   */
  function moonRows(phase) {
    const size = 9, c = 4, r = 4.6;
    const offset = 1.6 + phase * 7.5; // how far the shadow disc slides away
    const craters = new Set(['3,2', '5,5', '2,5', '6,3']);
    const rows = [];
    for (let y = 0; y < size; y++) {
      let row = '';
      for (let x = 0; x < size; x++) {
        const inDisc = (x - c) ** 2 + (y - c) ** 2 <= r * r;
        if (!inDisc) { row += '.'; continue; }
        const inShadow = (x - c - offset) ** 2 + (y - c) ** 2 <= r * r;
        if (inShadow && phase < 1) { row += 'd'; continue; }
        row += craters.has(`${x},${y}`) && phase >= 0.5 ? 'A' : 'a';
      }
      rows.push(row);
    }
    return rows;
  }

  function subPhase(months) {
    if (months >= 12) return 1;
    if (months >= 6) return 0.62;
    if (months >= 3) return 0.3;
    return 0;
  }

  const cache = {};
  function cached(key, make) {
    return cache[key] || (cache[key] = make());
  }

  function parseTag(tag) {
    const out = {};
    if (!tag) return out;
    for (const part of tag.split(',')) {
      const [name, value] = part.split('/');
      if (name) out[name] = value;
    }
    return out;
  }

  /** Returns badge HTML for a message's `badges` and `badge-info` tags. */
  function render(badgesTag, badgeInfoTag) {
    const badges = parseTag(badgesTag);
    const info = parseTag(badgeInfoTag);
    const out = [];

    if ('broadcaster' in badges) {
      out.push(cached('broadcaster', () => sprite(SPRITES.broadcaster, 'badge badge-wide')));
    }
    if ('moderator' in badges) {
      out.push(cached('moderator', () => sprite(SPRITES.moderator, 'badge')));
    }
    if ('vip' in badges) {
      out.push(cached('vip', () => sprite(SPRITES.vip, 'badge')));
    }
    if ('subscriber' in badges || 'founder' in badges) {
      const months = parseInt(info.subscriber || info.founder || badges.subscriber || '0', 10) || 0;
      const phase = subPhase(months);
      out.push(cached('moon' + phase, () => sprite(moonRows(phase), 'badge')));
    }
    return out.join('');
  }

  window.HexxBadges = {
    render,
    sparkle: () => cached('sparkle', () => sprite(SPRITES.sparkle, 'sparkle-svg')),
    sprite,
    moonRows,
  };
})();
