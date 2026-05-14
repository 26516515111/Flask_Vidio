import React from 'react';
import { PlayCircleOutlined, PauseCircleOutlined, DownloadOutlined, AudioOutlined, UserOutlined } from '@ant-design/icons';
import type { ChatMessage as ChatMessageType } from '../types/chat';
import styles from './ChatMessage.module.css';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const isUser = message.role === 'user';

  const handlePlayPause = () => {
    if (!message.audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(message.audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    if (!message.audioUrl) return;
    const link = document.createElement('a');
    link.href = message.audioUrl;
    link.download = `audio_${message.id}.mp3`;
    link.click();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const tags = message.audioTags || (message.styleTags ? [message.styleTags] : []);

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}>
      <div className={`${styles.avatar} ${isUser ? styles.avatarUser : styles.avatarAssistant}`}>
        {isUser ? <UserOutlined /> : <AudioOutlined />}
      </div>
      <div className={styles.bubbleWrapper}>
        <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
          {message.isProcessing && <span className={styles.spinner} />}
          <div className={styles.content}>{message.content}</div>

          {!isUser && message.processedText && message.processedText !== message.content && (
            <div className={styles.processedText}>
              <div className={styles.processedLabel}>润色结果</div>
              {message.processedText}
            </div>
          )}

          {!isUser && tags.length > 0 && (
            <div className={styles.tags}>
              {tags.map((tag, i) => (
                <span key={i} className={styles.tag}>{tag}</span>
              ))}
            </div>
          )}

          {!isUser && message.audioUrl && (
            <div className={styles.audioPlayer}>
              <button className={styles.audioBtn} onClick={handlePlayPause}>
                {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              </button>
              <div className={styles.waveform}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className={`${styles.waveBar} ${isPlaying ? styles.waveBarPlaying : ''}`}
                  />
                ))}
              </div>
              <button className={styles.downloadBtn} onClick={handleDownload}>
                <DownloadOutlined />
              </button>
            </div>
          )}

          <div className={`${styles.timestamp} ${!isUser ? styles.timestampAssistant : ''}`}>
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
