import React, { useState, useCallback, useMemo } from 'react';
import { message } from 'antd';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { addMessage, updateMessage, setProcessing } from '../store/chatSlice';
import { setDrawerOpen } from '../store/settingsSlice';
import type { ChatMessage } from '../types/chat';
import ChatSidebar from '../components/ChatSidebar';
import ChatHeader from '../components/ChatHeader';
import ChatHistory from '../components/ChatHistory';
import ChatInput from '../components/ChatInput';
import SettingsDrawer from '../components/SettingsDrawer';
import { llmApi } from '../services/llmApi';
import { ttsApi } from '../services/ttsApi';
import styles from './Home.module.css';

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const Home: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { isProcessing, conversations, activeConversationId } = useSelector((state: RootState) => state.chat);
  const settings = useSelector((state: RootState) => state.settings);
  const settingsOpen = settings.drawerOpen;
  const [polishTrigger, setPolishTrigger] = useState(0);

  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );
  const messages = activeConversation?.messages ?? [];

  const handleSend = useCallback(async (text: string) => {
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      originalText: text,
    };
    dispatch(addMessage(userMessage));

    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isProcessing: true,
    };
    dispatch(addMessage(assistantMessage));
    dispatch(setProcessing(true));

    try {
      let processedText = text;
      let styleDescription = settings.scene;

      if (!settings.directorMode && settings.scene) {
        try {
          const styleResult = await llmApi.sceneToStyle(settings.scene);
          styleDescription = styleResult.style_description;
        } catch (error) {
          console.error('Failed to convert scene to style:', error);
          styleDescription = settings.scene;
        }
      }

      let customVoiceType: string | undefined;
      let customVoiceData: string | undefined;

      if (settings.selectedVoice === 'custom') {
        if (settings.customVoiceFile) {
          customVoiceType = 'voiceclone';
          const fileReader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            fileReader.onload = () => {
              const result = fileReader.result as string;
              resolve(result.split(',')[1]);
            };
            fileReader.readAsDataURL(settings.customVoiceFile!);
          });
          customVoiceData = base64;
        } else if (settings.customVoiceName) {
          customVoiceType = 'voicedesign';
          customVoiceData = settings.customVoiceName;
        }
      }

      const audioResult = await ttsApi.synthesize(
        processedText,
        settings.selectedVoice,
        settings.directorMode ? undefined : settings.selectedEmotion,
        undefined,
        settings.directorMode ? undefined : styleDescription,
        settings.directorMode ? settings.character : undefined,
        settings.directorMode ? settings.direction : undefined,
        customVoiceType,
        customVoiceData,
      );

      dispatch(updateMessage({
        id: assistantId,
        updates: {
          content: processedText,
          processedText: processedText,
          detectedEmotion: 'neutral',
          audioUrl: audioResult.audio_url,
          isProcessing: false,
        },
      }));

      message.success('处理完成');
    } catch (error) {
      dispatch(updateMessage({
        id: assistantId,
        updates: {
          content: '处理失败，请重试',
          isProcessing: false,
        },
      }));
      message.error('处理失败');
    } finally {
      dispatch(setProcessing(false));
    }
  }, [dispatch, settings, activeConversationId]);

  const handlePolish = useCallback(async (text: string): Promise<string | null> => {
    try {
      const result = await llmApi.polishText(text, settings.scene);
      message.success('润色完成');
      return result.processed_text;
    } catch (error) {
      message.error('润色失败');
      return null;
    }
  }, [settings.scene]);

  const handleCapabilityClick = useCallback((capability: string) => {
    switch (capability) {
      case 'ocr':
      case 'emotion':
        dispatch(setDrawerOpen(true));
        break;
      case 'director':
        dispatch(setDrawerOpen(true));
        break;
      case 'polish':
        setPolishTrigger(t => t + 1);
        break;
      case 'tts':
        document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
        break;
      default:
        break;
    }
  }, [dispatch]);

  return (
    <div className={styles.app}>
      <ChatSidebar />
      <div className={styles.main}>
        <ChatHeader />
        <div className={styles.chatArea}>
          <ChatHistory messages={messages} onCapabilityClick={handleCapabilityClick} />
        </div>
        <ChatInput
          onSend={handleSend}
          onPolish={handlePolish}
          onSettingsClick={() => dispatch(setDrawerOpen(true))}
          disabled={isProcessing}
          polishTrigger={polishTrigger}
        />
      </div>
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => dispatch(setDrawerOpen(false))}
        onConfirmAnalysis={(msg) => dispatch(addMessage(msg))}
      />
    </div>
  );
};

export default Home;
