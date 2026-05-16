import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { InputMode, SettingsState } from '../types/chat';

const initialState: SettingsState = {
  inputMode: 'text',
  imageUrl: null,
  scene: '',
  selectedVoice: '',
  directorMode: false,
  character: '',
  direction: '',
  selectedEmotion: '',
  selectedProcessing: '',
  customVoiceFile: null,
  customVoiceName: '',
  mediaAnalysisMode: 'scene' as 'scene' | 'standalone',
  drawerOpen: false,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setInputMode: (state, action: PayloadAction<InputMode>) => {
      state.inputMode = action.payload;
    },
    setImageUrl: (state, action: PayloadAction<string | null>) => {
      state.imageUrl = action.payload;
    },
    setScene: (state, action: PayloadAction<string>) => {
      state.scene = action.payload;
    },
    setSelectedVoice: (state, action: PayloadAction<string>) => {
      state.selectedVoice = action.payload;
    },
    setDirectorMode: (state, action: PayloadAction<boolean>) => {
      state.directorMode = action.payload;
    },
    setCharacter: (state, action: PayloadAction<string>) => {
      state.character = action.payload;
    },
    setDirection: (state, action: PayloadAction<string>) => {
      state.direction = action.payload;
    },
    setSelectedEmotion: (state, action: PayloadAction<string>) => {
      state.selectedEmotion = action.payload;
    },
    setSelectedProcessing: (state, action: PayloadAction<string>) => {
      state.selectedProcessing = action.payload;
    },
    setCustomVoiceFile: (state, action: PayloadAction<File | null>) => {
      state.customVoiceFile = action.payload;
    },
    setCustomVoiceName: (state, action: PayloadAction<string>) => {
      state.customVoiceName = action.payload;
    },
    setMediaAnalysisMode: (state, action: PayloadAction<'scene' | 'standalone'>) => {
      state.mediaAnalysisMode = action.payload;
    },
    setDrawerOpen: (state, action: PayloadAction<boolean>) => {
      state.drawerOpen = action.payload;
    },
    resetSettings: () => initialState,
  },
});

export const {
  setInputMode,
  setImageUrl,
  setScene,
  setSelectedVoice,
  setDirectorMode,
  setCharacter,
  setDirection,
  setSelectedEmotion,
  setSelectedProcessing,
  setCustomVoiceFile,
  setCustomVoiceName,
  setMediaAnalysisMode,
  setDrawerOpen,
  resetSettings,
} = settingsSlice.actions;
export default settingsSlice.reducer;
