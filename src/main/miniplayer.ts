import path from 'node:path';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { IPC } from '../shared/ipc';
import type { PlaybackCommand, PlaybackState } from '../shared/playback';
import { EMPTY_PLAYBACK_STATE } from '../shared/playback';
import {
  getPlaybackState,
  onPlaybackStateChange,
  sendPlaybackCommand,
} from './playback-bridge';
import { showMainWindow } from './window';

let miniWindow: BrowserWindow | null = null;
let unsubscribe: (() => void) | null = null;

function miniPreloadPath(): string {
  return path.join(__dirname, '..', 'miniplayer', 'preload.js');
}

function miniHtmlPath(): string {
  return path.join(__dirname, '..', 'miniplayer', 'index.html');
}

function ensureMiniWindow(): BrowserWindow {
  if (miniWindow && !miniWindow.isDestroyed()) {
    return miniWindow;
  }

  miniWindow = new BrowserWindow({
    width: 340,
    height: 148,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    focusable: true,
    webPreferences: {
      preload: miniPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void miniWindow.loadFile(miniHtmlPath());

  miniWindow.on('blur', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide();
    }
  });

  miniWindow.on('closed', () => {
    miniWindow = null;
  });

  return miniWindow;
}

function pushState(state: PlaybackState): void {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  miniWindow.webContents.send(IPC.MINI_STATE, state);
}

export function initMiniPlayer(): void {
  ipcMain.handle(IPC.MINI_GET_STATE, () => getPlaybackState());

  ipcMain.on(IPC.MINI_COMMAND, (_event, command: PlaybackCommand) => {
    void sendPlaybackCommand(command);
  });

  ipcMain.on(IPC.MINI_OPEN_MAIN, () => {
    hideMiniPlayer();
    showMainWindow();
  });

  unsubscribe = onPlaybackStateChange((state) => {
    pushState(state);
  });
}

export function showMiniPlayer(trayBounds?: Electron.Rectangle): void {
  const win = ensureMiniWindow();
  const state = getPlaybackState() ?? EMPTY_PLAYBACK_STATE;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const work = display.workArea;
  const width = 340;
  const height = 148;
  let x = screen.getCursorScreenPoint().x - Math.floor(width / 2);
  let y = screen.getCursorScreenPoint().y - height - 12;

  if (trayBounds && typeof trayBounds.x === 'number') {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
    y = Math.round(trayBounds.y - height - 8);
    // Taskbar at top: show below tray
    if (y < work.y) {
      y = Math.round(trayBounds.y + trayBounds.height + 8);
    }
  }

  x = Math.min(Math.max(work.x + 8, x), work.x + work.width - width - 8);
  y = Math.min(Math.max(work.y + 8, y), work.y + work.height - height - 8);

  win.setPosition(x, y, false);
  pushState(state);
  win.show();
  win.focus();
}

export function hideMiniPlayer(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.hide();
  }
}

export function toggleMiniPlayer(trayBounds?: Electron.Rectangle): void {
  if (miniWindow && !miniWindow.isDestroyed() && miniWindow.isVisible()) {
    hideMiniPlayer();
    return;
  }
  showMiniPlayer(trayBounds);
}

export function destroyMiniPlayer(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.destroy();
  }
  miniWindow = null;
}
