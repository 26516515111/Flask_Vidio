import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessage, Conversation, ChatState } from '../types/chat';

const generateId = () => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const createConversation = (): Conversation => ({
  id: generateId(),
  title: '新对话',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  isProcessing: false,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    newConversation: (state) => {
      const conv = createConversation();
      state.conversations.unshift(conv);
      state.activeConversationId = conv.id;
    },
    setActiveConversation: (state, action: PayloadAction<string>) => {
      state.activeConversationId = action.payload;
    },
    deleteConversation: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      state.conversations = state.conversations.filter(c => c.id !== id);
      if (state.activeConversationId === id) {
        state.activeConversationId = state.conversations.length > 0
          ? state.conversations[0].id
          : null;
      }
    },
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      let conv = state.conversations.find(c => c.id === state.activeConversationId);
      if (!conv) {
        conv = createConversation();
        state.conversations.unshift(conv);
        state.activeConversationId = conv.id;
      }
      conv.messages.push(action.payload);
      conv.updatedAt = Date.now();
      if (conv.title === '新对话' && action.payload.role === 'user') {
        conv.title = action.payload.content.slice(0, 30) + (action.payload.content.length > 30 ? '...' : '');
      }
    },
    updateMessage: (state, action: PayloadAction<{ id: string; updates: Partial<ChatMessage> }>) => {
      const conv = state.conversations.find(c => c.id === state.activeConversationId);
      if (!conv) return;
      const msg = conv.messages.find(m => m.id === action.payload.id);
      if (msg) {
        Object.assign(msg, action.payload.updates);
        conv.updatedAt = Date.now();
      }
    },
    setProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },
    clearAll: (state) => {
      state.conversations = [];
      state.activeConversationId = null;
      state.isProcessing = false;
    },
  },
});

export const {
  newConversation,
  setActiveConversation,
  deleteConversation,
  addMessage,
  updateMessage,
  setProcessing,
  clearAll,
} = chatSlice.actions;

export default chatSlice.reducer;
