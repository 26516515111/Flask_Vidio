import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface InputState {
  text: string;
  scene: string;
  imageUrl: string | null;
  inputType: 'text' | 'image';
  directorMode: boolean;
  character: string;
  direction: string;
}

const initialState: InputState = {
  text: '',
  scene: '',
  imageUrl: null,
  inputType: 'text',
  directorMode: false,
  character: '',
  direction: '',
};

const inputSlice = createSlice({
  name: 'input',
  initialState,
  reducers: {
    setText: (state, action: PayloadAction<string>) => {
      state.text = action.payload;
    },
    setScene: (state, action: PayloadAction<string>) => {
      state.scene = action.payload;
    },
    setImageUrl: (state, action: PayloadAction<string | null>) => {
      state.imageUrl = action.payload;
    },
    setInputType: (state, action: PayloadAction<'text' | 'image'>) => {
      state.inputType = action.payload;
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
    resetInput: (state) => {
      state.text = '';
      state.scene = '';
      state.imageUrl = null;
      state.directorMode = false;
      state.character = '';
      state.direction = '';
    },
  },
});

export const { setText, setScene, setImageUrl, setInputType, setDirectorMode, setCharacter, setDirection, resetInput } = inputSlice.actions;
export default inputSlice.reducer;
