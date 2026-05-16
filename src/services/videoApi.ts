import api from './api';

export interface CharacterInfo {
  role: string;
  gender: string;
  age: string;
  personality: string;
  voice_hint: string;
}

export interface VideoAnalysisResult {
  tags: string[];
  summary: string;
  characters: CharacterInfo[];
  scene: string;
  emotion: string;
  voice_style: string;
}

export const videoApi = {
  analyze: async (url: string, duration?: number): Promise<VideoAnalysisResult> => {
    const response = await api.post('/video', { url, duration });
    return response.data;
  },
};
