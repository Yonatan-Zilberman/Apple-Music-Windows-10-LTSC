import Store from 'electron-store';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

interface StoreSchema {
  windowBounds: WindowBounds;
}

const store = new Store<StoreSchema>({
  name: 'config',
  defaults: {
    windowBounds: {
      width: 1280,
      height: 800,
    },
  },
});

export function getWindowBounds(): WindowBounds {
  return store.get('windowBounds');
}

export function setWindowBounds(bounds: WindowBounds): void {
  store.set('windowBounds', bounds);
}
