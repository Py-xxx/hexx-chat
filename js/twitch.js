/*
 * Read-only Twitch chat over WebSocket IRC.
 * Uses an anonymous "justinfan" login, so no account or API key is needed.
 */
(function () {
  const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

  function unescapeTag(v) {
    return v.replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[c] ?? c));
  }

  function parseLine(line) {
    let rest = line;
    const tags = {};
    let prefix = '';

    if (rest[0] === '@') {
      const sp = rest.indexOf(' ');
      for (const kv of rest.slice(1, sp).split(';')) {
        const eq = kv.indexOf('=');
        if (eq < 0) tags[kv] = '';
        else tags[kv.slice(0, eq)] = unescapeTag(kv.slice(eq + 1));
      }
      rest = rest.slice(sp + 1);
    }
    if (rest[0] === ':') {
      const sp = rest.indexOf(' ');
      prefix = rest.slice(1, sp);
      rest = rest.slice(sp + 1);
    }
    let trailing = null;
    const ti = rest.indexOf(' :');
    if (ti >= 0) {
      trailing = rest.slice(ti + 2);
      rest = rest.slice(0, ti);
    }
    const params = rest.split(' ').filter(Boolean);
    const command = params.shift();
    return { tags, prefix, command, params, trailing };
  }

  class TwitchChat {
    /**
     * handlers: {
     *   message(msg), clearChat(userId|null), clearMessage(msgId),
     *   roomState(roomId), status(state, detail)
     * }
     */
    constructor(channel, handlers) {
      this.channel = channel;
      this.h = handlers;
      this.ws = null;
      this.retry = 0;
      this.stopped = false;
      this.lastData = Date.now();
      this.watchdog = setInterval(() => this.checkAlive(), 30000);
    }

    connect() {
      this.status('connecting');
      const ws = new WebSocket(IRC_URL);
      this.ws = ws;

      ws.onopen = () => {
        const nick = 'justinfan' + Math.floor(10000 + Math.random() * 80000);
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send('PASS SCHMOOPIIE');
        ws.send('NICK ' + nick);
        ws.send('JOIN #' + this.channel);
      };

      ws.onmessage = (ev) => {
        this.lastData = Date.now();
        for (const line of String(ev.data).split('\r\n')) {
          if (line) this.handle(parseLine(line));
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws || this.stopped) return;
        const delay = Math.min(30000, 1000 * 2 ** this.retry++);
        this.status('reconnecting', delay);
        setTimeout(() => !this.stopped && this.connect(), delay);
      };

      ws.onerror = () => ws.close();
    }

    handle(m) {
      switch (m.command) {
        case 'PING':
          this.ws.send('PONG :' + (m.trailing || 'tmi.twitch.tv'));
          break;
        case 'RECONNECT':
          this.ws.close();
          break;
        case 'ROOMSTATE':
          if (m.tags['room-id']) {
            this.retry = 0;
            this.h.roomState && this.h.roomState(m.tags['room-id']);
            this.status('connected');
          }
          break;
        case 'NOTICE':
          if (/suspended|does not exist|banned/i.test(m.trailing || '')) {
            this.status('error', m.trailing);
          }
          break;
        case 'CLEARCHAT':
          this.h.clearChat && this.h.clearChat(m.trailing ? m.tags['target-user-id'] : null);
          break;
        case 'CLEARMSG':
          this.h.clearMessage && this.h.clearMessage(m.tags['target-msg-id']);
          break;
        case 'PRIVMSG':
          this.h.message && this.h.message(this.toMessage(m));
          break;
      }
    }

    toMessage(m) {
      const t = m.tags;
      let text = m.trailing || '';
      let action = false;
      const act = /^\u0001ACTION (.*)\u0001$/.exec(text);
      if (act) {
        text = act[1];
        action = true;
      }
      const login = m.prefix.split('!')[0];
      return {
        id: t.id,
        userId: t['user-id'],
        login,
        displayName: t['display-name'] || login,
        color: t.color || '',
        badges: t.badges || '',
        badgeInfo: t['badge-info'] || '',
        emotes: t.emotes || '',
        text,
        action,
        firstMessage: t['first-msg'] === '1',
        highlighted: t['msg-id'] === 'highlighted-message',
        replyTo: t['reply-parent-display-name'] || '',
      };
    }

    checkAlive() {
      // Twitch pings every ~5 minutes; if nothing arrives for 7, the socket is stale.
      if (this.ws && Date.now() - this.lastData > 7 * 60 * 1000) {
        this.lastData = Date.now();
        this.ws.close();
      }
    }

    status(state, detail) {
      this.h.status && this.h.status(state, detail);
    }
  }

  window.TwitchChat = TwitchChat;
})();
