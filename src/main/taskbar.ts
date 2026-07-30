import { BrowserWindow, nativeImage } from 'electron';
import type { PlaybackState } from '../shared/playback';
import { onPlaybackStateChange, sendPlaybackCommand } from './playback-bridge';
import { assetPath } from './paths';

function loadIcon(name: string) {
  const img = nativeImage.createFromPath(assetPath(name));
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

export function initTaskbar(win: BrowserWindow): void {
  const prevIcon = loadIcon('thumbar-prev.png');
  const nextIcon = loadIcon('thumbar-next.png');
  const playIcon = loadIcon('thumbar-play.png');
  const pauseIcon = loadIcon('thumbar-pause.png');

  // Clear any leftover progress/overlay from older builds
  win.setProgressBar(-1);
  win.setOverlayIcon(null, '');

  const apply = (state: PlaybackState): void => {
    if (win.isDestroyed()) return;

    if (state.title && state.artist) {
      win.setTitle(`${state.title} — ${state.artist} · Apple Music Desktop`);
    } else if (state.title) {
      win.setTitle(`${state.title} · Apple Music Desktop`);
    } else {
      win.setTitle('Apple Music Desktop');
    }

    void win.setThumbarButtons([
      {
        tooltip: 'Previous',
        icon: prevIcon,
        click: () => {
          void sendPlaybackCommand('previous');
        },
      },
      {
        tooltip: state.isPlaying ? 'Pause' : 'Play',
        icon: state.isPlaying ? pauseIcon : playIcon,
        click: () => {
          void sendPlaybackCommand('playPause');
        },
      },
      {
        tooltip: 'Next',
        icon: nextIcon,
        click: () => {
          void sendPlaybackCommand('next');
        },
      },
    ]);
  };

  onPlaybackStateChange(apply);
}
