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

          {message.type === 'analysis' && message.analysis && (
            <div className={styles.analysisContent}>
              <div className={styles.analysisHeader}>
                {message.analysis.mediaType === 'video' ? '🎬 视频分析结果' : '🎧 音频分析结果'}
              </div>
              <div className={styles.analysisFile}>文件: {message.analysis.fileName}</div>
              <div className={styles.analysisTags}>
                {message.analysis.tags.map((tag, i) => (
                  <span key={i} className={styles.analysisTag}>{tag}</span>
                ))}
              </div>
              <div className={styles.analysisSummary}>{message.analysis.summary}</div>

              {message.analysis.scene && (
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                  场景：{message.analysis.scene}
                </div>
              )}
              {message.analysis.emotion && (
                <div style={{ fontSize: 12, color: '#1677ff', marginBottom: 4 }}>
                  情绪：{message.analysis.emotion}
                </div>
              )}
              {message.analysis.voice_style && (
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                  配音建议：{message.analysis.voice_style}
                </div>
              )}

              {message.analysis.music?.detected && (
                <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎵 音乐信息</div>
                  <div style={{ fontSize: 12, color: '#555' }}>
                    {message.analysis.music.genre && <span>类型：{message.analysis.music.genre} </span>}
                    {message.analysis.music.tempo && <span>节奏：{message.analysis.music.tempo} </span>}
                    {message.analysis.music.mood && <span>氛围：{message.analysis.music.mood}</span>}
                  </div>
                  {message.analysis.music.instruments && message.analysis.music.instruments.length > 0 && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      乐器：{message.analysis.music.instruments.join('、')}
                    </div>
                  )}
                </div>
              )}

              {message.analysis.dialogue?.detected && (
                <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>💬 对话信息</div>
                  {message.analysis.dialogue.speakers && message.analysis.dialogue.speakers.length > 0 && (
                    <div style={{ fontSize: 12, color: '#555' }}>
                      说话人：{message.analysis.dialogue.speakers.join('、')}
                    </div>
                  )}
                  {message.analysis.dialogue.language && (
                    <div style={{ fontSize: 12, color: '#555' }}>语言：{message.analysis.dialogue.language}</div>
                  )}
                  {message.analysis.dialogue.content_summary && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      内容摘要：{message.analysis.dialogue.content_summary}
                    </div>
                  )}
                </div>
              )}

              {message.analysis.layers && message.analysis.layers.length > 0 && (
                <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎛️ 音频分层</div>
                  {message.analysis.layers.map((layer, i) => (
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

              {message.analysis.mediaType === 'video' && message.analysis.characters && message.analysis.characters.length > 0 && (
                <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>👥 角色信息</div>
                  {message.analysis.characters.map((ch, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
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

              {message.analysis.mediaType === 'video' && message.analysis.audio?.detected && (
                <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎵 音频信息</div>
                  {message.analysis.audio.music?.detected && (
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                      <div>音乐：{message.analysis.audio.music.genre} · {message.analysis.audio.music.tempo} · {message.analysis.audio.music.mood}</div>
                      {message.analysis.audio.music.instruments && message.analysis.audio.music.instruments.length > 0 && (
                        <div style={{ color: '#888' }}>乐器：{message.analysis.audio.music.instruments.join('、')}</div>
                      )}
                    </div>
                  )}
                  {message.analysis.audio.dialogue?.detected && (
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                      <div>对话：{message.analysis.audio.dialogue.speakers?.join('、')}</div>
                      {message.analysis.audio.dialogue.language && <span>语言：{message.analysis.audio.dialogue.language}</span>}
                    </div>
                  )}
                </div>
              )}

              {message.analysis.mediaType === 'video' && message.analysis.visual && (
                <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎬 视觉信息</div>
                  <div style={{ fontSize: 12, color: '#555' }}>
                    {message.analysis.visual.style && <span>风格：{message.analysis.visual.style} </span>}
                    {message.analysis.visual.color_tone && <span>色调：{message.analysis.visual.color_tone}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    {message.analysis.visual.camera_movement && <span>镜头：{message.analysis.visual.camera_movement} </span>}
                    {message.analysis.visual.lighting && <span>光线：{message.analysis.visual.lighting}</span>}
                  </div>
                  {message.analysis.visual.composition && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>构图：{message.analysis.visual.composition}</div>
                  )}
                </div>
              )}

              {message.analysis.mediaType === 'video' && message.analysis.scenes && message.analysis.scenes.length > 0 && (
                <div style={{ marginBottom: 8, padding: '8px', background: '#f6f6f6', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🎭 场景分层</div>
                  {message.analysis.scenes.map((scene, i) => (
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
            </div>
          )}

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
