import React, { useRef, useEffect } from 'react';
import {
  SendOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  SoundOutlined,
  SmileOutlined,
  VideoCameraOutlined,
  EnvironmentOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  onSend: (text: string) => void;
  onPolish?: (text: string) => Promise<string | null>;
  onSettingsClick?: () => void;
  disabled?: boolean;
  polishTrigger?: number;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onPolish,
  onSettingsClick,
  disabled = false,
  polishTrigger = 0,
}) => {
  const settings = useSelector((state: RootState) => state.settings);
  const [text, setText] = React.useState('');
  const [polishedText, setPolishedText] = React.useState<string | null>(null);
  const [isPolishing, setIsPolishing] = React.useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [text]);

  useEffect(() => {
    if (polishTrigger > 0) {
      handlePolish();
    }
  }, [polishTrigger]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    setPolishedText(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePolish = async () => {
    if (!onPolish || !text.trim() || isPolishing) return;
    setIsPolishing(true);
    try {
      const result = await onPolish(text);
      if (result) setPolishedText(result);
    } finally {
      setIsPolishing(false);
    }
  };

  const handleUsePolished = () => {
    if (polishedText) {
      setText(polishedText);
      setPolishedText(null);
    }
  };

  const voiceLabels: Record<string, string> = {
    mimo_default: '默认音色',
    default_zh: '中文女声',
    default_en: '英文女声',
    custom: '自定义',
  };
  const emotionLabels: Record<string, string> = {
    '开心': '开心', '悲伤': '悲伤', '愤怒': '愤怒', '惊讶': '惊讶',
    '恐惧': '恐惧', '厌恶': '厌恶', '平静': '平静', '激动': '激动', '温柔': '温柔',
  };

  const chips: { icon: React.ReactNode; label: string; color: string }[] = [];
  if (settings.directorMode) {
    chips.push({ icon: <VideoCameraOutlined />, label: '导演模式', color: 'gold' });
  }
  if (settings.selectedVoice && settings.selectedVoice !== 'mimo_default') {
    chips.push({ icon: <SoundOutlined />, label: voiceLabels[settings.selectedVoice] || settings.selectedVoice, color: 'blue' });
  }
  if (settings.selectedEmotion && settings.selectedEmotion !== 'neutral') {
    chips.push({ icon: <SmileOutlined />, label: emotionLabels[settings.selectedEmotion] || settings.selectedEmotion, color: 'blue' });
  }
  if (settings.scene) {
    const short = settings.scene.length > 8 ? settings.scene.slice(0, 8) + '..' : settings.scene;
    chips.push({ icon: <EnvironmentOutlined />, label: short, color: 'blue' });
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        {isPolishing && (
          <div className={styles.polishLoading}>
            <div className={styles.polishLoadingIcon}>
              <LoadingOutlined />
            </div>
            <div className={styles.polishLoadingText}>
              <span className={styles.polishLoadingTitle}>AI 正在润色中</span>
              <span className={styles.polishLoadingHint}>优化文本表达，请稍候...</span>
            </div>
            <div className={styles.polishLoadingBar}>
              <div className={styles.polishLoadingBarInner} />
            </div>
          </div>
        )}

        {polishedText && !isPolishing && (
          <div className={styles.polishPreview}>
            <div className={styles.polishHeader}>
              <ThunderboltOutlined />
              <span>AI 润色结果</span>
            </div>
            <div className={styles.polishText}>{polishedText}</div>
            <div className={styles.polishActions}>
              <button className={styles.polishCancelBtn} onClick={() => setPolishedText(null)}>取消</button>
              <button className={styles.polishUseBtn} onClick={handleUsePolished}>使用</button>
            </div>
          </div>
        )}

        {chips.length > 0 && (
          <div className={styles.activeTags}>
            {chips.map((chip, i) => (
              <button
                key={i}
                className={`${styles.activeTag} ${chip.color === 'gold' ? styles.activeTagGold : ''}`}
                onClick={onSettingsClick}
              >
                {chip.icon}
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={disabled ? '处理中...' : '输入要转换的文字...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            title="发送 (Enter)"
          >
            <SendOutlined />
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <button
              className={`${styles.polishBtn} ${isPolishing ? styles.polishBtnLoading : ''}`}
              onClick={handlePolish}
              disabled={disabled || isPolishing || !text.trim()}
              title="AI 润色文本"
            >
              {isPolishing ? <LoadingOutlined /> : <ThunderboltOutlined />}
              <span>{isPolishing ? '润色中' : 'AI润色'}</span>
            </button>

            <button className={styles.settingsBtn} onClick={onSettingsClick} title="语音设置">
              <SettingOutlined />
              <span>设置</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
