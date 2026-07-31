# Apple Music Desktop

Personal-use Windows desktop shell for [Apple Music Web](https://music.apple.com), built for **Windows 10 LTSC** (where the Microsoft Store Apple Music app is unavailable).

Uses [CastLabs Electron](https://github.com/castlabs/electron-releases) (`wvcus`) for **Widevine DRM**, loads the official web player, and bridges MusicKit to native Windows features.

## Features

- **Mini player** — left-click the tray icon for a compact popup with album art, track info, and play/pause/next/previous controls, plus an "Open Apple Music" shortcut to the full app.
- **System tray** — right-click for Open Apple Music / Quit. The app keeps playing in the tray when the window is closed.
- **Media keys** — hardware media keys plus global **F6** (previous), **F7** (play/pause), **F8** (next), working even when the app is unfocused.
- **Taskbar controls** — previous / play-pause / next thumbnail buttons on the taskbar preview; window title shows the current track.
- **Windows media flyout** — track metadata and artwork via the MediaSession API.
- **Session persistence** — stays signed in between launches; window size and position are remembered.

## Requirements

- Windows 10 x64 (LTSC supported)
- [Node.js](https://nodejs.org/) 20+
- Python 3.7+ (Windows launcher `py` is fine)
- Git
- Active Apple Music subscription

## Setup

```powershell
cd "C:\Users\Yonatan Zilberman\Documents\Apple Music"
npm install
py -3 -m ensurepip
py -3 -m pip install castlabs-evs
```

### Widevine / EVS (required for playback on Windows)

Apple Music will often fail after login without **production VMP signing**.

There is **no** `login` command in current `castlabs-evs`. Use:

```powershell
# First time — create a free EVS account (check your email for a code)
py -3 -m castlabs_evs.account signup

# Later / new machine — use an existing account
py -3 -m castlabs_evs.account reauth
```

Docs: [CastLabs EVS wiki](https://github.com/castlabs/electron-releases/wiki/EVS)

Then sign binaries:

```powershell
# Dev Electron
npm run sign:vmp

# Installed app (after Setup.exe install)
npm run sign:vmp -- "$env:LOCALAPPDATA\Programs\Apple Music Desktop"
```

Start the app:

```powershell
npm run dev
```

Or use the installed Start Menu shortcut. Sign in to Apple Music inside the window and play a track.

## Troubleshooting

**"Something went wrong" when playing a song** — the binary is missing a valid VMP signature:

```powershell
py -3 -m castlabs_evs.account reauth
npm run sign:vmp -- "$env:LOCALAPPDATA\Programs\Apple Music Desktop"
```

Fully quit the app (tray → right-click → Quit), reopen, try again.

**Signed out unexpectedly / corrupted session** — only then clear `%APPDATA%\apple-music-desktop`.

**Stale taskbar icon after reinstalling** — Windows caches icons; unpin the old shortcut, then restart Explorer (`taskkill /f /im explorer.exe; start explorer`).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile main / preload / mini player / inject |
| `npm run dev` | Build and launch Electron |
| `npm run sign:vmp` | VMP-sign `node_modules/electron/dist` (or pass a path) |
| `npm run pack` | Unpackaged build under `release/` |
| `npm run dist` | NSIS installer under `release/` |

Packaged builds run VMP signing in the `afterSign` hook when EVS credentials are cached (`reauth` / `signup` done once).

## Architecture

- **Main process** (`src/main/`) — window, tray, mini player, global shortcuts, taskbar buttons, clean-quit handling, IPC
- **Preload** (`src/preload/`) — exposes `window.amd.sendPlaybackUpdate` to the Apple Music page
- **Inject** (`src/inject/`) — hooks `MusicKit.getInstance()` on the page, publishes playback state only when it changes, and exposes `window.__amd` controls
- **Mini player** (`src/miniplayer/`) — frameless popup window with its own preload and HTML UI

Session cookies persist via Electron partition `persist:apple-music`.

## Notes

- This is an unofficial personal wrapper, not an Apple product.
- Do not redistribute as an official Apple Music client.
- CastLabs Electron pin: `v42.5.2+wvcus` (bump only after re-testing DRM).
