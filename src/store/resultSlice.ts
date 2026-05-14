import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface ResultState {
  processedText: string;
  detectedEmotion: string;
  audioUrl: string | null;
  loading: boolean;
  error: string | null;
  styleTags: string;
  audioTags: string[];
  rawOutput: string;
}

const initialState: ResultState = {
  processedText: '',
  detectedEmotion: '',
  audioUrl: null,
  loading: false,
  error: null,
  styleTags: '',
  audioTags: [],
  rawOutput: '',
};

const resultSlice = createSlice({
  name: 'result',
  initialState,
  reducers: {
    setProcessedText: (state, action: PayloadAction<string>) => {
      state.processedText = action.payload;
    },
    setDetectedEmotion: (state, action: PayloadAction<string>) => {
      state.detectedEmotion = action.payload;
    },
    setAudioUrl: (state, action: PayloadAction<string | null>) => {
      state.audioUrl = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setStyleTags: (state, action: PayloadAction<string>) => {
      state.styleTags = action.payload;
    },
    setAudioTags: (state, action: PayloadAction<string[]>) => {
      state.audioTags = action.payload;
    },
    setRawOutput: (state, action: PayloadAction<string>) => {
      state.rawOutput = action.payload;
    },
    resetResult: (state) => {
      state.processedText = '';
      state.detectedEmotion = '';
      state.audioUrl = null;
      state.error = null;
      state.styleTags = '';
      state.audioTags = [];
      state.rawOutput = '';
    },
  },
});

export const {
  setProcessedText,
  setDetectedEmotion,
  setAudioUrl,
  setLoading,
  setError,
  setStyleTags,
  setAudioTags,
  setRawOutput,
  resetResult,
} = resultSlice.actions;
export default resultSlice.reducer;
