import React from 'react';
import { Select, Radio, Input } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import styles from './VoiceSelector.module.css';

const { TextArea } = Input;

interface VoiceOption {
  value: string;
  label: string;
  desc: string;
  gender: string;
}

const voiceOptions: VoiceOption[] = [
  { value: 'mimo_default', label: '默认音色', desc: '因部署集群而异，中国集群默认为冰糖', gender: '女' },
  { value: '冰糖', label: '冰糖', desc: '中文女声', gender: '女' },
  { value: '茉莉', label: '茉莉', desc: '中文女声', gender: '女' },
  { value: '苏打', label: '苏打', desc: '中文男声', gender: '男' },
  { value: '白桦', label: '白桦', desc: '中文男声', gender: '男' },
  { value: 'Mia', label: 'Mia', desc: '英文女声', gender: '女' },
  { value: 'Chloe', label: 'Chloe', desc: '英文女声', gender: '女' },
  { value: 'Milo', label: 'Milo', desc: '英文男声', gender: '男' },
  { value: 'Dean', label: 'Dean', desc: '英文男声', gender: '男' },
  { value: 'custom', label: '自定义音色', desc: '文本描述或音频克隆', gender: '' },
];

interface VoiceSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  previewUrl?: string;
  customVoiceFile?: File | null;
  customVoiceName?: string;
  onCustomVoiceChange?: (file: File | null, name: string) => void;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  value,
  onChange,
  previewUrl,
  customVoiceFile,
  customVoiceName,
  onCustomVoiceChange,
}) => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [customVoiceMode, setCustomVoiceMode] = React.useState<'text' | 'file'>('text');
  const [customVoiceText, setCustomVoiceText] = React.useState('');
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handlePreview = () => {
    if (!previewUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/x-wav'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3)$/i)) {
      return;
    }

    const name = file.name.replace(/\.(wav|mp3)$/i, '');
    onCustomVoiceChange?.(file, name);
  };

  const handleRemoveCustom = () => {
    onCustomVoiceChange?.(null, '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCustomVoiceTextChange = (text: string) => {
    setCustomVoiceText(text);
    if (customVoiceMode === 'text') {
      onCustomVoiceChange?.(null, text);
    }
  };

  const handleCustomVoiceModeChange = (mode: 'text' | 'file') => {
    setCustomVoiceMode(mode);
    if (mode === 'text') {
      onCustomVoiceChange?.(null, customVoiceText);
    } else {
      onCustomVoiceChange?.(null, '');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.selectRow}>
        <Select
          className={styles.select}
          placeholder="选择音色"
          value={value || undefined}
          onChange={onChange}
          options={voiceOptions.map((v) => ({
            value: v.value,
            label: (
              <div>
                <div style={{ fontWeight: 500 }}>{v.label}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{v.desc}</div>
              </div>
            ),
          }))}
        />
        <button
          className={`${styles.previewBtn} ${isPlaying ? styles.previewBtnPlaying : ''}`}
          onClick={handlePreview}
          disabled={!previewUrl}
          title="试听音色"
        >
          {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
        </button>
      </div>

      {value === 'custom' && (
        <div className={styles.customVoiceArea}>
          <Radio.Group
            value={customVoiceMode}
            onChange={(e) => handleCustomVoiceModeChange(e.target.value)}
            size="small"
            style={{ marginBottom: 8, width: '100%' }}
          >
            <Radio.Button value="text" style={{ width: '50%', textAlign: 'center' }}>
              文本描述
            </Radio.Button>
            <Radio.Button value="file" style={{ width: '50%', textAlign: 'center' }}>
              音频克隆
            </Radio.Button>
          </Radio.Group>

          {customVoiceMode === 'text' ? (
            <TextArea
              rows={2}
              placeholder="描述音色特征，如：温柔甜美的女声，语速适中..."
              value={customVoiceText}
              onChange={(e) => handleCustomVoiceTextChange(e.target.value)}
              style={{ marginBottom: 8 }}
            />
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3"
                onChange={handleFileSelect}
                className={styles.fileInput}
              />
              {customVoiceFile ? (
                <div className={styles.customVoiceInfo}>
                  <span className={styles.customVoiceName}>{customVoiceName || customVoiceFile.name}</span>
                  <button className={styles.removeBtn} onClick={handleRemoveCustom}>
                    移除
                  </button>
                </div>
              ) : (
                <button
                  className={styles.uploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadOutlined /> 上传音频文件
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceSelector;
