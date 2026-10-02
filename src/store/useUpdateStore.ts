import { create } from 'zustand';
import { UpdateInfo } from '../components/Controls/UpdateModal';

interface UpdateState {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  checkForUpdates: () => Promise<UpdateInfo | null>;
  initUpdateListener: () => () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateInfo: null,
  isChecking: false,
  isModalOpen: false,

  setIsModalOpen: (open: boolean) => set({ isModalOpen: open }),

  setUpdateInfo: (info: UpdateInfo | null) => set({ updateInfo: info }),

  checkForUpdates: async () => {
    if (!window.electronAPI?.checkForUpdates) return null;
    set({ isChecking: true });
    try {
      const res: UpdateInfo = await window.electronAPI.checkForUpdates();
      console.log('[UpdateStore] Checked for updates:', res);
      set({ updateInfo: res, isChecking: false });
      return res;
    } catch (err: any) {
      console.warn('[UpdateStore] Check for updates error:', err);
      set({ isChecking: false });
      return null;
    }
  },

  initUpdateListener: () => {
    // 1. Initial check after 1.5s
    const timer = setTimeout(() => {
      get().checkForUpdates();
    }, 1500);

    // 2. Event listener for broadcast updates from main process
    let unsub: (() => void) | undefined;
    if (window.electronAPI?.onUpdateAvailable) {
      unsub = window.electronAPI.onUpdateAvailable((info: UpdateInfo) => {
        console.log('[UpdateStore] ⚡ Live update broadcast received:', info);
        set({ updateInfo: info });
      });
    }

    return () => {
      clearTimeout(timer);
      if (typeof unsub === 'function') unsub();
    };
  },
}));
