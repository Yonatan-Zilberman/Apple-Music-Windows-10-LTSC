/**
 * Injected into music.apple.com after load.
 * Hooks MusicKit when available, with DOM / mediaSession fallbacks
 * so tray + media keys work even if MusicKit is late or hidden.
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
  let lastProgressSent = 0;
  let lastPublished = '';
  let lastMediaMetadataKey = '';
  let handlersBound = false;
  let mutationTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Prefer explicit now-playing chrome when present
    const chrome =
      document.querySelector<HTMLElement>('[data-testid="lcd-player"]') ||
      document.querySelector<HTMLElement>('.web-chrome') ||
      document.querySelector<HTMLElement>('amp-lcd') ||
      document.querySelector<HTMLElement>('[class*="lcd"]');

    let title = '';
    let artist = '';
    let album = '';
    let art: string | null = null;

    if (chrome) {
      const titleEl =
        chrome.querySelector<HTMLElement>('[data-testid="lcd-title"]') ||
        chrome.querySelector<HTMLElement>('a[href*="/song/"]') ||
        chrome.querySelector<HTMLElement>('[class*="title"]');
      const artistEl =
        chrome.querySelector<HTMLElement>('[data-testid="lcd-artist"]') ||
        chrome.querySelector<HTMLElement>('a[href*="/artist/"]') ||
        chrome.querySelector<HTMLElement>('[class*="subtitle"]');
      const img = chrome.querySelector<HTMLImageElement>('img');
      title = (titleEl?.textContent || '').trim();
      artist = (artistEl?.textContent || '').trim();
      art = img?.currentSrc || img?.src || null;
    }

    if (!title) {
      // Fallback: document title often "Song - Artist - Apple Music" or "Playlist - Apple Music"
      const docTitle = document.title.replace(/\s*-\s*Apple Music\s*$/i, '').trim();
      if (docTitle && !/playlist|album|station|radio/i.test(docTitle.split(' - ')[0] || '')) {
        const parts = docTitle.split(' - ').map((p: string) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          title = parts[0];
          artist = parts[1];
        }
      }
    }

    if (!title && !artist && !art && !audio) return null;

    return {
      title,
      artist,
      album,
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

    const metaKey = `${state.title}|${state.artist}|${state.album}|${state.artworkUrl}`;
    if (metaKey !== lastMediaMetadataKey) {
      lastMediaMetadataKey = metaKey;
      try {
        const artwork = state.artworkUrl
          ? [
              { src: state.artworkUrl, sizes: '300x300', type: 'image/jpeg' },
              { src: state.artworkUrl.replace('300x300', '600x600'), sizes: '600x600', type: 'image/jpeg' },
            ]
          : [];
        ms.metadata = new MediaMetadata({
          title: state.title || 'Apple Music',
          artist: state.artist || 'Apple Music Desktop',
          album: state.album || undefined,
          artwork,
        });
      } catch {
        // ignore MediaMetadata failures
      }
    }

    try {
      ms.playbackState = state.isPlaying ? 'playing' : 'paused';
      if (state.durationSec > 0) {
        ms.setPositionState({
          duration: state.durationSec,
          playbackRate: 1,
          position: Math.min(state.positionSec, state.durationSec),
        });
      }
    } catch {
      // ignore state failures
    }

    if (handlersBound) return;
    handlersBound = true;

    const bind = (action: MediaSessionAction, fn: () => void): void => {
      try {
        ms.setActionHandler(action, () => {
          fn();
        });
      } catch {
        // unsupported
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
    bind('stop', () => {
      void controls.pause();
    });
  }

  function publish(force = false): void {
    const state = getState();
    const key = JSON.stringify([
      state.title,
      state.artist,
      state.album,
      state.artworkUrl,
      state.isPlaying,
      Math.floor(state.positionSec),
    ]);
    if (!force && key === lastPublished) return;
    lastPublished = key;
    try {
      w.amd?.sendPlaybackUpdate(state);
    } catch {
      // ignore
    }
    syncMediaSession(state);
  }

  function debouncedPublish(): void {
    if (mutationTimer) return;
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      publish();
    }, 250);
  }

  const controls = {
    play: async () => {
      if (musicKit) {
        try {
          await musicKit.play();
          publish(true);
          return;
        } catch {
          // fall through
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
          // fall through
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
          // fall through
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
          // fall through
        }
      }
      clickAriaButton('previous', 'previous ', 'skip to previous');
      publish(true);
    },
    getState,
  };

  w.__amd = controls;

  // DOM observer used only when MusicKit is unavailable
  const observer = new MutationObserver(() => debouncedPublish());

  function attachMusicKit(music: MusicKitInstance): void {
    musicKit = music;
    // Disconnect heavy DOM mutation observer once event-driven MusicKit is hooked!
    observer.disconnect();

    const onChange = (): void => publish(true);
    music.addEventListener('nowPlayingItemDidChange', onChange);
    music.addEventListener('playbackStateDidChange', onChange);
    music.addEventListener('playbackTimeDidChange', () => {
      const now = Date.now();
      if (now - lastProgressSent < 1000) return;
      lastProgressSent = now;
      publish();
    });
    publish(true);
    console.log('[amd] MusicKit hook attached (DOM observer disconnected)');
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

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'src', 'class'],
  });
  window.setInterval(() => {
    if (!musicKit) publish();
  }, 3000);

  document.addEventListener(
    'play',
    () => {
      handlersBound = false;
      publish(true);
    },
    true,
  );
  document.addEventListener(
    'pause',
    () => {
      handlersBound = false;
      publish(true);
    },
    true,
  );

  if (!tryAttachMusicKit()) {
    document.addEventListener('musickitloaded', () => {
      tryAttachMusicKit();
    });
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (tryAttachMusicKit() || Date.now() - started > 120_000) {
        window.clearInterval(timer);
      }
    }, 500);
  }

  publish(true);
  console.log('[amd] playback bridge ready');
})();

