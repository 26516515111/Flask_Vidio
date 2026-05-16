import api from './api';

export const blobApi = {
  /** Get upload token from backend */
  getUploadToken: async () => {
    const response = await api.get('/blob-token');
    return response.data;
  },

  /** Upload file directly to Vercel Blob from client, return public URL */
  upload: async (file: File): Promise<string> => {
    // Step 1: Get upload token from backend
    const tokenResponse = await api.get('/blob-token');
    const { token } = tokenResponse.data;

    if (!token) {
      throw new Error('Failed to get upload token');
    }

    // Step 2: Generate unique filename
    const uniqueId = Math.random().toString(36).substring(2, 10);
    const safeName = `${uniqueId}-${file.name}`;

    // Step 3: Upload directly to Vercel Blob from client with PUBLIC access
    const response = await fetch(`https://blob.vercel-storage.com/${safeName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-vercel-blob-access': 'public',
      },
      body: file,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const result = await response.json();
    return result.url;
  },
};
