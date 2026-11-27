# Hexx Chat ✦ Twitch chat overlay for OBS

A cozy, translucent chat column made to match the CinnamonHexx art: pixel-glow
cards, moon/star/crystal badges, sparkles when messages fade, and every emote
(Twitch, 7TV, BetterTTV, FrankerFaceZ, including animated and zero-width ones).

You don't need a login, an API key or a plugin. It's a web page that OBS shows
as a **Browser source**.

---

## 1. Put it online (one time, ~5 minutes)

GitHub Pages hosts it for free.

1. Sign in at [github.com](https://github.com) and click **New repository**.
   Name it e.g. `hexx-chat`, make it **Public**, then click **Create repository**.
2. On the new repo page, click **uploading an existing file**, then drag in
   everything from this folder: `index.html`, `overlay.html` and the `css`,
   `js` and `assets` folders. Click **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose
   **Deploy from a branch**, then select the **main** branch and **/ (root)**. Click **Save**.
4. After a minute or two the page is live at
   `https://YOUR-GITHUB-NAME.github.io/hexx-chat/`

Bookmark that link. It's the settings page.

## 2. Set it up

1. Open the settings page and type the Twitch channel name.
2. Play with the settings. The preview updates as you go. Switch the
   preview to **Live chat** to see the real chat.
3. Click **Copy link**.

Settings are remembered in the browser you used, so next time the page opens
with them already filled in.

## 3. Add it to OBS

1. In OBS, under **Sources**, click **+** → **Browser** and name it `Chat`.
2. Paste the link into **URL**.
3. Set **Width** to `400` (or whatever the settings page shows) and **Height** to `1080`.
4. Click **OK** and drag the column to the side of the scene.

Leave OBS's *Custom CSS* box as it is. The background is already transparent.

**Changed something later?** Copy the new link, then in OBS right-click the
Chat source → **Properties** and paste it over the old URL.
On another computer, paste an old link under **Edit an existing link** to
load its settings.

---

## What the settings do

| Setting | What it does |
| --- | --- |
| Text size / Emote size | How big everything is on stream |
| Fade out after | Seconds before a message sparkles away (`never` keeps them) |
| Max messages | How many messages show at once; the oldest leave first |
| New messages appear | At the bottom (classic) or at the top |
| Card background | How see-through the cards are (0 = text only) |
| Glow colour | Border and glow colour of the cards |
| Name colours | Matched to the theme, or each viewer's own Twitch colour (brightened so it's readable) |
| Badges | Broadcaster = triple moon, Mod = star, VIP = crystal, Subs = a moon that fills up (crescent → full at 12 months) |
| Emotes | Turn 7TV / BTTV / FFZ on or off. Twitch emotes always work |
| Filters | Hide bots, `!commands`, specific users or words |
| Highlights | Pink glow for first-time chatters, brighter glow when someone @mentions the streamer |

Messages deleted by a mod, and messages from users who get banned or timed
out, disappear from the overlay too.

## Good to know

- **New 7TV emotes appear right away.** Emotes added to the channel's 7TV set
  mid-stream work without a refresh. For new BTTV/FFZ emotes, right-click the
  source → **Refresh**.
- **Cheers** show as text (e.g. `Cheer100`). Animated bit icons need a Twitch
  login, so they aren't included.
- **Running without GitHub:** you can also open `index.html` straight from this
  folder. The copied link starts with `file:///` and works in OBS on the same
  computer, as long as the folder isn't moved.
- When OBS loads the overlay, it briefly shows "connected to #channel" so you
  know it works. You can turn that off under *Highlights*.

## Files

```
index.html        settings page with live preview
overlay.html      the overlay OBS shows
css/overlay.css   chat card styles
css/settings.css  settings page styles
js/config.js      default settings + link encoding
js/twitch.js      anonymous Twitch chat connection
js/emotes.js      7TV / BTTV / FFZ emotes (+ 7TV live updates)
js/badges.js      pixel-art badges
js/overlay.js     renders messages, emotes, animations
js/settings.js    settings page logic
assets/banner.webp  preview background
```
