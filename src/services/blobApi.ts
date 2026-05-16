import api from './api';

export const blobApi = {
  /** Get upload token from backend */
  getUploadToken: async () => {
    const response = await api.get('/blob-token');
    return response.data;
  },

  /** Upload file to Vercel Blob via backend, return public URL */
  upload: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/blob-upload', formData, {
      timeout: 300000,
    });
    return response.data.url;
  },
};
