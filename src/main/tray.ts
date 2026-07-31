import { Menu, Tray, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
import type { PlaybackState } from '../shared/playback';
import { onPlaybackStateChange } from './playback-bridge';
import { showMainWindow } from './window';
import { assetPath } from './paths';
import { toggleMiniPlayer } from './miniplayer';
import { quitApp } from './quit';

let tray: Tray | null = null;
let defaultIcon: NativeImage = nativeImage.createEmpty();

function tooltipFor(state: PlaybackState): string {
  if (state.title && state.artist) {
    return `${state.artist} — ${state.title}`;
  }
  if (state.title) return state.title;
  return 'Apple Music Desktop';
}

function buildOverflowMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Open Apple Music',
      click: () => showMainWindow(),
    },
    {
      label: 'Quit',
      click: () => {
        void quitApp();
      },
    },
  ]);
}

export function createTray(): Tray {
  // Transparent squircle for tray; taskbar/exe uses opaque full-bleed icon.ico
  defaultIcon = nativeImage.createFromPath(assetPath('tray-icon.png'));
  if (defaultIcon.isEmpty()) {
    defaultIcon = nativeImage.createFromPath(assetPath('brand-icon.png'));
  }
  if (defaultIcon.isEmpty()) {
    defaultIcon = nativeImage.createFromPath(assetPath('icon.png'));
  }
  tray = new Tray(defaultIcon.isEmpty() ? nativeImage.createEmpty() : defaultIcon);
  tray.setToolTip('Apple Music Desktop');
  tray.setContextMenu(buildOverflowMenu());

  // Left-click: mini player popup
  tray.on('click', (_event, bounds) => {
    toggleMiniPlayer(bounds);
  });

  // Right-click: Open / Quit
  tray.on('right-click', () => {
    if (!tray) return;
    tray.popUpContextMenu(buildOverflowMenu());
  });

  let lastTooltip = '';
  onPlaybackStateChange((state) => {
    if (!tray) return;
    const tooltip = tooltipFor(state);
    if (tooltip !== lastTooltip) {
      lastTooltip = tooltip;
      tray.setToolTip(tooltip);
    }
  });

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
