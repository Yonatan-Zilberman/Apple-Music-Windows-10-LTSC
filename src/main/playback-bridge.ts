import { BrowserWindow, ipcMain } from 'electron';
import { IPC } from '../shared/ipc';
import {
  EMPTY_PLAYBACK_STATE,
  type PlaybackCommand,
  type PlaybackState,
} from '../shared/playback';

type StateListener = (state: PlaybackState) => void;

let mainWindow: BrowserWindow | null = null;
let state: PlaybackState = { ...EMPTY_PLAYBACK_STATE };
const listeners = new Set<StateListener>();

const COMMAND_JS: Record<PlaybackCommand, string> = {
  play: 'window.__amd?.play?.()',
  pause: 'window.__amd?.pause?.()',
  playPause: 'window.__amd?.playPause?.()',
  next: 'window.__amd?.next?.()',
  previous: 'window.__amd?.previous?.()',
};

export function initPlaybackBridge(win: BrowserWindow): void {
  mainWindow = win;

  ipcMain.removeAllListeners(IPC.PLAYBACK_UPDATE);
  ipcMain.on(IPC.PLAYBACK_UPDATE, (_event, next: PlaybackState) => {
    if (!next || typeof next !== 'object') return;
    state = {
      title: String(next.title ?? ''),
      artist: String(next.artist ?? ''),
      album: String(next.album ?? ''),
      artworkUrl: next.artworkUrl ? String(next.artworkUrl) : null,
      isPlaying: Boolean(next.isPlaying),
      positionSec: Number(next.positionSec) || 0,
      durationSec: Number(next.durationSec) || 0,
    };
    for (const listener of listeners) {
      listener(state);
    }
  });
}

export function onPlaybackStateChange(listener: StateListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlaybackState(): PlaybackState {
  return state;
}

export async function sendPlaybackCommand(command: PlaybackCommand): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const js = COMMAND_JS[command];
  if (!js) return;
  try {
    await mainWindow.webContents.executeJavaScript(js, true);
  } catch (error) {
    console.error(`[playback] command failed: ${command}`, error);
  }
}
