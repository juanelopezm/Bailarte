// Global app state (zustand). Starts minimal in Phase 0 (connection diagnostics) and grows
// with each phase: song, capture, tape, analysis, artifacts, battle.
import { create } from 'zustand';

interface AppState {
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),
}));
