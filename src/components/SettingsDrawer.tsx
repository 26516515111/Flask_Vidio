import React, { useState } from 'react';
import { Drawer, Input, Switch, Button, Upload, message, Radio } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined, PictureOutlined, EditOutlined, LoadingOutlined, VideoCameraAddOutlined, AudioOutlined, SwapOutlined } from '@ant-design/icons';
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
  setMediaAnalysisMode,
} from '../store/settingsSlice';
import { ocrApi } from '../services/ocrApi';
import { llmApi } from '../services/llmApi';
import { blobApi } from '../services/blobApi';
import { videoApi } from '../services/videoApi';
import { audioApi } from '../services/audioApi';
import VoiceSelector from './VoiceSelector';
import styles from './SettingsDrawer.module.css';

const { TextArea } = Input;

const emotions = ['开心', '悲伤', '愤怒', '惊讶', '恐惧', '厌恶', '平静', '激动', '温柔'];

// --- Media file validation (per Xiaomi MiMo API limits) ---
const SUPPORTED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-ms-wmv': '.wmv',
};
const SUPPORTED_AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/wave': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/ogg': '.ogg',
  'audio/vorbis': '.ogg',
};
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100 MB (URL mode)

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function validateVideoFile(file: File): string | null {
  // Check extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const supportedExts = Object.values(SUPPORTED_VIDEO_TYPES);
  if (!supportedExts.includes(ext)) {
    return `不支持的视频格式 ".${file.name.split('.').pop()}"，支持的格式: ${supportedExts.join(', ')}`;
  }
  // Check MIME type
  if (file.type && !(file.type in SUPPORTED_VIDEO_TYPES)) {
    return `无法识别的视频类型 "${file.type || '未知'}"，支持的格式: ${supportedExts.join(', ')}`;
  }
  // Check size
  if (file.size > MAX_VIDEO_SIZE) {
    return `视频文件过大 (${formatSize(file.size)})，最大支持 ${formatSize(MAX_VIDEO_SIZE)}`;
  }
  if (file.size === 0) {
    return '视频文件为空，请选择有效的视频文件';
  }
  return null;
}

function validateAudioFile(file: File): string | null {
  // Check extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const supportedExts = Object.values(SUPPORTED_AUDIO_TYPES);
  if (!supportedExts.includes(ext)) {
    return `不支持的音频格式 ".${file.name.split('.').pop()}"，支持的格式: ${supportedExts.join(', ')}`;
  }
  // Check MIME type (browsers may not set it reliably for audio, skip if empty)
  if (file.type && !(file.type in SUPPORTED_AUDIO_TYPES)) {
    return `无法识别的音频类型 "${file.type}"，支持的格式: ${supportedExts.join(', ')}`;
  }
  // Check size
  if (file.size > MAX_AUDIO_SIZE) {
    return `音频文件过大 (${formatSize(file.size)})，最大支持 ${formatSize(MAX_AUDIO_SIZE)}`;
  }
  if (file.size === 0) {
    return '音频文件为空，请选择有效的音频文件';
  }
  return null;
}

/** Read video duration from File object using a temporary <video> element. */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取视频信息'));
    };
    video.src = url;
  });
}

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirmAnalysis?: (msg: import('../types/chat').ChatMessage) => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ open, onClose, onConfirmAnalysis }) => {
  const dispatch = useDispatch();
  const settings = useSelector((state: RootState) => state.settings);
  const [sceneInputMode, setSceneInputMode] = useState<'text' | 'image' | 'video' | 'audio'>('text');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<UploadFile | null>(null);
  const [mediaAnalysisResult, setMediaAnalysisResult] = useState<{
    tags: string[];
    summary: string;
    fileName: string;
    characters?: import('../services/videoApi').CharacterInfo[];
    scene?: string;
    emotion?: string;
    voice_style?: string;
  } | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

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

  const handleVideoUpload = async (file: File) => {
    // Validate format before uploading
    const validationError = validateVideoFile(file);
    if (validationError) {
      message.error(validationError, 5);
      return false;
    }

    setMediaLoading(true);
    setUploadedFile({ uid: file.name, name: file.name, status: 'uploading' });

    try {
      // Read video duration for adaptive FPS
      let duration: number | undefined;
      try {
        duration = await getVideoDuration(file);
      } catch {
        // Non-fatal: proceed without duration (backend uses default fps=2)
      }

      const blobUrl = await blobApi.upload(file);
      const result = await videoApi.analyze(blobUrl, duration);
      setMediaAnalysisResult({ ...result, fileName: file.name });
      setUploadedFile({ uid: file.name, name: file.name, status: 'done' });
      message.success('视频分析完成');
    } catch (error: any) {
      console.error('Video analysis failed:', error);
      const errMsg = error?.message || error?.response?.data?.error || '';
      if (errMsg.includes('corrupted') || errMsg.includes('cannot be processed')) {
        message.error('视频无法被识别，请尝试：\n1. 转换视频为 H.264 编码的 MP4 格式\n2. 减小视频体积（建议 < 200MB）\n3. 确保视频可正常播放', 6);
      } else {
        message.error(error?.response?.data?.error || '视频分析失败，请重试');
      }
      setUploadedFile({ uid: file.name, name: file.name, status: 'error' });
    } finally {
      setMediaLoading(false);
    }

    return false;
  };

  const handleAudioUpload = async (file: File) => {
    // Validate format before uploading
    const validationError = validateAudioFile(file);
    if (validationError) {
      message.error(validationError, 5);
      return false;
    }

    setMediaLoading(true);
    setUploadedFile({ uid: file.name, name: file.name, status: 'uploading' });

    try {
      const blobUrl = await blobApi.upload(file);
      const result = await audioApi.analyze(blobUrl);
      setMediaAnalysisResult({ ...result, fileName: file.name });
      setUploadedFile({ uid: file.name, name: file.name, status: 'done' });
      message.success('音频分析完成');
    } catch (error: any) {
      console.error('Audio analysis failed:', error);
      const errMsg = error?.message || error?.response?.data?.error || '';
      if (errMsg.includes('corrupted') || errMsg.includes('cannot be processed')) {
        message.error('音频无法被识别，请尝试：\n1. 转换为 MP3 或 WAV 格式\n2. 减小音频体积（建议 < 50MB）\n3. 确保音频可正常播放', 6);
      } else {
        message.error(error?.response?.data?.error || '音频分析失败，请重试');
      }
      setUploadedFile({ uid: file.name, name: file.name, status: 'error' });
    } finally {
      setMediaLoading(false);
    }

    return false;
  };

  const handleConfirmMediaScene = () => {
    if (!mediaAnalysisResult) return;
    // Auto-fill: scene description (combine scene + summary)
    const fullScene = [
      mediaAnalysisResult.scene,
      mediaAnalysisResult.summary,
    ].filter(Boolean).join('。');
    dispatch(setScene(fullScene));

    // Auto-fill: character info (first character's role + personality)
    if (mediaAnalysisResult.characters?.length) {
      const primary = mediaAnalysisResult.characters[0];
      const characterDesc = [primary.role, primary.personality, primary.voice_hint]
        .filter(Boolean).join('，');
      dispatch(setCharacter(characterDesc));
    }

    // Auto-fill: emotion if available
    if (mediaAnalysisResult.emotion) {
      dispatch(setSelectedEmotion(mediaAnalysisResult.emotion));
    }

    // Auto-fill: voice style as direction
    if (mediaAnalysisResult.voice_style) {
      dispatch(setDirection(mediaAnalysisResult.voice_style));
    }

    setMediaAnalysisResult(null);
    setUploadedFile(null);
    message.success('场景描述和配音信息已保存');
  };

  const handleConfirmMediaAnalysis = () => {
    if (!mediaAnalysisResult || !onConfirmAnalysis) return;
    const analysisMessage: import('../types/chat').ChatMessage = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      content: '',
      type: 'analysis',
      analysis: {
        tags: mediaAnalysisResult.tags,
        summary: mediaAnalysisResult.summary,
        mediaType: sceneInputMode as 'video' | 'audio',
        fileName: mediaAnalysisResult.fileName,
        // 音频分析字段
        scene: mediaAnalysisResult.scene,
        emotion: mediaAnalysisResult.emotion,
        voice_style: mediaAnalysisResult.voice_style,
        music: mediaAnalysisResult.music,
        layers: mediaAnalysisResult.layers,
        dialogue: mediaAnalysisResult.dialogue,
        // 视频分析字段
        characters: mediaAnalysisResult.characters,
        audio: mediaAnalysisResult.audio,
        visual: mediaAnalysisResult.visual,
        scenes: mediaAnalysisResult.scenes,
      },
      timestamp: Date.now(),
    };
    onConfirmAnalysis(analysisMessage);
    setMediaAnalysisResult(null);
    setUploadedFile(null);
    message.success('分析结果已发送');
  };

  const handleCancelMedia = () => {
    setMediaAnalysisResult(null);
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
          <Radio.Button value="text" style={{ width: '25%', textAlign: 'center' }}>
            <EditOutlined />
          </Radio.Button>
          <Radio.Button value="image" style={{ width: '25%', textAlign: 'center' }}>
            <PictureOutlined />
          </Radio.Button>
          <Radio.Button value="video" style={{ width: '25%', textAlign: 'center' }}>
            <VideoCameraAddOutlined />
          </Radio.Button>
          <Radio.Button value="audio" style={{ width: '25%', textAlign: 'center' }}>
            <AudioOutlined />
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

        {(sceneInputMode === 'video' || sceneInputMode === 'audio') && (
          <div className={styles.ocrSection}>
            <Upload
              beforeUpload={sceneInputMode === 'video' ? handleVideoUpload : handleAudioUpload}
              showUploadList={false}
              accept={sceneInputMode === 'video' ? 'video/*' : 'audio/*'}
              disabled={mediaLoading}
            >
              <Button
                icon={mediaLoading ? <LoadingOutlined /> : <UploadOutlined />}
                loading={mediaLoading}
                block
              >
                {mediaLoading
                  ? `正在分析${sceneInputMode === 'video' ? '视频' : '音频'}...`
                  : `选择${sceneInputMode === 'video' ? '视频' : '音频'}`}
              </Button>
            </Upload>

            {uploadedFile && !mediaAnalysisResult && (
              <div className={styles.uploadedFile}>
                {sceneInputMode === 'video' ? <VideoCameraAddOutlined /> : <AudioOutlined />}{' '}
                {uploadedFile.name}
              </div>
            )}

            {mediaAnalysisResult && (
              <div className={styles.ocrResult}>
                <div className={styles.ocrResultLabel}>
                  {sceneInputMode === 'video' ? '视频' : '音频'}分析结果
                </div>
                <div className={styles.mediaTags}>
                  {mediaAnalysisResult.tags.map((tag) => (
                    <span key={tag} className={styles.mediaTag}>{tag}</span>
                  ))}
                </div>

                {/* Scene info */}
                {mediaAnalysisResult.scene && (
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                    场景：{mediaAnalysisResult.scene}
                  </div>
                )}

                {/* Characters */}
                {mediaAnalysisResult.characters && mediaAnalysisResult.characters.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {mediaAnalysisResult.characters.map((ch, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
                        <strong>{ch.role}</strong>
                        {ch.gender && ` · ${ch.gender}`}
                        {ch.age && ` · ${ch.age}`}
                        {ch.personality && ` · ${ch.personality}`}
                        {ch.voice_hint && (
                          <div style={{ color: '#1677ff', fontSize: 11 }}>🎤 {ch.voice_hint}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Audio Info */}
                {sceneInputMode === 'video' && mediaAnalysisResult.audio?.detected && (
                  <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎵 音频信息</div>
                    {mediaAnalysisResult.audio.music?.detected && (
                      <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                        <div>音乐：{mediaAnalysisResult.audio.music.genre} · {mediaAnalysisResult.audio.music.tempo} · {mediaAnalysisResult.audio.music.mood}</div>
                        {mediaAnalysisResult.audio.music.instruments && mediaAnalysisResult.audio.music.instruments.length > 0 && (
                          <div style={{ color: '#888' }}>乐器：{mediaAnalysisResult.audio.music.instruments.join('、')}</div>
                        )}
                      </div>
                    )}
                    {mediaAnalysisResult.audio.dialogue?.detected && (
                      <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                        <div>对话：{mediaAnalysisResult.audio.dialogue.speakers?.join('、')}</div>
                        {mediaAnalysisResult.audio.dialogue.language && <span>语言：{mediaAnalysisResult.audio.dialogue.language}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Visual Info */}
                {sceneInputMode === 'video' && mediaAnalysisResult.visual && (
                  <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎬 视觉信息</div>
                    <div style={{ fontSize: 12, color: '#555' }}>
                      {mediaAnalysisResult.visual.style && <span>风格：{mediaAnalysisResult.visual.style} </span>}
                      {mediaAnalysisResult.visual.color_tone && <span>色调：{mediaAnalysisResult.visual.color_tone}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                      {mediaAnalysisResult.visual.camera_movement && <span>镜头：{mediaAnalysisResult.visual.camera_movement} </span>}
                      {mediaAnalysisResult.visual.lighting && <span>光线：{mediaAnalysisResult.visual.lighting}</span>}
                    </div>
                    {mediaAnalysisResult.visual.composition && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>构图：{mediaAnalysisResult.visual.composition}</div>
                    )}
                  </div>
                )}

                {/* Scene Timeline */}
                {sceneInputMode === 'video' && mediaAnalysisResult.scenes && mediaAnalysisResult.scenes.length > 0 && (
                  <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎭 场景分层</div>
                    {mediaAnalysisResult.scenes.map((scene, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#555', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          background: '#e6f7ff',
                          color: '#1890ff'
                        }}>
                          场景 {i + 1}
                        </span>
                        <span>{scene.description}</span>
                        {scene.start_time !== undefined && scene.end_time !== undefined && (
                          <span style={{ color: '#aaa', marginLeft: 'auto' }}>
                            {scene.start_time.toFixed(1)}s - {scene.end_time.toFixed(1)}s
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Emotion + Voice style */}
                <div style={{ marginBottom: 6, fontSize: 12 }}>
                  {mediaAnalysisResult.emotion && (
                    <span style={{ marginRight: 12 }}>
                      情绪：<span style={{ color: '#1677ff' }}>{mediaAnalysisResult.emotion}</span>
                    </span>
                  )}
                  {mediaAnalysisResult.voice_style && (
                    <div style={{ color: '#888', marginTop: 2 }}>
                      配音建议：{mediaAnalysisResult.voice_style}
                    </div>
                  )}
                </div>

                {/* Music Info */}
                {mediaAnalysisResult.music?.detected && (
                  <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎵 音乐信息</div>
                    <div style={{ fontSize: 12, color: '#555' }}>
                      {mediaAnalysisResult.music.genre && <span>类型：{mediaAnalysisResult.music.genre} </span>}
                      {mediaAnalysisResult.music.tempo && <span>节奏：{mediaAnalysisResult.music.tempo} </span>}
                      {mediaAnalysisResult.music.mood && <span>氛围：{mediaAnalysisResult.music.mood}</span>}
                    </div>
                    {mediaAnalysisResult.music.instruments && mediaAnalysisResult.music.instruments.length > 0 && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        乐器：{mediaAnalysisResult.music.instruments.join('、')}
                      </div>
                    )}
                  </div>
                )}

                {/* Dialogue Info */}
                {mediaAnalysisResult.dialogue?.detected && (
                  <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>💬 对话信息</div>
                    {mediaAnalysisResult.dialogue.speakers && mediaAnalysisResult.dialogue.speakers.length > 0 && (
                      <div style={{ fontSize: 12, color: '#555' }}>
                        说话人：{mediaAnalysisResult.dialogue.speakers.join('、')}
                      </div>
                    )}
                    {mediaAnalysisResult.dialogue.language && (
                      <div style={{ fontSize: 12, color: '#555' }}>语言：{mediaAnalysisResult.dialogue.language}</div>
                    )}
                    {mediaAnalysisResult.dialogue.content_summary && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        内容摘要：{mediaAnalysisResult.dialogue.content_summary}
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Layers */}
                {mediaAnalysisResult.layers && mediaAnalysisResult.layers.length > 0 && (
                  <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎛️ 音频分层</div>
                    {mediaAnalysisResult.layers.map((layer, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#555', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          background: layer.type === 'music' ? '#e6f7ff' :
                                      layer.type === 'dialogue' ? '#f6ffed' :
                                      layer.type === 'background' ? '#fff7e6' : '#fff1f0',
                          color: layer.type === 'music' ? '#1890ff' :
                                 layer.type === 'dialogue' ? '#52c41a' :
                                 layer.type === 'background' ? '#fa8c16' : '#f5222d'
                        }}>
                          {layer.type === 'music' ? '音乐' :
                           layer.type === 'dialogue' ? '对话' :
                           layer.type === 'background' ? '背景' : '音效'}
                        </span>
                        <span>{layer.description}</span>
                        {layer.start_time !== undefined && layer.end_time !== undefined && (
                          <span style={{ color: '#aaa', marginLeft: 'auto' }}>
                            {layer.start_time.toFixed(1)}s - {layer.end_time.toFixed(1)}s
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <TextArea
                  rows={3}
                  value={mediaAnalysisResult.summary}
                  readOnly
                />
                <div className={styles.modeSwitch}>
                  <Radio.Group
                    value={settings.mediaAnalysisMode}
                    onChange={(e) => dispatch(setMediaAnalysisMode(e.target.value))}
                    size="small"
                    optionType="button"
                  >
                    <Radio.Button value="scene">
                      <SwapOutlined /> 作为场景输入
                    </Radio.Button>
                    <Radio.Button value="standalone">
                      <SwapOutlined /> 仅分析
                    </Radio.Button>
                  </Radio.Group>
                </div>
                <div className={styles.ocrActions}>
                  {settings.mediaAnalysisMode === 'scene' ? (
                    <Button type="primary" size="small" onClick={handleConfirmMediaScene}>
                      确认使用
                    </Button>
                  ) : (
                    <Button type="primary" size="small" onClick={handleConfirmMediaAnalysis}>
                      提交分析
                    </Button>
                  )}
                  <Button size="small" onClick={handleCancelMedia}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            {settings.scene && !mediaAnalysisResult && (
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
