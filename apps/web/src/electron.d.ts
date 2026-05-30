interface ElectronAPI {
  getScreenSources: () => Promise<Array<{
    id: string;
    name: string;
    thumbnail: string;
  }>>;
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
