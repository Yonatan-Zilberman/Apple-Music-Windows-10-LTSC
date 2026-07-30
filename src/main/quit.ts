import { app, BrowserWindow } from 'electron';
import { sendPlaybackCommand } from './playback-bridge';
import { destroyMiniPlayer, hideMiniPlayer } from './miniplayer';
import { getMainWindow, setQuitting } from './window';

let quitting = false;

/**
 * Force a clean shutdown even while DRM audio is actively playing.
 * Chromium/Electron can otherwise keep the process alive mid-playback.
 */
export async function quitApp(): Promise<void> {
  if (quitting) return;
  quitting = true;
  setQuitting(true);

  hideMiniPlayer();

  try {
    await sendPlaybackCommand('pause');
  } catch {
    // ignore
  }

  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    try {
      await win.webContents.executeJavaScript(
        `(() => {
          try { window.__amd?.pause?.(); } catch {}
          document.querySelectorAll('audio,video').forEach((el) => {
            try {
              el.pause();
              el.removeAttribute('src');
              el.load?.();
            } catch {}
          });
        })();`,
        true,
      );
    } catch {
      // ignore
    }

    try {
      win.webContents.setAudioMuted(true);
    } catch {
      // ignore
    }

    try {
      win.removeAllListeners('close');
      win.destroy();
    } catch {
      // ignore
    }
  }

  try {
    destroyMiniPlayer();
  } catch {
    // ignore
  }

  for (const open of BrowserWindow.getAllWindows()) {
    try {
      open.destroy();
    } catch {
      // ignore
    }
  }

  app.quit();
  setTimeout(() => {
    app.exit(0);
  }, 250);
}
