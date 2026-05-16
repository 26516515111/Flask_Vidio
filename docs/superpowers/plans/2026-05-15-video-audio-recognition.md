# 视频/音频识别功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有语音转换助手上新增视频识别和音频识别功能，支持 Vercel Blob URL 中转、SSE 流式响应、双模式（场景输入/独立分析）。

**Architecture:** 新建 `api/video.py`、`api/audio.py`、`api/blob-token.py`、`api/blob_cleanup.py` 四个后端模块，前端新建 `videoApi.ts`、`audioApi.ts`、`blobApi.ts` 三个服务，扩展 SettingsDrawer 和 ChatMessage 组件。文件通过 Vercel Blob 客户端直传，后端用 stream:true 中转 SSE 流式响应。

**Tech Stack:** Python 3 / Flask / httpx (后端), React 19 / TypeScript / Ant Design 6 / @vercel/blob (前端)

---

## 并行执行分组

```
Group 1 (并行): Task 1 ─ Task 2 ─ Task 3
         ↓
Group 2 (并行): Task 4 ─ Task 5 ─ Task 6 ─ Task 8 ─ Task 9
         ↓
       Task 7 (app.py 路由)
         ↓
Group 3 (并行): Task 10 ─ Task 11 ─ Task 12
         ↓
Group 4 (并行): Task 13 ─ Task 14
```

---

### Task 1: 安装 @vercel/blob 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 npm 包**

Run: `npm install @vercel/blob`
Expected: 正常安装，无错误。

- [ ] **Step 2: 验证安装**

Run: `node -e "require('@vercel/blob')"`
Expected: 无输出（模块加载成功）。

---

### Task 2: 创建 Blob 清理辅助模块

**Files:**
- Create: `api/blob_cleanup.py`

- [ ] **Step 1: 写入文件**

```python
"""Vercel Blob cleanup helper - delete blobs to free Hobby storage."""
import os
import httpx
from urllib.parse import urlparse


def delete_blob(blob_url: str) -> None:
    """Delete a Vercel Blob file by URL.

    Called by video.py and audio.py in try/finally to ensure
    cleanup regardless of analysis success or failure.
    """
    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
    if not token:
        return

    parsed = urlparse(blob_url)
    delete_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

    try:
        httpx.delete(
            delete_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    except Exception:
        pass  # Best-effort cleanup, don't fail analysis for cleanup errors
```

---

### Task 3: 更新 vercel.json 配置 maxDuration

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: 读取当前文件**

Read `vercel.json` 确认当前内容。

- [ ] **Step 2: 添加 maxDuration 配置**

```json
{
  "functions": {
    "api/video.py": { "maxDuration": 300 },
    "api/audio.py": { "maxDuration": 60 }
  }
}
```

> 如果 vercel.json 已有其他配置，在 `"functions"` 对象内合并添加，不要覆盖已有配置。

---

### Task 4: 创建 Blob Token 端点

**Files:**
- Create: `api/blob-token.py`

- [ ] **Step 1: 写入文件**

```python
"""Vercel Serverless Function: Generate Blob upload token."""
import json
import os


def handler(request):
    """Handle GET /api/blob-token requests (used by api/app.py Flask wrapper)."""
    if request.method != "GET":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    try:
        blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
        if not blob_token:
            return {"statusCode": 500, "body": json.dumps({"error": "BLOB_READ_WRITE_TOKEN not configured"})}

        return {
            "statusCode": 200,
            "body": json.dumps({"token": blob_token, "ok": True}),
        }
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
```

---

### Task 5: 创建视频识别端点

**Files:**
- Create: `api/video.py`

- [ ] **Step 1: 写入文件**

```python
"""Vercel Serverless Function: Video content analysis."""
import json
import os
import re
import httpx
from blob_cleanup import delete_blob


VIDEO_PROMPT = """请分析这个视频的内容。返回JSON格式：
{
  "tags": ["标签1", "标签2"],
  "summary": "视频内容简介，50-100字"
}

要求：
1. tags 是你根据视频内容自动生成的分类标签，如：广告、宣传片、短剧、动画、纪录片、教学、Vlog等
2. summary 是视频内容的简洁描述
3. 只返回JSON，不要其他内容"""


def handler(request):
    """Handle POST /api/video requests (used by api/app.py Flask wrapper)."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    blob_url = None

    try:
        body = json.loads(request.body)
        blob_url = body.get("url", "")

        if not blob_url:
            return {"statusCode": 400, "body": json.dumps({"error": "No video URL provided"})}

        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        result = _call_video_analysis(blob_url, api_key, base_url)
        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    finally:
        if blob_url:
            delete_blob(blob_url)


def _call_video_analysis(video_url: str, api_key: str, base_url: str) -> dict:
    """Call Xiaomi MiMo V2.5 video understanding API."""
    url = f"{base_url}/chat/completions"

    with httpx.Client(timeout=300.0) as client:
        response = client.post(
            url,
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": "mimo-v2.5",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "video_url",
                                "video_url": {"url": video_url},
                                "fps": 2,
                                "media_resolution": "default",
                            },
                            {
                                "type": "text",
                                "text": VIDEO_PROMPT,
                            },
                        ]
                    }
                ],
                "max_completion_tokens": 1024,
                "temperature": 0.3,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi Video API error: {response.text}")

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        # Parse JSON from model response, handling markdown code blocks
        content = re.sub(r"^```(?:json)?\s*", "", content.strip())
        content = re.sub(r"\s*```$", "", content.strip())

        try:
            analysis = json.loads(content)
            return {
                "tags": analysis.get("tags", []),
                "summary": analysis.get("summary", ""),
            }
        except json.JSONDecodeError:
            return {
                "tags": [],
                "summary": content,
            }
```

---

### Task 6: 创建音频识别端点

**Files:**
- Create: `api/audio.py`

- [ ] **Step 1: 写入文件**

```python
"""Vercel Serverless Function: Audio content analysis."""
import json
import os
import re
import httpx
from blob_cleanup import delete_blob


AUDIO_PROMPT = """请分析这个音频的内容。返回JSON格式：
{
  "tags": ["标签1", "标签2"],
  "summary": "音频内容简介，50-100字"
}

要求：
1. tags 是你根据音频内容自动生成的分类标签，如：音乐、台词、背景音、音效、对话、旁白、环境音等
2. summary 是音频内容的简洁描述
3. 只返回JSON，不要其他内容"""


def handler(request):
    """Handle POST /api/audio requests (used by api/app.py Flask wrapper)."""
    if request.method != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    blob_url = None

    try:
        body = json.loads(request.body)
        blob_url = body.get("url", "")

        if not blob_url:
            return {"statusCode": 400, "body": json.dumps({"error": "No audio URL provided"})}

        api_key = os.environ.get("XIAOMI_TOKENPLAN_API_KEY", "")
        base_url = os.environ.get("XIAOMI_TOKENPLAN_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

        if not api_key:
            return {"statusCode": 500, "body": json.dumps({"error": "API key not configured"})}

        result = _call_audio_analysis(blob_url, api_key, base_url)
        return {"statusCode": 200, "body": json.dumps(result, ensure_ascii=False)}

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    finally:
        if blob_url:
            delete_blob(blob_url)


def _call_audio_analysis(audio_url: str, api_key: str, base_url: str) -> dict:
    """Call Xiaomi MiMo V2.5 audio understanding API."""
    url = f"{base_url}/chat/completions"

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            url,
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "model": "mimo-v2.5",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_audio",
                                "input_audio": {"data": audio_url},
                            },
                            {
                                "type": "text",
                                "text": AUDIO_PROMPT,
                            },
                        ]
                    }
                ],
                "max_completion_tokens": 1024,
                "temperature": 0.3,
            },
        )

        if response.status_code != 200:
            raise Exception(f"Xiaomi Audio API error: {response.text}")

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        # Parse JSON from model response, handling markdown code blocks
        content = re.sub(r"^```(?:json)?\s*", "", content.strip())
        content = re.sub(r"\s*```$", "", content.strip())

        try:
            analysis = json.loads(content)
            return {
                "tags": analysis.get("tags", []),
                "summary": analysis.get("summary", ""),
            }
        except json.JSONDecodeError:
            return {
                "tags": [],
                "summary": content,
            }
```

---

### Task 7: 注册新路由

**Files:**
- Modify: `api/app.py`

- [ ] **Step 1: 在 api/app.py 中添加路由**

在现有 import 区域（第17-19行）添加：

```python
from blob_token import handler as blob_token_handler
from video import handler as video_handler
from audio import handler as audio_handler
```

在 OCR 路由（第69-78行）之后、health 路由之前添加：

```python
@app.route("/api/blob-token", methods=["GET"])
def blob_token_route():
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(blob_token_handler, wrapper)


@app.route("/api/video", methods=["POST", "OPTIONS"])
def video_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(video_handler, wrapper)


@app.route("/api/audio", methods=["POST", "OPTIONS"])
def audio_route():
    if request.method == "OPTIONS":
        return "", 204
    wrapper = RequestWrapper(
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )
    return _call_handler(audio_handler, wrapper)
```

---

### Task 8: 扩展类型定义

**Files:**
- Modify: `src/types/chat.ts`

- [ ] **Step 1: 更新文件**

`src/types/chat.ts` 当前内容已完整了解。需做以下修改：

1. 第29行 `InputMode` 改为 `'text' | 'image' | 'video' | 'audio'`
2. 在 `ChatMessage` 接口中添加 `type` 和 `analysis` 字段
3. 在 `ChatState` 接口后添加 `MediaAnalysis` 接口

```typescript
// 第29行修改：
export type InputMode = 'text' | 'image' | 'video' | 'audio';

// ChatMessage 接口（第1-13行）扩展，新增第8行之后：
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  originalText?: string;
  processedText?: string;
  detectedEmotion?: string;
  audioUrl?: string;
  styleTags?: string;
  audioTags?: string[];
  isProcessing?: boolean;
  type?: 'message' | 'analysis';
  analysis?: MediaAnalysis;
}

// 在 ChatMessage 接口之后、Conversation 之前新增：
export interface MediaAnalysis {
  tags: string[];
  summary: string;
  mediaType: 'video' | 'audio';
  fileName: string;
}
```

---

### Task 9: 扩展 Settings Redux State

**Files:**
- Modify: `src/store/settingsSlice.ts`

- [ ] **Step 1: 更新 SettingsState（第4-17行）**

在 `drawerOpen` 之前添加一行：

```typescript
mediaAnalysisMode: 'scene' | 'standalone';
```

完整 initialState：

```typescript
const initialState: SettingsState = {
  inputMode: 'text',
  imageUrl: null,
  scene: '',
  selectedVoice: '',
  directorMode: false,
  character: '',
  direction: '',
  selectedEmotion: '',
  selectedProcessing: '',
  customVoiceFile: null,
  customVoiceName: '',
  mediaAnalysisMode: 'scene',
  drawerOpen: false,
};
```

- [ ] **Step 2: 添加新 reducer**

在 `resetSettings` reducer（第59行）之后，slice 的 reducers 对象内添加：

```typescript
setMediaAnalysisMode: (state, action: PayloadAction<'scene' | 'standalone'>) => {
  state.mediaAnalysisMode = action.payload;
},
```

- [ ] **Step 3: 导出新 action**

在文件末尾 export 列表（第63-77行）中添加 `setMediaAnalysisMode`：

```typescript
export const {
  setInputMode,
  setImageUrl,
  setScene,
  setSelectedVoice,
  setDirectorMode,
  setCharacter,
  setDirection,
  setSelectedEmotion,
  setSelectedProcessing,
  setCustomVoiceFile,
  setCustomVoiceName,
  setMediaAnalysisMode,
  setDrawerOpen,
  resetSettings,
} = settingsSlice.actions;
```

---

### Task 10: 创建 Blob 上传前端 Service

**Files:**
- Create: `src/services/blobApi.ts`

- [ ] **Step 1: 写入文件**

```typescript
import { upload } from '@vercel/blob';
import api from './api';

export const blobApi = {
  /** Get upload token from backend */
  getUploadToken: async () => {
    const response = await api.get('/blob-token');
    return response.data;
  },

  /** Upload file to Vercel Blob, return public URL */
  upload: async (file: File): Promise<string> => {
    const tokenData = await blobApi.getUploadToken();
    const result = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/blob-token',
      token: tokenData.token,
    });
    return result.url;
  },
};
```

---

### Task 11: 创建视频分析前端 Service

**Files:**
- Create: `src/services/videoApi.ts`

- [ ] **Step 1: 写入文件**

```typescript
import api from './api';

export interface VideoAnalysisResult {
  tags: string[];
  summary: string;
}

export const videoApi = {
  analyze: async (url: string): Promise<VideoAnalysisResult> => {
    const response = await api.post('/video', { url });
    return response.data;
  },
};
```

---

### Task 12: 创建音频分析前端 Service

**Files:**
- Create: `src/services/audioApi.ts`

- [ ] **Step 1: 写入文件**

```typescript
import api from './api';

export interface AudioAnalysisResult {
  tags: string[];
  summary: string;
}

export const audioApi = {
  analyze: async (url: string): Promise<AudioAnalysisResult> => {
    const response = await api.post('/audio', { url });
    return response.data;
  },
};
```

---

### Task 13: 扩展 SettingsDrawer 组件

**Files:**
- Modify: `src/components/SettingsDrawer.tsx`

需要做以下改动：
1. 导入新依赖（blobApi, videoApi, audioApi, setMediaAnalysisMode, 新图标）
2. 扩展输入模式类型（第34行 sceneInputMode 改为支持 video/audio）
3. 新增视频/音频 Tab 的 UI 和处理逻辑
4. 新增双模式开关

详见子任务 13a-13e。

- [ ] **Step 13a: 更新 import 语句**

在第1-20行 import 区域添加：

```typescript
import { VideoCameraAddOutlined, AudioOutlined, SwapOutlined } from '@ant-design/icons';
import { blobApi } from '../services/blobApi';
import { videoApi } from '../services/videoApi';
import { audioApi } from '../services/audioApi';
import { setMediaAnalysisMode } from '../store/settingsSlice';
```

- [ ] **Step 13b: 扩展状态变量**

在第34-37行状态区域，替换 `sceneInputMode` 类型并添加新状态：

```typescript
const [sceneInputMode, setSceneInputMode] = useState<'text' | 'image' | 'video' | 'audio'>('text');
const [ocrLoading, setOcrLoading] = useState(false);
const [ocrResult, setOcrResult] = useState<string>('');
const [uploadedFile, setUploadedFile] = useState<UploadFile | null>(null);
const [mediaAnalysisResult, setMediaAnalysisResult] = useState<{
  tags: string[];
  summary: string;
  fileName: string;
} | null>(null);
const [mediaLoading, setMediaLoading] = useState(false);
const [uploadProgress, setUploadProgress] = useState<number>(0);
```

- [ ] **Step 13c: 添加视频/音频处理函数**

在 `handleCancelOcr` 函数（第75-78行）之后添加：

```typescript
const handleVideoUpload = async (file: File) => {
  setMediaLoading(true);
  setUploadedFile({ uid: file.name, name: file.name, status: 'uploading' });

  try {
    const blobUrl = await blobApi.upload(file);
    setUploadedFile({ uid: file.name, name: file.name, status: 'done' });

    const result = await videoApi.analyze(blobUrl);
    setMediaAnalysisResult({
      tags: result.tags,
      summary: result.summary,
      fileName: file.name,
    });
    message.success('视频分析完成');
  } catch (error) {
    console.error('Video analysis failed:', error);
    message.error('视频分析失败，请重试');
    setUploadedFile({ uid: file.name, name: file.name, status: 'error' });
  } finally {
    setMediaLoading(false);
  }

  return false;
};

const handleAudioUpload = async (file: File) => {
  setMediaLoading(true);
  setUploadedFile({ uid: file.name, name: file.name, status: 'uploading' });

  try {
    const blobUrl = await blobApi.upload(file);
    setUploadedFile({ uid: file.name, name: file.name, status: 'done' });

    const result = await audioApi.analyze(blobUrl);
    setMediaAnalysisResult({
      tags: result.tags,
      summary: result.summary,
      fileName: file.name,
    });
    message.success('音频分析完成');
  } catch (error) {
    console.error('Audio analysis failed:', error);
    message.error('音频分析失败，请重试');
    setUploadedFile({ uid: file.name, name: file.name, status: 'error' });
  } finally {
    setMediaLoading(false);
  }

  return false;
};

const handleConfirmMediaScene = () => {
  if (!mediaAnalysisResult) return;
  dispatch(setScene(mediaAnalysisResult.summary));
  setMediaAnalysisResult(null);
  setUploadedFile(null);
  message.success('场景描述已保存');
};

const handleConfirmMediaAnalysis = () => {
  if (!mediaAnalysisResult) return;
  const analysisMessage: ChatMessage = {
    id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role: 'assistant',
    content: '',
    type: 'analysis',
    analysis: {
      tags: mediaAnalysisResult.tags,
      summary: mediaAnalysisResult.summary,
      mediaType: sceneInputMode as 'video' | 'audio',
      fileName: mediaAnalysisResult.fileName,
    },
    timestamp: Date.now(),
  };
  // 需要从 Home.tsx 传入 dispatch，这里通过 onConfirmAnalysis prop 回调
  // 见 Task 14 的 Home.tsx 配合改动
  onConfirmAnalysis?.(analysisMessage);
  setMediaAnalysisResult(null);
  setUploadedFile(null);
  message.success('分析结果已发送');
};

const handleCancelMedia = () => {
  setMediaAnalysisResult(null);
  setUploadedFile(null);
};
```

- [ ] **Step 13d: 更新 SettingsDrawerProps 接口**

第26-29行 props 接口添加：

```typescript
interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirmAnalysis?: (msg: import('../types/chat').ChatMessage) => void;
}
```

- [ ] **Step 13e: 更新 Radio.Group 和添加视频/音频 Tab UI**

将第92-106行的 Radio.Button 组替换为：

```tsx
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
```

在第166行（currentScene 判断之后、`</div>` 之前，即第167行附近）添加：

```tsx
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
          ? `正在上传${sceneInputMode === 'video' ? '视频' : '音频'}...`
          : `选择${sceneInputMode === 'video' ? '视频' : '音频'}文件`}
      </Button>
    </Upload>

    {uploadedFile && (
      <div className={styles.uploadedFile}>
        {sceneInputMode === 'video' ? <VideoCameraAddOutlined /> : <AudioOutlined />} {uploadedFile.name}
      </div>
    )}

    {mediaAnalysisResult && (
      <div className={styles.ocrResult}>
        <div className={styles.ocrResultLabel}>
          {sceneInputMode === 'video' ? '视频' : '音频'}分析结果
        </div>
        <div className={styles.mediaTags}>
          {mediaAnalysisResult.tags.map((tag, i) => (
            <span key={i} className={styles.mediaTag}>{tag}</span>
          ))}
        </div>
        <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
          {mediaAnalysisResult.summary}
        </div>

        {/* 双模式开关 */}
        <div className={styles.modeSwitch}>
          <span className={styles.modeLabel}>输出模式：</span>
          <Radio.Group
            value={settings.mediaAnalysisMode}
            onChange={(e) => dispatch(setMediaAnalysisMode(e.target.value))}
            optionType="button"
            size="small"
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
          <Button
            type="primary"
            size="small"
            onClick={settings.mediaAnalysisMode === 'scene' ? handleConfirmMediaScene : handleConfirmMediaAnalysis}
          >
            {settings.mediaAnalysisMode === 'scene' ? '确认使用' : '发送分析结果'}
          </Button>
          <Button size="small" onClick={handleCancelMedia}>
            取消
          </Button>
        </div>
      </div>
    )}
  </div>
)}
```

---

### Task 14: 扩展 ChatMessage 组件 + Home.tsx 回调

**Files:**
- Modify: `src/components/ChatMessage.tsx`
- Modify: `src/pages/Home.tsx`

- [ ] **Step 14a: ChatMessage.tsx 分析结果渲染**

在 ChatMessage.tsx 的 bubble 内容区域（第53行的 `{message.isProcessing && ...}` 之前）添加分析结果渲染：

```tsx
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
  </div>
)}
```

- [ ] **Step 14b: Home.tsx 传入 onConfirmAnalysis 回调**

在 Home.tsx 的 SettingsDrawer 使用处（第173-176行）添加 prop：

```tsx
<SettingsDrawer
  open={settingsOpen}
  onClose={() => dispatch(setDrawerOpen(false))}
  onConfirmAnalysis={(msg) => dispatch(addMessage(msg))}
/>
```

---

## 验证测试

全部 Task 完成后执行：

- [ ] **后端启动测试**: `python api_server.py` 确认无 import 错误
- [ ] **前端构建测试**: `npm run build` 确认 TypeScript 无错误
- [ ] **LSP 诊断**: 对所有修改文件运行 lsp_diagnostics
