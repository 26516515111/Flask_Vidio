export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  originalText?: string;
  processedText?: string;
  detectedEmotion?: string;
  audioUrl?: string;
  styleTags?: string;
  audioTags?: string[];
  isProcessing?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isProcessing: boolean;
}

export type InputMode = 'text' | 'image';

export interface SettingsState {
  inputMode: InputMode;
  imageUrl: string | null;
  scene: string;
  selectedVoice: string;
  directorMode: boolean;
  character: string;
  direction: string;
  selectedEmotion: string;
  selectedProcessing: string;
  customVoiceFile: File | null;
  customVoiceName: string;
  drawerOpen: boolean;
}
