import api from './api';

export const ttsApi = {
  synthesize: async (
    text: string,
    voice?: string,
    emotion?: string,
    styleTags?: string,
    scene?: string,
    character?: string,
    direction?: string,
    customVoiceType?: string,
    customVoiceData?: string,
  ) => {
    const response = await api.post('/tts', {
      text,
      voice: voice || 'mimo_default',
      emotion: emotion || 'neutral',
      style_tags: styleTags,
      scene: scene,
      character: character,
      direction: direction,
      custom_voice_type: customVoiceType,
      custom_voice_data: customVoiceData,
    });
    return response.data;
  },
};
