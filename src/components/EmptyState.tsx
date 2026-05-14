import React from 'react';
import {
  AudioOutlined,
  FileImageOutlined,
  SmileOutlined,
  EditOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import styles from './EmptyState.module.css';

interface Capability {
  icon: React.ReactNode;
  label: string;
  key: string;
}

const capabilities: Capability[] = [
  { icon: <AudioOutlined />, label: '文字转语音', key: 'tts' },
  { icon: <FileImageOutlined />, label: '图片OCR提取', key: 'ocr' },
  { icon: <SmileOutlined />, label: '情绪识别', key: 'emotion' },
  { icon: <EditOutlined />, label: 'AI润色', key: 'polish' },
  { icon: <VideoCameraOutlined />, label: '导演模式', key: 'director' },
];

interface EmptyStateProps {
  onCapabilityClick?: (key: string) => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onCapabilityClick }) => {
  return (
    <div className={styles.container}>
      <div className={styles.bgPattern} />
      <div className={styles.brandMark}>
        <AudioOutlined />
      </div>
      <h1 className={styles.title}>语音转换助手</h1>
      <p className={styles.subtitle}>
        智能语音转换工具，支持文字输入和图片OCR，通过大模型加工后生成自然语音
      </p>
      <div className={styles.cards}>
        {capabilities.map((cap) => (
          <div
            key={cap.key}
            className={styles.card}
            onClick={() => onCapabilityClick?.(cap.key)}
          >
            <span className={styles.cardIcon}>{cap.icon}</span>
            <span className={styles.cardLabel}>{cap.label}</span>
          </div>
        ))}
      </div>
      <div className={styles.hint}>
        按 <span className={styles.hintKey}>Enter</span> 发送，<span className={styles.hintKey}>Shift+Enter</span> 换行
      </div>
    </div>
  );
};

export default EmptyState;
