# Maatram Hard Lock — Chrome extension

The Chrome extension for [Maatram](https://maatram.co.in), the free focus and screen-time platform built by students at SSVM School of Excellence.

**Chrome Web Store:** https://chromewebstore.google.com/detail/maatram-hard-lock/igcfbmdadjlibodcpaibklgeijdacmen

**Blog:** [How to Stop Scrolling Reels: 5 Friction Tricks for Students](https://maatram.co.in/blog-stop-scrolling-reels.html)

## What it does

- **Hard Lock** — start a focus window from the toolbar popup or from [maatram.co.in/app-gate.html](https://maatram.co.in/app-gate.html). Until it ends, Instagram, YouTube, TikTok, Snapchat, X and Facebook open the Maatram lock screen instead.
- **Your sites** — add any other site (games, streaming, anything) in the popup or on App Gate. It is blocked for the whole lock as well. The list can't be changed while a lock is running.
- **Screen time** — counts minutes on the six built-in sites for the Maatram Stats page.

## Permissions

| Permission | Why |
|---|---|
| `declarativeNetRequest` | Redirects / blocks sites while a lock is running |
| `storage` | Saves the lock end time, your sites and daily minutes on this computer |
| `alarms` | Ends the lock on time |
| `idle` | Only counts screen time while you're actually at the computer |
| Host access to the six built-in sites | Needed to show the Maatram lock screen on them |

"Your sites": when you add one (or start a lock from the popup), Chrome asks for access to just that site. Allow it and the site gets the Maatram lock screen with the timer; deny it and the site still gets blocked, with Chrome's plain "blocked" page. This is an optional permission (`optional_host_permissions`), asked one site at a time. Nothing is sent anywhere: data stays in `chrome.storage.local` and is only given to maatram.co.in when the Stats page asks.

## Install from source

1. Download this repository (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

## Licence

MIT — see [LICENSE](LICENSE). Source for the website lives in [MaatramReelsBlocking/maatram](https://github.com/MaatramReelsBlocking/maatram).
