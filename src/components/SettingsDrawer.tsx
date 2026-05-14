import React, { useState } from 'react';
import { Drawer, Input, Switch, Button, Upload, message, Radio } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined, PictureOutlined, EditOutlined, LoadingOutlined } from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import {
  setScene,
  setSelectedVoice,
  setDirectorMode,
  setCharacter,
  setDirection,
  setSelectedEmotion,
  setCustomVoiceFile,
  setCustomVoiceName,
} from '../store/settingsSlice';
import { ocrApi } from '../services/ocrApi';
import { llmApi } from '../services/llmApi';
import VoiceSelector from './VoiceSelector';
import styles from './SettingsDrawer.module.css';

const { TextArea } = Input;

const emotions = ['开心', '悲伤', '愤怒', '惊讶', '恐惧', '厌恶', '平静', '激动', '温柔'];

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ open, onClose }) => {
  const dispatch = useDispatch();
  const settings = useSelector((state: RootState) => state.settings);
  const [sceneInputMode, setSceneInputMode] = useState<'text' | 'image'>('text');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<UploadFile | null>(null);

  const handleImageUpload = async (file: File) => {
    setOcrLoading(true);
    setUploadedFile({ uid: file.name, name: file.name, status: 'uploading' });

    try {
      const ocrResult = await ocrApi.extractText(file);
      const extractedText = ocrResult.text;

      if (!extractedText) {
        message.error('未能从图片中提取文字');
        setOcrLoading(false);
        return false;
      }

      const sceneResult = await llmApi.ocrToScene(extractedText);
      setOcrResult(sceneResult.scene_description);
      setUploadedFile({ uid: file.name, name: file.name, status: 'done' });
      message.success('图片处理完成，请确认场景描述');
    } catch (error) {
      console.error('OCR processing failed:', error);
      message.error('图片处理失败，请重试');
      setUploadedFile({ uid: file.name, name: file.name, status: 'error' });
    } finally {
      setOcrLoading(false);
    }

    return false;
  };

  const handleConfirmOcrScene = () => {
    dispatch(setScene(ocrResult));
    setOcrResult('');
    setUploadedFile(null);
    message.success('场景描述已保存');
  };

  const handleCancelOcr = () => {
    setOcrResult('');
    setUploadedFile(null);
  };

  return (
    <Drawer
      title="设置"
      placement="right"
      width={380}
      open={open}
      onClose={onClose}
    >
      {/* Scene Input */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>场景描述</div>

        <Radio.Group
          value={sceneInputMode}
          onChange={(e) => setSceneInputMode(e.target.value)}
          style={{ marginBottom: 12, width: '100%' }}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="text" style={{ width: '50%', textAlign: 'center' }}>
            <EditOutlined /> 文字输入
          </Radio.Button>
          <Radio.Button value="image" style={{ width: '50%', textAlign: 'center' }}>
            <PictureOutlined /> 图片OCR
          </Radio.Button>
        </Radio.Group>

        {sceneInputMode === 'text' && (
          <TextArea
            rows={3}
            placeholder="描述场景，如：在咖啡馆里和朋友聊天"
            value={settings.scene}
            onChange={(e) => dispatch(setScene(e.target.value))}
          />
        )}

        {sceneInputMode === 'image' && (
          <div className={styles.ocrSection}>
            <Upload
              beforeUpload={handleImageUpload}
              showUploadList={false}
              accept="image/*"
              disabled={ocrLoading}
            >
              <Button
                icon={ocrLoading ? <LoadingOutlined /> : <UploadOutlined />}
                loading={ocrLoading}
                block
              >
                {ocrLoading ? '正在处理图片...' : '选择图片'}
              </Button>
            </Upload>

            {uploadedFile && (
              <div className={styles.uploadedFile}>
                <PictureOutlined /> {uploadedFile.name}
              </div>
            )}

            {ocrResult && (
              <div className={styles.ocrResult}>
                <div className={styles.ocrResultLabel}>识别的场景描述</div>
                <TextArea
                  rows={3}
                  value={ocrResult}
                  onChange={(e) => setOcrResult(e.target.value)}
                  placeholder="可以编辑修改..."
                />
                <div className={styles.ocrActions}>
                  <Button type="primary" size="small" onClick={handleConfirmOcrScene}>
                    确认使用
                  </Button>
                  <Button size="small" onClick={handleCancelOcr}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            {settings.scene && !ocrResult && (
              <div className={styles.currentScene}>
                <div className={styles.currentSceneLabel}>当前场景</div>
                <div className={styles.currentSceneText}>{settings.scene}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Voice */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>音色选择</div>
        <div className={styles.voiceArea}>
          <VoiceSelector
            value={settings.selectedVoice}
            onChange={(val) => dispatch(setSelectedVoice(val))}
            customVoiceFile={settings.customVoiceFile}
            customVoiceName={settings.customVoiceName}
            onCustomVoiceChange={(file, name) => {
              dispatch(setCustomVoiceFile(file));
              dispatch(setCustomVoiceName(name));
            }}
          />
        </div>
      </div>

      {/* Director Mode */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          导演模式
          <Switch
            size="small"
            checked={settings.directorMode}
            onChange={(checked) => dispatch(setDirectorMode(checked))}
          />
        </div>
        {settings.directorMode && (
          <div className={styles.directorFields}>
            <div>
              <div className={styles.fieldLabel}>角色设定</div>
              <TextArea
                rows={2}
                placeholder="描述角色特征"
                value={settings.character}
                onChange={(e) => dispatch(setCharacter(e.target.value))}
              />
            </div>
            <div>
              <div className={styles.fieldLabel}>导演指导</div>
              <TextArea
                rows={2}
                placeholder="描述语音风格、情绪等"
                value={settings.direction}
                onChange={(e) => dispatch(setDirection(e.target.value))}
              />
            </div>
          </div>
        )}
      </div>

      {/* Emotion */}
      {!settings.directorMode && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>情绪选择</div>
          <div className={styles.emotionGrid}>
            {emotions.map((emotion) => (
              <div
                key={emotion}
                className={`${styles.emotionItem} ${
                  settings.selectedEmotion === emotion ? styles.emotionItemActive : ''
                }`}
                onClick={() => dispatch(setSelectedEmotion(emotion))}
              >
                {emotion}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className={styles.saveSection}>
        <Button type="primary" block onClick={onClose} size="large">
          保存设置
        </Button>
      </div>
    </Drawer>
  );
};

export default SettingsDrawer;
