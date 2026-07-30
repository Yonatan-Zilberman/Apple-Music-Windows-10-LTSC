import { globalShortcut, BrowserWindow } from 'electron';
import { sendPlaybackCommand } from './playback-bridge';

const BINDINGS: Array<{ accelerator: string; command: 'playPause' | 'next' | 'previous' }> = [
  { accelerator: 'MediaPlayPause', command: 'playPause' },
  { accelerator: 'MediaNextTrack', command: 'next' },
  { accelerator: 'MediaPreviousTrack', command: 'previous' },
  // Global media F-keys: F6 prev, F7 play/pause, F8 next
  { accelerator: 'F6', command: 'previous' },
  { accelerator: 'F7', command: 'playPause' },
  { accelerator: 'F8', command: 'next' },
];

export function registerMediaShortcuts(): void {
  for (const { accelerator, command } of BINDINGS) {
    try {
      const ok = globalShortcut.register(accelerator, () => {
        void sendPlaybackCommand(command);
      });
      if (!ok) {
        console.warn(`[shortcuts] failed to register ${accelerator}`);
      } else {
        console.log(`[shortcuts] registered ${accelerator}`);
      }
    } catch (error) {
      console.warn(`[shortcuts] error registering ${accelerator}`, error);
    }
  }
}

/** Capture media keys when they reach the focused BrowserWindow (backup path). */
export function bindWindowMediaKeys(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key;
    if (key === 'MediaPlayPause' || key === 'F7') {
      event.preventDefault();
      void sendPlaybackCommand('playPause');
    } else if (key === 'MediaTrackNext' || key === 'MediaNextTrack' || key === 'F8') {
      event.preventDefault();
      void sendPlaybackCommand('next');
    } else if (key === 'MediaTrackPrevious' || key === 'MediaPreviousTrack' || key === 'F6') {
      event.preventDefault();
      void sendPlaybackCommand('previous');
    }
  });
}

export function unregisterMediaShortcuts(): void {
  globalShortcut.unregisterAll();
}
