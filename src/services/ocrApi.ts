import api from './api';

export const ocrApi = {
  /** Extract text from image via Blob URL */
  extractText: async (imageUrl: string) => {
    const response = await api.post('/ocr', { url: imageUrl });
    return response.data;
  },
};
