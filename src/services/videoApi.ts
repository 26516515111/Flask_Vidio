import api from './api';

export interface CharacterInfo {
  role: string;
  gender: string;
  age: string;
  personality: string;
  voice_hint: string;
}

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

export interface VideoAnalysisResult {
  tags: string[];
  summary: string;
  characters: CharacterInfo[];
  scene: string;
  emotion: string;
  voice_style: string;
  audio?: AudioInfo;
  visual?: VisualInfo;
  scenes?: SceneInfo[];
}

export const videoApi = {
  analyze: async (url: string, duration?: number): Promise<VideoAnalysisResult> => {
    const response = await api.post('/video', { url, duration });
    return response.data;
  },
};
