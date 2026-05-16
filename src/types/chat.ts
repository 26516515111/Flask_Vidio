export interface MusicInfo {
  detected: boolean;
  genre?: string;
  tempo?: string;
  instruments?: string[];
  mood?: string;
}

export interface AudioLayer {
  type: 'music' | 'dialogue' | 'background' | 'sfx';
  description: string;
  start_time?: number;
  end_time?: number;
}

export interface DialogueInfo {
  detected: boolean;
  speakers?: string[];
  language?: string;
  content_summary?: string;
}

export interface AudioInfo {
  detected: boolean;
  music?: MusicInfo;
  dialogue?: DialogueInfo;
  layers?: AudioLayer[];
}

export interface VisualInfo {
  style?: string;
  color_tone?: string;
  camera_movement?: string;
  lighting?: string;
  composition?: string;
}

export interface SceneInfo {
  description: string;
  start_time?: number;
  end_time?: number;
  mood?: string;
}

export interface CharacterInfo {
  role: string;
  gender: string;
  age: string;
  personality: string;
  voice_hint: string;
}

export interface MediaAnalysis {
  tags: string[];
  summary: string;
  mediaType: 'video' | 'audio';
  fileName: string;
  scene?: string;
  emotion?: string;
  voice_style?: string;
  // 音频分析字段（音频和视频共用）
  music?: MusicInfo;
  layers?: AudioLayer[];
  dialogue?: DialogueInfo;
  // 视频分析特有字段
  characters?: CharacterInfo[];
  audio?: AudioInfo;
  visual?: VisualInfo;
  scenes?: SceneInfo[];
}

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
  type?: 'message' | 'analysis';
  analysis?: MediaAnalysis;
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

export type InputMode = 'text' | 'image' | 'video' | 'audio';

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
  mediaAnalysisMode: 'scene' | 'standalone';
  drawerOpen: boolean;
}
