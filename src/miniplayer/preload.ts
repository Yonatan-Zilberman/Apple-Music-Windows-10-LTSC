import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { PlaybackCommand, PlaybackState } from '../shared/playback';

contextBridge.exposeInMainWorld('mini', {
  getState: (): Promise<PlaybackState> => ipcRenderer.invoke(IPC.MINI_GET_STATE),
  sendCommand: (command: PlaybackCommand): void => {
    ipcRenderer.send(IPC.MINI_COMMAND, command);
  },
  openMain: (): void => {
    ipcRenderer.send(IPC.MINI_OPEN_MAIN);
  },
  onState: (callback: (state: PlaybackState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PlaybackState): void => {
      callback(state);
    };
    ipcRenderer.on(IPC.MINI_STATE, listener);
    return () => {
      ipcRenderer.removeListener(IPC.MINI_STATE, listener);
    };
  },
});
