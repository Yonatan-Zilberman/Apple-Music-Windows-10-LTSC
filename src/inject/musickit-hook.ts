/**
 * Injected into music.apple.com after load.
 * Hooks MusicKit when available, with light DOM / mediaSession fallbacks.
 *
 * Performance rules:
 * - Never observe the whole document; Apple's SPA mutates constantly.
 * - Publish to the main process only when track/playing state actually changes.
 * - Once MusicKit is attached, rely purely on its events (no polling).
 */
(() => {
  interface PlaybackSnapshot {
    title: string;
    artist: string;
    album: string;
    artworkUrl: string | null;
    isPlaying: boolean;
    positionSec: number;
    durationSec: number;
  }

  interface AmdBridge {
    sendPlaybackUpdate(state: PlaybackSnapshot): void;
  }

  interface MusicKitInstance {
    playbackState: number | string;
    currentPlaybackTime?: number;
    currentPlaybackDuration?: number;
    nowPlayingItem?: {
      attributes?: {
        name?: string;
        artistName?: string;
        albumName?: string;
        artwork?: { url?: string };
      };
    };
    play: () => Promise<void>;
    pause: () => void;
    skipToNextItem: () => Promise<void>;
    skipToPreviousItem: () => Promise<void>;
    addEventListener: (event: string, cb: (...args: unknown[]) => void) => void;
  }

  const w = window as Window & {
    __amdInstalled?: boolean;
    __amd?: {
      play: () => Promise<void>;
      pause: () => Promise<void>;
      playPause: () => Promise<void>;
      next: () => Promise<void>;
      previous: () => Promise<void>;
      getState: () => PlaybackSnapshot;
    };
    amd?: AmdBridge;
    MusicKit?: {
      getInstance: () => MusicKitInstance;
      PlaybackStates?: Record<string, number>;
    };
  };

  if (w.__amdInstalled) return;
  w.__amdInstalled = true;

  let musicKit: MusicKitInstance | null = null;
  let lastPublishedKey = '';
  let handlersBound = false;
  let fallbackTimer: number | null = null;

  function artworkUrl(raw: string | undefined | null): string | null {
    if (!raw) return null;
    return raw.replace('{w}', '300').replace('{h}', '300').replace('{f}', 'jpg');
  }

  function isPlayingState(playbackState: number | string): boolean {
    if (typeof playbackState === 'string') {
      return playbackState.toLowerCase() === 'playing';
    }
    const states = w.MusicKit?.PlaybackStates;
    if (states && typeof states.playing === 'number') {
      return playbackState === states.playing;
    }
    return playbackState === 2;
  }

  function clickAriaButton(...labels: string[]): boolean {
    const wanted = labels.map((l) => l.toLowerCase());
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('button[aria-label], [role="button"][aria-label]'),
    );
    for (const node of nodes) {
      const label = (node.getAttribute('aria-label') || '').toLowerCase();
      if (!label) continue;
      if (wanted.some((wlabel) => label === wlabel || label.startsWith(`${wlabel} `))) {
        node.click();
        return true;
      }
    }
    return false;
  }

  function readDomState(): PlaybackSnapshot | null {
    const audio = document.querySelector('audio');
    const isPlaying = Boolean(audio && !audio.paused && !audio.ended);

    const chrome =
      document.querySelector<HTMLElement>('[data-testid="lcd-player"]') ||
      document.querySelector<HTMLElement>('.web-chrome') ||
      document.querySelector<HTMLElement>('amp-lcd');

    let title = '';
    let artist = '';
    let art: string | null = null;

    if (chrome) {
      const titleEl =
        chrome.querySelector<HTMLElement>('[data-testid="lcd-title"]') ||
        chrome.querySelector<HTMLElement>('a[href*="/song/"]');
      const artistEl =
        chrome.querySelector<HTMLElement>('[data-testid="lcd-artist"]') ||
        chrome.querySelector<HTMLElement>('a[href*="/artist/"]');
      const img = chrome.querySelector<HTMLImageElement>('img');
      title = (titleEl?.textContent || '').trim();
      artist = (artistEl?.textContent || '').trim();
      art = img?.currentSrc || img?.src || null;
    }

    if (!title && !artist && !art && !audio) return null;

    return {
      title,
      artist,
      album: '',
      artworkUrl: art,
      isPlaying,
      positionSec: audio ? Number(audio.currentTime) || 0 : 0,
      durationSec: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
    };
  }

  function buildMusicKitState(music: MusicKitInstance): PlaybackSnapshot {
    const attrs = music.nowPlayingItem?.attributes ?? {};
    return {
      title: attrs.name ?? '',
      artist: attrs.artistName ?? '',
      album: attrs.albumName ?? '',
      artworkUrl: artworkUrl(attrs.artwork?.url),
      isPlaying: isPlayingState(music.playbackState),
      positionSec: Number(music.currentPlaybackTime) || 0,
      durationSec: Number(music.currentPlaybackDuration) || 0,
    };
  }

  function getState(): PlaybackSnapshot {
    if (musicKit) {
      const mk = buildMusicKitState(musicKit);
      if (mk.title || mk.artist || mk.isPlaying) return mk;
    }
    return (
      readDomState() || {
        title: '',
        artist: '',
        album: '',
        artworkUrl: null,
        isPlaying: false,
        positionSec: 0,
        durationSec: 0,
      }
    );
  }

  function syncMediaSession(state: PlaybackSnapshot): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: state.title || 'Apple Music',
        artist: state.artist || 'Apple Music Desktop',
        album: state.album || undefined,
        artwork: state.artworkUrl
          ? [{ src: state.artworkUrl, sizes: '300x300', type: 'image/jpeg' }]
          : [],
      });
      ms.playbackState = state.isPlaying ? 'playing' : 'paused';
    } catch {
      // ignore MediaMetadata failures
    }

    if (handlersBound) return;
    handlersBound = true;

    const bind = (action: MediaSessionAction, fn: () => void): void => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // unsupported action
      }
    };

    bind('play', () => {
      void controls.play();
    });
    bind('pause', () => {
      void controls.pause();
    });
    bind('previoustrack', () => {
      void controls.previous();
    });
    bind('nexttrack', () => {
      void controls.next();
    });
  }

  /**
   * Send state to main only when something the UI actually shows changes.
   * Position ticks are intentionally excluded — nothing displays them.
   */
  function publish(force = false): void {
    const state = getState();
    const key = [
      state.title,
      state.artist,
      state.album,
      state.artworkUrl ?? '',
      state.isPlaying ? '1' : '0',
    ].join('\u0000');
    if (!force && key === lastPublishedKey) return;
    lastPublishedKey = key;
    try {
      w.amd?.sendPlaybackUpdate(state);
    } catch {
      // preload may not be ready in rare edge cases
    }
    syncMediaSession(state);
  }

  const controls = {
    play: async () => {
      if (musicKit) {
        try {
          await musicKit.play();
          publish(true);
          return;
        } catch {
          // fall through to DOM
        }
      }
      if (!clickAriaButton('play', 'play ')) {
        const audio = document.querySelector('audio');
        await audio?.play().catch(() => undefined);
      }
      publish(true);
    },
    pause: async () => {
      if (musicKit) {
        try {
          musicKit.pause();
          publish(true);
          return;
        } catch {
          // fall through to DOM
        }
      }
      if (!clickAriaButton('pause', 'pause ')) {
        document.querySelector('audio')?.pause();
      }
      publish(true);
    },
    playPause: async () => {
      const state = getState();
      if (state.isPlaying) await controls.pause();
      else await controls.play();
    },
    next: async () => {
      if (musicKit) {
        try {
          await musicKit.skipToNextItem();
          publish(true);
          return;
        } catch {
          // fall through to DOM
        }
      }
      clickAriaButton('next', 'next ', 'skip to next');
      publish(true);
    },
    previous: async () => {
      if (musicKit) {
        try {
          await musicKit.skipToPreviousItem();
          publish(true);
          return;
        } catch {
          // fall through to DOM
        }
      }
      clickAriaButton('previous', 'previous ', 'skip to previous');
      publish(true);
    },
    getState,
  };

  w.__amd = controls;

  function stopFallbackPolling(): void {
    if (fallbackTimer !== null) {
      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function attachMusicKit(music: MusicKitInstance): void {
    musicKit = music;
    stopFallbackPolling();

    const onChange = (): void => publish();
    music.addEventListener('nowPlayingItemDidChange', onChange);
    music.addEventListener('playbackStateDidChange', onChange);
    publish(true);
    console.log('[amd] MusicKit hook attached');
  }

  function tryAttachMusicKit(): boolean {
    try {
      const mk = w.MusicKit;
      if (!mk?.getInstance) return false;
      const music = mk.getInstance();
      if (!music) return false;
      attachMusicKit(music);
      return true;
    } catch {
      return false;
    }
  }

  // <audio> play/pause events are cheap and reliable — no DOM observer needed.
  document.addEventListener('play', () => publish(), true);
  document.addEventListener('pause', () => publish(), true);

  if (!tryAttachMusicKit()) {
    document.addEventListener('musickitloaded', () => {
      tryAttachMusicKit();
    });

    // Low-frequency fallback keeps metadata fresh until MusicKit shows up,
    // then attachMusicKit() stops it entirely.
    const started = Date.now();
    fallbackTimer = window.setInterval(() => {
      if (tryAttachMusicKit()) return;
      publish();
      if (Date.now() - started > 120_000 && fallbackTimer !== null) {
        // Give up on MusicKit; keep a very light metadata refresh.
        window.clearInterval(fallbackTimer);
        fallbackTimer = window.setInterval(() => publish(), 5_000);
      }
    }, 1_000);
  }

  publish(true);
  console.log('[amd] playback bridge ready');
})();
