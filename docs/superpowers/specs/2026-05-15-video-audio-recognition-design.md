# 视频/音频识别功能设计文档

**日期**: 2026-05-15
**状态**: 已验证（Context7 官方文档交叉验证）
**范围**: 在现有 OCR 基础上新增视频识别和音频识别功能

---

## 1. 目标

扩展现有语音转换助手，新增两种媒体识别能力：

- **视频识别**: 识别视频内容，自动打 Tag，生成内容简介
- **音频识别**: 识别音频内容（音乐、台词、背景音、音效），自动打 Tag，生成内容简介

两种使用模式：
1. **场景输入模式**: 识别结果作为 TTS 的场景描述输入（和现有 OCR 流程一致）
2. **独立分析模式**: 识别结果作为消息展示在对话流中

---

## 2. 核心技术决策

### 2.1 文件传输：Vercel Blob 中转

**问题**: Vercel Serverless Function 请求体限制为 4.5MB（所有计划统一），无法直接传输视频/音频文件。

**方案**: 客户端直传 Vercel Blob → 获取 URL → 后端接收 URL → 转发给 Xiaomi API。

```
浏览器 ──直传──▶ Vercel Blob ──返回 URL──▶ 浏览器
                                              │
                              POST /api/video { url, mode }
                                              │
                                   后端 ──stream──▶ Xiaomi API
                                              │
                                   SSE 流式转发 ──▶ 浏览器实时显示
                                              │
                                   ┌─ 分析完成 ─┘
                                   │
                            后端调用 del() ──▶ Vercel Blob 删除文件
                                   │
                              释放存储空间 ✅
```

**优势**:
- 绕过 4.5MB 函数请求体限制
- API Key 不暴露给前端（安全）
- Vercel Hobby 计划可用 Blob 存储

### 2.2 流式响应：避免超时

**问题**: 视频分析耗时较长，需避免 Vercel 函数超时。

**方案**: Xiaomi API 设置 `stream: true`，后端 SSE 流式中转。

```python
# 调用 Xiaomi API 时开启流式
response = client.chat.completions.create(
    model="mimo-v2.5",
    stream=True,  # 开启流式
    messages=[...]
)
# 逐块转发 SSE 到前端
for chunk in response:
    yield f"data: {json.dumps(chunk)}\n\n"
```

**好处**:
- 用户看到分析结果逐字出现（体验好）
- 持续传数据避免 Vercel 300s 超时
- Hobby 计划 Fluid Compute 默认支持 300s 最大时长

### 2.3 Vercel 部署配置

```json
// vercel.json - 为视频端点增加超时
{
  "functions": {
    "api/video.py": { "maxDuration": 300 },
    "api/audio.py": { "maxDuration": 60 }
  }
}
```

| 端点 | maxDuration | 原因 |
|------|-------------|------|
| `/api/video` | 300s | 大视频分析耗时长 |
| `/api/audio` | 60s | 音频分析较快 |
| `/api/blob-token` | 10s | 轻量 token 交换 |

---

## 3. 技术方案

### 3.1 模型选择

使用 `mimo-v2.5` 多模态模型，通过 Token Plan 端点 `token-plan-cn.xiaomimimo.com/v1` 调用。

#### 视频输入格式（官方文档验证 ✅）

```json
{
  "type": "video_url",
  "video_url": {"url": "https://blob.vercel-storage.com/xxx/video.mp4"},
  "fps": 2,
  "media_resolution": "default"
}
```

#### 音频输入格式（官方文档验证 ✅）

注意：官方格式为 `input_audio`，非 `audio_url`。

```json
{
  "type": "input_audio",
  "input_audio": {"data": "https://blob.vercel-storage.com/xxx/audio.wav"}
}
```

### 3.2 后端 API

#### `api/blob-token.py` - Vercel Blob 上传凭证（新增）

```
GET /api/blob-token

处理流程:
1. 使用 BLOB_READ_WRITE_TOKEN 生成客户端上传 token
2. 返回 token 给前端

响应: { "token": "...", "url": "..." }
```

#### `api/blob_cleanup.py` - Vercel Blob 清理辅助（新增）

video.py 和 audio.py 共用的清理逻辑，分析完成后删除 Blob 文件释放存储。

```python
import os
import httpx
from urllib.parse import urlparse

def delete_blob(blob_url: str):
    """删除 Vercel Blob 文件，释放 Hobby 计划 1GB 存储空间。"""
    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
    parsed = urlparse(blob_url)
    # Vercel Blob REST API: DELETE https://{host}/{pathname}
    delete_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    httpx.delete(
        delete_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10.0,
    )
```

video.py 和 audio.py 中在 try/finally 中调用 `delete_blob()`：无论分析成功或失败，都释放 Blob 存储。

#### `api/video.py` - 视频识别

```
POST /api/video
Content-Type: application/json

请求体: { "url": "https://blob.vercel-storage.com/...", "mode": "scene|standalone" }

处理流程:
1. 接收 Blob URL + 分析模式
2. 调用 mimo-v2.5 API（stream: true）
   - content: [video_url(Blob URL), text(prompt)]
   - 使用 api-key header（Token Plan 端点用此认证方式）
3. SSE 流式转发分析结果
4. 解析完整 JSON 后返回 { tags, summary }
5. 无论成功失败，调用 del() 删除 Blob 文件（释放存储空间）

响应: SSE 流 → 最终 { "tags": ["广告", "产品展示"], "summary": "..." }
```

#### `api/audio.py` - 音频识别

```
POST /api/audio
Content-Type: application/json

请求体: { "url": "https://blob.vercel-storage.com/...", "mode": "scene|standalone" }

处理流程:
1. 接收 Blob URL + 分析模式
2. 调用 mimo-v2.5 API（stream: true）
   - content: [input_audio(Blob URL), text(prompt)]
3. SSE 流式转发分析结果
4. 解析完整 JSON 后返回 { tags, summary }
5. 无论成功失败，调用 del() 删除 Blob 文件（释放存储空间）

响应: SSE 流 → 最终 { "tags": ["音乐", "背景音"], "summary": "..." }
```

#### `api/app.py` 路由注册

```python
from blob_token import handler as blob_token_handler
from video import handler as video_handler
from audio import handler as audio_handler

@app.route("/api/blob-token", methods=["GET"])
def blob_token_route():
    ...

@app.route("/api/video", methods=["POST", "OPTIONS"])
def video_route():
    # 和现有 ocr_route 结构一致

@app.route("/api/audio", methods=["POST", "OPTIONS"])
def audio_route():
    # 和现有 ocr_route 结构一致
```

### 3.3 前端 Service

#### `src/services/videoApi.ts`

```typescript
import api from './api';

export const videoApi = {
  // SSE 流式分析
  analyzeStream: async (
    url: string,
    mode: 'scene' | 'standalone',
    onChunk: (text: string) => void,
  ): Promise<{ tags: string[]; summary: string }> => {
    const response = await fetch('/api/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mode }),
    });
    // 读取 SSE 流
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      // 解析 SSE: data: {...}
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.text) {
            fullText += data.text;
            onChunk(fullText);
          }
        }
      }
    }
    // 从完整文本中解析 JSON
    return JSON.parse(fullText);
  },
};
```

#### `src/services/audioApi.ts`

结构同上，调用 `/api/audio` 端点。

#### `src/services/blobApi.ts`（新增）

```typescript
export const blobApi = {
  getUploadToken: async () => {
    const response = await api.get('/blob-token');
    return response.data;
  },
};
```

### 3.4 类型定义

#### `types/chat.ts` 扩展

```typescript
// 扩展 InputMode
export type InputMode = 'text' | 'image' | 'video' | 'audio';

// 新增分析结果类型
export interface MediaAnalysis {
  tags: string[];
  summary: string;
  mediaType: 'video' | 'audio';
  fileName: string;
}

// ChatMessage 扩展
export interface ChatMessage {
  // ... 现有字段
  type?: 'message' | 'analysis';  // 区分普通消息和分析结果
  analysis?: MediaAnalysis;        // 分析结果数据
}
```

#### `store/settingsSlice.ts` 扩展

```typescript
interface SettingsState {
  // ... 现有字段
  mediaAnalysisMode: 'scene' | 'standalone';  // 双模式开关
}

// 新增 reducer
setMediaAnalysisMode: (state, action: PayloadAction<'scene' | 'standalone'>) => {
  state.mediaAnalysisMode = action.payload;
}
```

### 3.5 UI 设计

#### Settings Drawer 扩展

场景描述区域的 Radio 切换从两个选项扩展为四个:

```
[文字输入] [图片OCR] [视频识别] [音频识别]
```

视频/音频 Tab 的 UI:

```
┌─────────────────────────────────────┐
│  [上传视频/音频 按钮]                 │
│  上传进度: ████████░░ 80%            │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  分析结果（流式出现）         │   │
│  │  🔖 Tag: 广告, 产品展示      │   │
│  │  📝 简介: 一段30秒的手机广告..│   │
│  └─────────────────────────────┘   │
│                                     │
│  [作为场景输入] [仅分析]  ← 模式开关 │
│                                     │
│  [确认使用]  [取消]                 │
└─────────────────────────────────────┘
```

双模式开关:
- **作为场景输入**（默认）: 确认后，summary 填入 `settings.scene`
- **仅分析**: 确认后，结果作为 assistant 消息加入对话流

#### ChatMessage 组件扩展

识别"仅分析"模式的消息，渲染特殊样式:

```
┌─────────────────────────────────────┐
│ 🤖 [视频分析结果]                    │
│                                     │
│ 🔖 标签: 广告, 产品展示              │
│ 📝 内容: 一段30秒的手机广告，展示... │
│                                     │
│ 14:32                               │
└─────────────────────────────────────┘
```

通过 `message.type === 'analysis'` 判断渲染分支。

### 3.6 仅分析模式的消息派发

```typescript
const analysisMessage: ChatMessage = {
  id: generateId(),
  role: 'assistant',
  content: '',
  type: 'analysis',
  analysis: {
    tags: result.tags,
    summary: result.summary,
    mediaType: 'video', // 或 'audio'
    fileName: file.name,
  },
  timestamp: Date.now(),
};
dispatch(addMessage(analysisMessage));
```

---

## 4. 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 新建 | `api/blob-token.py` | Vercel Blob 上传 token 生成 |
| 新建 | `api/blob_cleanup.py` | Vercel Blob 文件删除辅助（供 video/audio 调用） |
| 新建 | `api/video.py` | 视频识别后端（SSE 流式） |
| 新建 | `api/audio.py` | 音频识别后端（SSE 流式） |
| 修改 | `api/app.py` | 注册新路由 |
| 修改 | `vercel.json` | 配置 maxDuration |
| 新建 | `src/services/blobApi.ts` | Blob 上传/清理 service |
| 新建 | `src/services/videoApi.ts` | 视频 API 服务（SSE 读取） |
| 新建 | `src/services/audioApi.ts` | 音频 API 服务（SSE 读取） |
| 修改 | `src/types/chat.ts` | 扩展类型定义 |
| 修改 | `src/store/settingsSlice.ts` | 新增 mediaAnalysisMode |
| 修改 | `src/components/SettingsDrawer.tsx` | 增加视频/音频 Tab + 上传/流式展示 |
| 修改 | `src/components/ChatMessage.tsx` | 渲染分析结果消息 |
| 安装 | `@vercel/blob` | npm 依赖（前端） |

---

## 5. Prompt 设计

### 视频分析 Prompt

```
请分析这个视频的内容。返回JSON格式：
{
  "tags": ["标签1", "标签2"],
  "summary": "视频内容简介，50-100字"
}

要求：
1. tags 是你根据视频内容自动生成的分类标签，如：广告、宣传片、短剧、动画、纪录片、教学、Vlog等
2. summary 是视频内容的简洁描述
3. 只返回JSON，不要其他内容
```

### 音频分析 Prompt

```
请分析这个音频的内容。返回JSON格式：
{
  "tags": ["标签1", "标签2"],
  "summary": "音频内容简介，50-100字"
}

要求：
1. tags 是你根据音频内容自动生成的分类标签，如：音乐、台词、背景音、音效、对话、旁白、环境音等
2. summary 是音频内容的简洁描述
3. 只返回JSON，不要其他内容
```

---

## 6. 约束与限制

### 文件限制
- **视频**: 建议 < 500MB，支持 mp4/webm/avi
- **音频**: 官方限制 100MB（URL 方式），支持 mp3/wav/m4a

### Vercel 部署限制
- **Hobby**: 最大时长 300s（Fluid Compute 默认启用），满足视频分析需求
- **请求体**: 统一 4.5MB 限制（已通过 Blob URL 中转解决）

### Vercel Blob Hobby 免费额度
| 项目 | 免费额度 | 策略 |
|------|---------|------|
| 存储空间 | **1 GB/月** | 分析完立即 `del()` 删除 |
| 数据传输 | **10 GB/月** | 客户端上传不计费，Xiaomi API 拉取才计 |
| 客户端上传 | 不计费 | 浏览器直传 Blob |

> **清理策略确认**: Hobby 免费，用后即删可确保 1GB 存储限制不被超出。

### 其他
- **Tag**: 由 LLM 自由生成，不限于预定义枚举
- **流式输出**: 前端通过 fetch reader 接收 SSE 实时展示

## 7. API 认证方式说明

当前项目使用两种认证头：

| 端点 | Header | 原因 |
|------|--------|------|
| Text/OCR/LLM (`api/ocr.py`, `api/llm.py`) | `Authorization: Bearer {key}` | Token Plan 端点兼容 |
| TTS (`api/tts.py`) | `api-key: {key}` | 官方文档标准格式 |
| Video/Audio（本设计） | `api-key: {key}` | 与 TTS 统一，使用官方标准头 |

建议：后续统一所有端点使用 `api-key` header，与 Xiaomi 官方文档一致。

---

## 8. 旧方案 vs 新方案对比

| 项目 | 旧设计（第一版） | 新设计（已验证） |
|------|-----------------|-----------------|
| 音频格式 | `audio_url` | `input_audio`（官方格式） |
| 文件传输 | base64 编码 → 函数请求体 | Vercel Blob URL → 轻量 JSON |
| 响应方式 | 一次性返回 | SSE 流式逐字返回 |
| Hobby 超时 | 不知道能否撑住 | 300s（Fluid Compute 保证） |
| base64 膨胀 | 500MB → 667MB 内存爆炸 | 不涉及 |
