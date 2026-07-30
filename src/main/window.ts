import path from 'node:path';
import { readFileSync } from 'node:fs';
import { BrowserWindow, shell } from 'electron';
import { getWindowBounds, setWindowBounds } from './store';
import { initPlaybackBridge } from './playback-bridge';
import { assetPath } from './paths';

const APP_URL = 'https://music.apple.com';
const PARTITION = 'persist:apple-music';

const ALLOWED_HOST_SUFFIXES = [
  'music.apple.com',
  'apple.com',
  'appleid.apple.com',
  'idmsa.apple.com',
  'cdn-apple.com',
  'mzstatic.com',
];

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let injectSource: string | null = null;
let boundsTimer: ReturnType<typeof setTimeout> | null = null;

export function setQuitting(value: boolean): void {
  isQuitting = value;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function isAllowedUrl(url: string): boolean {
  if (!url || url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return parsed.protocol === 'about:';
    }
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function loadInjectSource(): string {
  if (injectSource) return injectSource;
  const injectPath = path.join(__dirname, '..', 'inject', 'musickit-hook.js');
  injectSource = readFileSync(injectPath, 'utf8');
  return injectSource;
}

async function injectMusicKitHook(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;
  try {
    const source = loadInjectSource();
    await win.webContents.executeJavaScript(source, true);
  } catch (error) {
    console.error('[window] MusicKit inject failed', error);
  }
}

function scheduleBoundsSave(win: BrowserWindow): void {
  if (boundsTimer) clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const bounds = win.getBounds();
    setWindowBounds({
      ...bounds,
      isMaximized: win.isMaximized(),
    });
  }, 1500);
}

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const SNAPPY_CSS = `
  a, button, [role="button"], [role="link"], [data-testid] {
    touch-action: manipulation !important;
  }
`;

export function createMainWindow(): BrowserWindow {
  const saved = getWindowBounds();
  const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js');
  const iconPath = assetPath('icon.ico');

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111113',
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
      spellcheck: false,
      backgroundThrottling: false,
      v8CacheOptions: 'bypassHeatCheck',
    },
  });

  mainWindow.webContents.setUserAgent(CHROME_USER_AGENT);

  if (saved.isMaximized) {
    mainWindow.maximize();
  }

  initPlaybackBridge(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('resize', () => {
    if (mainWindow) scheduleBoundsSave(mainWindow);
  });
  mainWindow.on('move', () => {
    if (mainWindow) scheduleBoundsSave(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      return { action: 'allow' };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  const maybeInject = (): void => {
    const url = mainWindow?.webContents.getURL() ?? '';
    if (!url || url === 'about:blank') return;
    if (!isAllowedUrl(url)) return;
    void mainWindow?.webContents.insertCSS(SNAPPY_CSS);
    void injectMusicKitHook(mainWindow!);
  };

  mainWindow.webContents.on('dom-ready', maybeInject);
  mainWindow.webContents.on('did-finish-load', maybeInject);
  mainWindow.webContents.on('did-navigate', maybeInject);

  void mainWindow.loadURL(APP_URL);
  return mainWindow;
}
