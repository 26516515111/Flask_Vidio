import React, { useState } from 'react';
import { Card, Select, Button, message, Tag, Space, Switch, Input } from 'antd';
import { SmileOutlined, MehOutlined, FrownOutlined } from '@ant-design/icons';
import { llmApi } from '../services/llmApi';

const { Option } = Select;
const { TextArea } = Input;

interface SceneInterpretationProps {
  text: string;
  scene: string;
  onProcessed: (processedText: string, emotion: string) => void;
  // Director Mode props
  directorMode: boolean;
  character: string;
  direction: string;
  onDirectorModeChange: (mode: boolean) => void;
  onCharacterChange: (character: string) => void;
  onDirectionChange: (direction: string) => void;
  onDirectorProcessed: (processedText: string, styleTags: string, audioTags: string[], rawOutput: string) => void;
}

const emotions = [
  { value: 'happy', label: '开心', icon: <SmileOutlined />, color: 'green' },
  { value: 'neutral', label: '平静', icon: <MehOutlined />, color: 'blue' },
  { value: 'sad', label: '悲伤', icon: <FrownOutlined />, color: 'gray' },
  { value: 'angry', label: '愤怒', icon: <FrownOutlined />, color: 'red' },
  { value: 'excited', label: '兴奋', icon: <SmileOutlined />, color: 'orange' },
];

const processingTypes = [
  { value: 'polish', label: '文本润色' },
  { value: 'enhance', label: '情绪增强' },
  { value: 'expand', label: '内容扩展' },
  { value: 'convert', label: '风格转换' },
];

const SceneInterpretation: React.FC<SceneInterpretationProps> = ({
  text,
  scene,
  onProcessed,
  directorMode,
  character,
  direction,
  onDirectorModeChange,
  onCharacterChange,
  onDirectionChange,
  onDirectorProcessed,
}) => {
  const [selectedEmotion, setSelectedEmotion] = useState<string>('neutral');
  const [selectedProcessing, setSelectedProcessing] = useState<string>('polish');
  const [loading, setLoading] = useState(false);
  const [editableScene, setEditableScene] = useState(scene);

  const handleProcess = async () => {
    if (!text.trim()) {
      message.error('请先输入或提取文字');
      return;
    }

    setLoading(true);
    try {
      const result = await llmApi.processText(
        text,
        scene,
        selectedEmotion,
        selectedProcessing,
      );
      onProcessed(result.processed_text, result.detected_emotion);
      message.success('文字处理完成');
    } catch (error) {
      message.error('文字处理失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectorProcess = async () => {
    if (!text.trim() || !character.trim() || !direction.trim()) {
      message.error('请填写完整信息');
      return;
    }
    setLoading(true);
    try {
      const result = await llmApi.processDirector(text, editableScene, character, direction);
      onDirectorProcessed(result.processed_text, result.style_tags, result.audio_tags, result.raw_output);
      message.success('导演模式处理完成');
    } catch (error) {
      message.error('处理失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="场景演绎">
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>导演模式</span>
          <Switch checked={directorMode} onChange={onDirectorModeChange} />
        </div>

        {directorMode ? (
          <>
            <div>
              <span style={{ marginBottom: 4, display: 'block' }}>角色：</span>
              <TextArea
                value={character}
                onChange={(e) => onCharacterChange(e.target.value)}
                placeholder="描述角色特征"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>

            <div>
              <span style={{ marginBottom: 4, display: 'block' }}>场景：</span>
              <TextArea
                value={editableScene}
                onChange={(e) => setEditableScene(e.target.value)}
                placeholder="描述场景"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>

            <div>
              <span style={{ marginBottom: 4, display: 'block' }}>指导：</span>
              <TextArea
                value={direction}
                onChange={(e) => onDirectionChange(e.target.value)}
                placeholder="导演指导说明"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>

            <Button
              type="primary"
              onClick={handleDirectorProcess}
              loading={loading}
              block
            >
              导演处理
            </Button>
          </>
        ) : (
          <>
            <div>
              <span style={{ marginRight: 8 }}>场景：</span>
              <Tag color="blue">{scene || '未指定'}</Tag>
            </div>

            <div>
              <span style={{ marginRight: 8 }}>情绪：</span>
              <Select
                value={selectedEmotion}
                onChange={setSelectedEmotion}
                style={{ width: 120 }}
              >
                {emotions.map((emotion) => (
                  <Option key={emotion.value} value={emotion.value}>
                    <Space>
                      {emotion.icon}
                      {emotion.label}
                    </Space>
                  </Option>
                ))}
              </Select>
            </div>

            <div>
              <span style={{ marginRight: 8 }}>加工方式：</span>
              <Select
                value={selectedProcessing}
                onChange={setSelectedProcessing}
                style={{ width: 120 }}
              >
                {processingTypes.map((type) => (
                  <Option key={type.value} value={type.value}>
                    {type.label}
                  </Option>
                ))}
              </Select>
            </div>

            <Button
              type="primary"
              onClick={handleProcess}
              loading={loading}
              block
            >
              开始处理
            </Button>
          </>
        )}
      </Space>
    </Card>
  );
};

export default SceneInterpretation;
