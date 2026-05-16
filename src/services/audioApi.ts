import api from './api';

export interface AudioAnalysisResult {
  tags: string[];
  summary: string;
}

export const audioApi = {
  analyze: async (url: string): Promise<AudioAnalysisResult> => {
    const response = await api.post('/audio', { url });
    return response.data;
  },
};
