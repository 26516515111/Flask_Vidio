import React, { useState } from 'react';
import { Card, Input, Upload, Button, message, Tabs } from 'antd';
import { UploadOutlined, FileImageOutlined } from '@ant-design/icons';
import { ocrApi } from '../services/ocrApi';

const { TextArea } = Input;

interface InputSectionProps {
  onTextExtracted: (text: string, scene: string) => void;
}

const InputSection: React.FC<InputSectionProps> = ({ onTextExtracted }) => {
  const [inputType, setInputType] = useState<'text' | 'image'>('text');
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTextSubmit = () => {
    if (!textInput.trim()) {
      message.error('请输入文字');
      return;
    }
    onTextExtracted(textInput, 'unknown');
  };

  const handleImageUpload = async (file: File) => {
    setLoading(true);
    try {
      const result = await ocrApi.extractText(file);
      onTextExtracted(result.text, result.scene);
      message.success('图片文字提取成功');
    } catch (error) {
      message.error('图片文字提取失败');
    } finally {
      setLoading(false);
    }
    return false;
  };

  return (
    <Card title="输入内容">
      <Tabs activeKey={inputType} onChange={(key) => setInputType(key as 'text' | 'image')}>
        <Tabs.TabPane tab="文字输入" key="text">
          <TextArea
            rows={4}
            placeholder="请输入要转换的文字"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
          <Button
            type="primary"
            onClick={handleTextSubmit}
            style={{ marginTop: 16 }}
          >
            提交
          </Button>
        </Tabs.TabPane>
        <Tabs.TabPane tab="图片上传" key="image">
          <Upload
            beforeUpload={handleImageUpload}
            showUploadList={false}
            accept="image/*"
          >
            <Button icon={<UploadOutlined />} loading={loading}>
              选择图片
            </Button>
          </Upload>
          <div style={{ marginTop: 16, color: '#666' }}>
            <FileImageOutlined /> 支持 JPG、PNG、BMP 等常见图片格式
          </div>
        </Tabs.TabPane>
      </Tabs>
    </Card>
  );
};

export default InputSection;
