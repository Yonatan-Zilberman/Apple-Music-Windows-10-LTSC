import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { PlaybackState } from '../shared/playback';

contextBridge.exposeInMainWorld('amd', {
  sendPlaybackUpdate(state: PlaybackState): void {
    ipcRenderer.send(IPC.PLAYBACK_UPDATE, state);
  },
});
