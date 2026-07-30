export type PlaybackCommand = 'play' | 'pause' | 'playPause' | 'next' | 'previous';

export interface PlaybackState {
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
}

export const EMPTY_PLAYBACK_STATE: PlaybackState = {
  title: '',
  artist: '',
  album: '',
  artworkUrl: null,
  isPlaying: false,
  positionSec: 0,
  durationSec: 0,
};
