import api from './api';

export const llmApi = {
  processText: async (
    text: string,
    scene: string,
    emotion?: string,
    processingType?: string,
  ) => {
    const response = await api.post('/llm', {
      action: 'process',
      text,
      scene,
      emotion,
      processing_type: processingType,
    });
    return response.data;
  },

  processDirector: async (
    text: string,
    scene: string,
    character: string,
    direction: string,
  ) => {
    const response = await api.post('/llm', {
      action: 'director',
      text,
      scene,
      character,
      direction,
    });
    return response.data;
  },

  polishText: async (text: string, scene: string) => {
    const response = await api.post('/llm', {
      action: 'process',
      text,
      scene,
      processing_type: 'polish',
    });
    return response.data;
  },

  sceneToStyle: async (scene: string) => {
    const response = await api.post('/llm', {
      action: 'scene-to-style',
      scene,
    });
    return response.data;
  },

  ocrToScene: async (ocrText: string) => {
    const response = await api.post('/llm', {
      action: 'ocr-to-scene',
      ocr_text: ocrText,
    });
    return response.data;
  },
};
