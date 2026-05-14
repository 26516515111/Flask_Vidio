import api from './api';

export const ocrApi = {
  extractText: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/ocr', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
