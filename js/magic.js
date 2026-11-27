/* ✦ a little magic ✦ */
(function () {
  // Fingerprint of the one name allowed to use any of this.
  const KEY = [1630374092, 278805928];

  function fnv(str, seed) {
    let h = seed;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  const LEGENDARY_CHANCE = 1 / 25;
  const SPELL_COOLDOWN = 12000;

  const FORTUNES = [
    'a warm drink is in your future',
    'the next roll will go your way',
    'someone in chat is smiling because of you',
    'a cozy night is written in the stars',
    'the cat has blessed this stream',
    'good snacks are on their way to you',
    'your next idea will be a great one',
    'the moon is proud of you tonight',
    'a lucky crit awaits',
    'you will find exactly what you lost',
    'a new friend is closer than you think',
    'tonight, the potions brew themselves',
    'rest well, tomorrow sparkles',
    'the spellbook opens to the right page',
    'your vibes are immaculate',
    'something small will make you laugh today',
  ];

  const D20_SVG =
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<polygon points="50,4 91,27 91,73 50,96 9,73 9,27" fill="#5b2a99" stroke="#1a0826" stroke-width="5" stroke-linejoin="round"/>' +
    '<g stroke="#e3c4ff" stroke-width="2.5" opacity="0.75">' +
    '<line x1="50" y1="24" x2="50" y2="4"/><line x1="50" y1="24" x2="9" y2="27"/><line x1="50" y1="24" x2="91" y2="27"/>' +
    '<line x1="78" y1="70" x2="91" y2="27"/><line x1="78" y1="70" x2="91" y2="73"/><line x1="78" y1="70" x2="50" y2="96"/>' +
    '<line x1="22" y1="70" x2="9" y2="27"/><line x1="22" y1="70" x2="9" y2="73"/><line x1="22" y1="70" x2="50" y2="96"/>' +
    '</g>' +
    '<polygon points="50,24 78,70 22,70" fill="#a66bff" stroke="#e3c4ff" stroke-width="2.5" stroke-linejoin="round"/>' +
    '</svg>';

  const CIRCLE_SVG =
    '<svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="#d9b8ff" stroke-width="2.2">' +
    '<circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="84" stroke-dasharray="3 7"/>' +
    '<circle cx="100" cy="100" r="62"/>' +
    '<polygon points="100,22 168,139 32,139"/><polygon points="100,178 32,61 168,61"/>' +
    '<circle cx="100" cy="100" r="16"/></g></svg>';

  /**
   * ctx: { chatEl, fxEl, backEl, burst(el, opts), announce(text, seconds) }
   */
  window.HexxMagic = function (ctx) {
    const { chatEl, fxEl, backEl, burst } = ctx;
    const cooldowns = {};
    let summon = null;
    let levitateTimer = null;

    const isMaker = (login) => {
      const l = String(login || '').toLowerCase();
      return fnv(l, 2166136261) === KEY[0] && fnv(l, 374761393) === KEY[1];
    };

    const liveCards = () => [...chatEl.querySelectorAll('.msg:not(.leaving)')];
    const later = (ms, fn) => setTimeout(fn, ms);

    function el(cls, html) {
      const d = document.createElement('div');
      d.className = cls;
      if (html) d.innerHTML = html;
      return d;
    }

    /* ---------------- Shooting stars ---------------- */

    function shootingStar(x, y, opts = {}) {
      const s = el('shooting-star' + (opts.big ? ' big' : ''));
      const dist = innerHeight * 1.5;
      const dx = opts.dx ?? -0.45;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--tx', (dx * dist).toFixed(0) + 'px');
      s.style.setProperty('--ty', dist.toFixed(0) + 'px');
      s.style.setProperty('--rot', (Math.atan2(1, dx) * 180 / Math.PI).toFixed(1) + 'deg');
      s.style.setProperty('--dur', (opts.dur || 1.1 + Math.random() * 0.7).toFixed(2) + 's');
      fxEl.append(s);
      later(3500, () => s.remove());
    }

    /* ---------------- Spells ---------------- */

    function moonrise() {
      const moon = el('spell-moon', '<img src="assets/badges/sub-12.png" alt="">');
      moon.querySelector('img').onerror = function () { this.remove(); };
      backEl.append(moon);
      later(4200, () => burst(moon, { count: 10, spread: 1.6 }));
      later(9000, () => moon.remove());
    }

    function starfall() {
      const W = innerWidth;
      for (let i = 0; i < 24; i++) {
        later(Math.random() * 3500, () => shootingStar(W * (0.15 + Math.random() * 1.1), -60 - Math.random() * 120));
      }
      for (let i = 0; i < 30; i++) {
        later(Math.random() * 4000, () => {
          const p = el('particle falling', HexxBadges.sparkle());
          p.style.left = Math.random() * W + 'px';
          p.style.top = '-20px';
          p.style.setProperty('--dx', (Math.random() * 60 - 30).toFixed(0) + 'px');
          p.style.setProperty('--dy', (innerHeight * (0.6 + Math.random() * 0.5)).toFixed(0) + 'px');
          p.style.setProperty('--rot', (Math.random() * 360).toFixed(0) + 'deg');
          fxEl.append(p);
          later(3600, () => p.remove());
        });
      }
    }

    function hexx() {
      const cards = liveCards();
      cards.forEach((c, i) => {
        c.style.setProperty('--hex-delay', (i * -0.07).toFixed(2) + 's');
        c.classList.add('hexed');
        later(i * 70, () => burst(c, { count: 4, html: HexxBadges.skull() }));
      });
      later(2700, () => cards.forEach((c) => c.classList.remove('hexed')));
    }

    function d20() {
      const roll = 1 + Math.floor(Math.random() * 20);
      const die = el('spell-d20', D20_SVG + '<span class="d20-num">?</span><span class="d20-label"></span>');
      const num = die.querySelector('.d20-num');
      const label = die.querySelector('.d20-label');
      fxEl.append(die);
      const spin = setInterval(() => { num.textContent = 1 + Math.floor(Math.random() * 20); }, 85);
      later(1650, () => {
        clearInterval(spin);
        num.textContent = roll;
        die.classList.add('landed');
        if (roll === 20) {
          die.classList.add('nat20');
          label.textContent = '✦ NAT 20! ✦';
          burst(die, { count: 22, spread: 2.4, big: true });
          later(400, () => burst(die, { count: 12, spread: 1.8 }));
        } else if (roll === 1) {
          die.classList.add('nat1');
          label.textContent = 'nat 1…';
          burst(die, { count: 10, spread: 0.9, html: '<span class="puff"></span>', cls: 'smoke' });
        } else {
          burst(die, { count: 6 });
        }
      });
      later(5600, () => die.classList.add('gone'));
      later(6500, () => die.remove());
    }

    function levitate() {
      chatEl.querySelectorAll('.msg').forEach((c) => {
        c.style.setProperty('--lev-delay', (-Math.random() * 2.6).toFixed(2) + 's');
      });
      document.body.classList.add('levitating');
      clearTimeout(levitateTimer);
      levitateTimer = later(8000, () => document.body.classList.remove('levitating'));
    }

    function fortune() {
      const text = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      const moon = HexxBadges.sprite(HexxBadges.moonRows(1), 'tarot-moon');
      const card = el('spell-tarot',
        `<div class="tarot-inner"><div class="tarot-top">${moon}</div>` +
        `<div class="tarot-title">✦ your fortune ✦</div><div class="tarot-text"></div>` +
        `<div class="tarot-foot">☾ ✦ ☽</div></div>`);
      card.querySelector('.tarot-text').textContent = text;
      fxEl.append(card);
      later(700, () => burst(card, { count: 10, spread: 1.4 }));
      later(8200, () => card.classList.add('gone'));
      later(9000, () => card.remove());
    }

    function blessing() {
      const cards = liveCards().filter((c) => c.querySelector('.name'));
      cards.forEach((c, i) => {
        c.classList.add('blessed');
        later(i * 90, () => burst(c.querySelector('.name'), { count: 3 }));
      });
      later(6000, () => cards.forEach((c) => c.classList.remove('blessed')));
    }

    function summonSpell(name) {
      if (!name) return;
      summon = { login: name.toLowerCase(), until: Date.now() + 3 * 60 * 1000 };
      ctx.announce('✦ a circle awaits @' + name + '… ✦', 10);
    }

    const SPELLS = { moonrise, starfall, hexx, d20, levitate, fortune, blessing, summon: summonSpell };

    /** Returns true if the message was a spell (it is then not shown in chat). */
    function cast(m) {
      const match = /^!(\w+)(?:\s+@?(\w+))?/.exec(m.text.trim());
      if (!match) return false;
      const name = match[1].toLowerCase();
      const spell = SPELLS[name];
      if (!spell) return false;
      const now = Date.now();
      if (now < (cooldowns[name] || 0)) return true; // still recharging
      cooldowns[name] = now + SPELL_COOLDOWN;
      spell(match[2]);
      return true;
    }

    /* ---------------- Card decorations ---------------- */

    function takeSummon(login) {
      if (summon && summon.login === String(login).toLowerCase() && Date.now() < summon.until) {
        summon = null;
        return true;
      }
      return false;
    }

    /**
     * Before a card is shown: style it. `maker` = card from the one true name,
     * `entrance` = their first message this stream.
     */
    function decorate(card, m, { maker, entrance }) {
      const tag = card.querySelector('.tag');
      if (maker && entrance) {
        card.classList.add('entrance');
        tag.textContent = '✦ a nova has arrived ✦';
      }
      if (maker && Math.random() < LEGENDARY_CHANCE) {
        card.classList.add('legendary');
        if (!entrance) tag.textContent = '✦ legendary ✦';
      }
      if (takeSummon(m.login)) {
        card.classList.add('summoned');
        card.prepend(el('magic-circle', CIRCLE_SVG));
      }
    }

    /** After a card is on screen: effects that need its position. */
    function afterInsert(card) {
      if (card.classList.contains('entrance')) {
        shootingStar(innerWidth + 40, Math.max(-80, card.getBoundingClientRect().top - innerWidth * 0.9),
          { big: true, dx: -1.1, dur: 1.4 });
        later(500, () => burst(card, { count: 16, spread: 1.8, big: true }));
      }
      if (card.classList.contains('legendary')) {
        later(200, () => burst(card, { count: 12, spread: 1.5 }));
      }
      if (card.classList.contains('summoned')) {
        later(300, () => burst(card, { count: 10, spread: 1.4 }));
        later(6000, () => {
          const c = card.querySelector('.magic-circle');
          if (c) { c.classList.add('gone'); later(800, () => c.remove()); }
        });
      }
    }

    return { isMaker, cast, decorate, afterInsert };
  };
})();
