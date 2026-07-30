import { app, BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow, setQuitting, showMainWindow } from './window';
import { createTray, destroyTray } from './tray';
import {
  bindWindowMediaKeys,
  registerMediaShortcuts,
  unregisterMediaShortcuts,
} from './shortcuts';
import { initTaskbar } from './taskbar';
import { destroyMiniPlayer, initMiniPlayer } from './miniplayer';

const APP_USER_MODEL_ID = 'com.yonatan.apple-music-desktop';

app.setAppUserModelId(APP_USER_MODEL_ID);

// Hardware acceleration, V8 bytecode caching, and network performance flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('v8-cache-options', 'bypassHeatCheck');
app.commandLine.appendSwitch('disk-cache-size', '1073741824');
app.commandLine.appendSwitch('media-cache-size', '524288000');
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '2048');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  void app.whenReady().then(async () => {
    // CastLabs ECS Widevine CDM component loader
    const electronWithComponents = require('electron') as typeof import('electron') & {
      components?: { whenReady: () => Promise<void>; status: () => unknown };
    };
    if (electronWithComponents.components?.whenReady) {
      try {
        await electronWithComponents.components.whenReady();
        console.log('[drm] components ready', electronWithComponents.components.status?.());
      } catch (error) {
        console.error('[drm] components.whenReady failed', error);
      }
    } else {
      console.warn('[drm] CastLabs components API unavailable — playback may fail');
    }

    const win = createMainWindow();
    initMiniPlayer();
    createTray();
    registerMediaShortcuts();
    bindWindowMediaKeys(win);
    initTaskbar(win);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const created = createMainWindow();
        bindWindowMediaKeys(created);
        initTaskbar(created);
      } else {
        showMainWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  setQuitting(true);
});

app.on('will-quit', () => {
  unregisterMediaShortcuts();
  destroyTray();
  destroyMiniPlayer();
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows; do not quit.
  if (process.platform !== 'darwin') {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      // Window closed while quitting
    }
  }
});
