/*
 * Third-party emotes: 7TV, BetterTTV and FrankerFaceZ.
 * All three have public APIs that need no key. Twitch's own emotes come
 * inside each chat message, so they're handled in overlay.js.
 *
 * When names collide, 7TV wins over BTTV, which wins over FFZ, and channel
 * emotes win over global ones.
 */
(function () {
  // BTTV zero-width emotes (hats, masks...) that sit on top of the previous emote.
  const BTTV_ZERO_WIDTH = new Set([
    'SoSnowy', 'IceCold', 'SantaHat', 'TopHat', 'ReinDeer', 'CandyCane', 'cvMask', 'cvHazmat',
  ]);

  const LAYER_ORDER = ['ffz:global', 'bttv:global', '7tv:global', 'ffz:channel', 'bttv:channel', '7tv:channel'];

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status + ' ' + url);
    return res.json();
  }

  function sevenTvEmote(e) {
    const host = (e.data && e.data.host && e.data.host.url) || '//cdn.7tv.app/emote/' + e.id;
    const zw = (e.flags & 1) === 1 || ((e.data && e.data.flags) & 256) === 256;
    return { name: e.name, url: 'https:' + host + '/2x.webp', zeroWidth: zw, provider: '7tv' };
  }

  function bttvEmote(e) {
    return {
      name: e.code,
      url: 'https://cdn.betterttv.net/emote/' + e.id + '/2x.webp',
      zeroWidth: BTTV_ZERO_WIDTH.has(e.code),
      provider: 'bttv',
    };
  }

  function ffzEmotes(set) {
    return (set && set.emoticons ? set.emoticons : [])
      .filter((e) => !e.hidden)
      .map((e) => {
        const anim = e.animated || null;
        const urls = e.urls || {};
        return {
          name: e.name,
          url: (anim && (anim['2'] || anim['1'])) || urls['2'] || urls['1'],
          zeroWidth: !!e.modifier,
          provider: 'ffz',
        };
      });
  }

  class EmoteStore {
    constructor(cfg) {
      this.cfg = cfg;
      this.layers = {};
      this.map = new Map();
      this.sevenTv = { ws: null, setId: null, userId: null, retry: 0 };
      this.onChange = null;
    }

    get(word) {
      return this.map.get(word);
    }

    names(provider) {
      return [...this.map.values()].filter((e) => !provider || e.provider === provider);
    }

    setLayer(key, emotes) {
      this.layers[key] = emotes;
      this.rebuild();
    }

    rebuild() {
      const map = new Map();
      for (const key of LAYER_ORDER) {
        for (const e of this.layers[key] || []) if (e.url) map.set(e.name, e);
      }
      this.map = map;
      this.onChange && this.onChange();
    }

    async safe(label, fn) {
      try {
        await fn();
      } catch (err) {
        // A channel without 7TV/BTTV/FFZ simply returns 404 — that's normal.
        console.info('[emotes] ' + label + ' unavailable:', err.message);
      }
    }

    loadGlobal() {
      const c = this.cfg;
      const jobs = [];
      if (c.emotes7tv) jobs.push(this.safe('7TV global', async () => {
        const d = await getJSON('https://7tv.io/v3/emote-sets/global');
        this.setLayer('7tv:global', (d.emotes || []).map(sevenTvEmote));
      }));
      if (c.emotesBttv) jobs.push(this.safe('BTTV global', async () => {
        const d = await getJSON('https://api.betterttv.net/3/cached/emotes/global');
        this.setLayer('bttv:global', d.map(bttvEmote));
      }));
      if (c.emotesFfz) jobs.push(this.safe('FFZ global', async () => {
        const d = await getJSON('https://api.frankerfacez.com/v1/set/global');
        const sets = (d.default_sets || []).flatMap((id) => ffzEmotes(d.sets[id]));
        this.setLayer('ffz:global', sets);
      }));
      return Promise.all(jobs);
    }

    loadChannel(roomId) {
      if (this.roomId === roomId) return Promise.resolve();
      this.roomId = roomId;
      const c = this.cfg;
      const jobs = [];
      if (c.emotes7tv) jobs.push(this.safe('7TV channel', () => this.load7tvChannel(roomId)));
      if (c.emotesBttv) jobs.push(this.safe('BTTV channel', async () => {
        const d = await getJSON('https://api.betterttv.net/3/cached/users/twitch/' + roomId);
        this.setLayer('bttv:channel', [...(d.channelEmotes || []), ...(d.sharedEmotes || [])].map(bttvEmote));
      }));
      if (c.emotesFfz) jobs.push(this.safe('FFZ channel', async () => {
        const d = await getJSON('https://api.frankerfacez.com/v1/room/id/' + roomId);
        this.setLayer('ffz:channel', ffzEmotes(d.sets[d.room.set]));
      }));
      return Promise.all(jobs);
    }

    async load7tvChannel(roomId) {
      const d = await getJSON('https://7tv.io/v3/users/twitch/' + roomId);
      const set = d.emote_set || {};
      this.setLayer('7tv:channel', (set.emotes || []).map(sevenTvEmote));
      this.sevenTv.setId = set.id;
      this.sevenTv.userId = d.user && d.user.id;
      this.listen7tv();
    }

    /* ---- 7TV live updates: emotes added/removed mid-stream show up instantly ---- */

    listen7tv() {
      const st = this.sevenTv;
      if (!st.setId) return;
      if (st.ws) {
        st.ws.onclose = null;
        st.ws.close();
      }
      const ws = new WebSocket('wss://events.7tv.io/v3');
      st.ws = ws;
      ws.onopen = () => {
        st.retry = 0;
        ws.send(JSON.stringify({ op: 35, d: { type: 'emote_set.update', condition: { object_id: st.setId } } }));
        if (st.userId) {
          ws.send(JSON.stringify({ op: 35, d: { type: 'user.update', condition: { object_id: st.userId } } }));
        }
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.op !== 0 || !msg.d) return;
        if (msg.d.type === 'emote_set.update') this.apply7tvChange(msg.d.body || {});
        if (msg.d.type === 'user.update') {
          // She may have switched to a different emote set: reload it.
          const roomId = this.roomId;
          this.safe('7TV channel', () => this.load7tvChannel(roomId));
        }
      };
      ws.onclose = () => {
        const delay = Math.min(60000, 2000 * 2 ** st.retry++);
        setTimeout(() => st.ws === ws && this.listen7tv(), delay);
      };
    }

    apply7tvChange(body) {
      let list = [...(this.layers['7tv:channel'] || [])];
      for (const p of body.pulled || []) {
        if (p.key === 'emotes' && p.old_value) list = list.filter((e) => e.name !== p.old_value.name);
      }
      for (const u of body.updated || []) {
        if (u.key !== 'emotes') continue;
        if (u.old_value) list = list.filter((e) => e.name !== u.old_value.name);
        if (u.value) list.push(sevenTvEmote(u.value));
      }
      for (const p of body.pushed || []) {
        if (p.key === 'emotes' && p.value) list.push(sevenTvEmote(p.value));
      }
      this.setLayer('7tv:channel', list);
    }
  }

  window.EmoteStore = EmoteStore;
})();
