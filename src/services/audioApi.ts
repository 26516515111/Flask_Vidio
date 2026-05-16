import api from './api';

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

export interface AudioAnalysisResult {
  tags: string[];
  summary: string;
  scene?: string;
  emotion?: string;
  voice_style?: string;
  music?: MusicInfo;
  layers?: AudioLayer[];
  dialogue?: DialogueInfo;
}

export const audioApi = {
  analyze: async (url: string): Promise<AudioAnalysisResult> => {
    const response = await api.post('/audio', { url });
    return response.data;
  },
};
