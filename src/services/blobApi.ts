import api from './api';

/** Derive MIME type from file extension when browser doesn't provide file.type.
 *  This is critical for video/audio files uploaded without extensions (e.g. from
 *  messaging apps) — without the correct Content-Type, Vercel Blob serves them as
 *  application/octet-stream, causing Xiaomi MiMo API to reject them. */
const EXTENSION_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

function getContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && ext in EXTENSION_MIME_MAP) {
    return EXTENSION_MIME_MAP[ext];
  }
  return 'application/octet-stream';
}

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
    const contentType = getContentType(file);
    const response = await fetch(`https://blob.vercel-storage.com/${safeName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType,
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
