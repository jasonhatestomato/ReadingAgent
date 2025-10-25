# Reading Agent 前端设计文档

## 一、总体架构

### 1.1 技术栈
- **框架**: Vue 3 (组件化开发)
- **UI 库**: Bootstrap 5 (响应式布局)
- **图标**: Font Awesome
- **PDF 渲染**: PDF.js
- **Markdown 渲染**: Marked.js

### 1.2 设计风格
- **macOS 风格**: 浅灰色背景 (#f5f5f7)，圆角面板 (12px)，柔和阴影
- **响应式**: 支持拖拽调整面板宽度
- **交互友好**: 平滑过渡动画，hover 效果，加载提示

### 1.3 状态管理
```javascript
// localStorage (持久化)
- user_id: 用户标识
- layout_config: 布局配置（面板宽度、折叠状态）

// sessionStorage (页面级)
- session_id: 当前会话 ID

// Vue 响应式数据
- 布局状态: leftPanelCollapsed, rightPanelCollapsed
- 文件状态: pdfLoaded, isPdfUploaded
- 聊天状态: chatHistory, isSending, isInputEnabled
```

---

## 二、页面结构

### 2.1 欢迎页 (welcome.html)

#### **功能**
1. 用户身份验证（输入 user_id）
2. 显示用户的会话列表
3. 创建新会话

#### **页面结构**
```
┌─────────────────────────────────┐
│       认证区域 (auth-section)    │
│  ┌─────────────────────────────┐│
│  │ 输入 user_id                ││
│  │ [确认] 按钮                 ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘

┌─────────────────────────────────┐
│   会话列表区域 (sessions-section)│
│  ┌─────────────────────────────┐│
│  │ 用户信息栏                  ││
│  ├─────────────────────────────┤│
│  │ 会话项 1: 标题 + 时间       ││
│  │ 会话项 2: 标题 + 时间       ││
│  │ ...                         ││
│  ├─────────────────────────────┤│
│  │ [+ 新建会话] 按钮           ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
```

#### **核心函数**
```javascript
// welcome.js
handleConfirmUser()        // 验证并保存 user_id
loadUserSessions(userId)   // 加载用户会话列表
displaySessions(sessions)  // 渲染会话列表
handleSessionClick(sid)    // 跳转到主页面
handleNewSession()         // 创建新会话
formatDateTime(str)        // 格式化时间显示
```

#### **API 调用**
```javascript
GET /api/sessions?user_id={userId}
返回: { success: true, sessions: [...] }
```

---

### 2.2 主页面 (index.html)

#### **功能**
1. 左侧：PDF 上传和预览
2. 中间：与 AI 的对话交互
3. 右侧：预留功能区（当前为空）
4. 支持面板折叠、拖拽调整宽度

#### **三栏布局**
```
┌──────────────────────────────────────────────┐
│              顶部导航栏 (navbar)              │
├──────┬───────────────────────┬───────────────┤
│      │                       │               │
│  PDF │       聊天区域        │   功能区域    │
│  面板│    (chat-panel)       │  (content-    │
│ (pdf │                       │   panel)      │
│ panel)│  ┌─────────────────┐ │               │
│      │  │ 对话历史        │ │   (预留)      │
│      │  │ - 用户消息      │ │               │
│      │  │ - AI 回复       │ │               │
│      │  └─────────────────┘ │               │
│      │  ┌─────────────────┐ │               │
│      │  │ 输入框 [发送]   │ │               │
│      │  └─────────────────┘ │               │
│      │                       │               │
│      │                       │               │
└──────┴───────────────────────┴───────────────┘
 [<]   │                       │          [>]
       拖拽调整                  拖拽调整
```

#### **交互元素**
- **折叠按钮**: 左上角 `[<]` / 右上角 `[>]`
- **拖拽手柄**: 面板之间的分隔线
- **PDF 控制**: 上一页 / 下一页 / 放大 / 缩小 / 清除
- **聊天控制**: 发送按钮、清空历史

---

## 三、组件详解

### 3.1 布局控制器 (main-layout.js)

#### **Vue 应用实例**
```javascript
const layoutApp = Vue.createApp({
    data() {
        return {
            leftPanelCollapsed: false,    // 左侧是否折叠
            rightPanelCollapsed: false,   // 右侧是否折叠
            pdfLoaded: false,             // PDF 是否已加载
            leftPanelWidth: 30,           // 左侧宽度 (%)
            rightPanelWidth: 30           // 右侧宽度 (%)
        }
    },
    methods: {
        toggleLeftPanel()       // 折叠/展开左侧
        toggleRightPanel()      // 折叠/展开右侧
        startResize(type, e)    // 开始拖拽
        handleMouseMove(e)      // 拖拽中
        handleMouseUp()         // 结束拖拽
        updatePanelSizes()      // 更新面板尺寸
        saveLayoutConfig()      // 保存配置到 localStorage
    },
    mounted() {
        // 从 localStorage 恢复布局配置
    }
})
```

#### **状态同步**
- 面板宽度变化 → 更新 CSS 变量 → 保存到 localStorage
- 页面刷新 → 从 localStorage 读取 → 恢复布局

---

### 3.2 聊天组件 (main-chat-vue.js)

#### **Vue 组件**
```javascript
app.component('chat-component', {
    data() {
        return {
            chatHistory: [],          // 对话历史
            inputText: '',            // 当前输入
            isInputEnabled: false,    // 输入框是否启用
            isPdfUploaded: false,     // PDF 是否已上传
            isSending: false          // 是否正在发送
        }
    },
    methods: {
        sendMessage()       // 发送用户消息
        clearChat()         // 清空聊天历史
        formatMessage(txt)  // 格式化消息（基础 markdown）
        enableInput()       // 启用输入框
        disableInput()      // 禁用输入框
        loadHistory(hist)   // 加载历史对话
    }
})
```

#### **API 调用**
```javascript
POST /api/chat
Body: {
    user_id: "...",
    session_id: "...",
    message: "..."
}
返回: {
    success: true,
    response: "...",
    current_state: "..."
}
```

---

### 3.3 主应用逻辑 (main-app.js)

#### **核心流程**
```
页面加载
  ├─ 检查 localStorage 中的 user_id
  │   └─ 不存在 → 跳转到欢迎页
  │
  ├─ 检查 URL 参数中的 session_id
  │   ├─ 存在 → 加载已有会话
  │   │   ├─ GET /api/session/{id}
  │   │   ├─ 加载 PDF
  │   │   ├─ 加载聊天历史
  │   │   └─ 启用输入框
  │   │
  │   └─ 不存在 → 等待用户上传 PDF
  │
  └─ 绑定事件监听器
      ├─ PDF 上传
      ├─ PDF 控制按钮
      └─ 窗口大小变化
```

#### **关键函数**
```javascript
initializePage()           // 页面初始化
loadExistingSession(sid)   // 加载已有会话
handleFileUpload(file)     // 处理文件上传
loadPdfFile(file)          // 加载 PDF 文件
renderPage(num)            // 渲染 PDF 页面
bindPdfControls()          // 绑定 PDF 控制按钮
clearPdf()                 // 清除 PDF
showLoading() / hideLoading()  // 加载提示
```

#### **PDF 上传流程**
```javascript
1. 用户选择文件
   ↓
2. 表单验证（格式、大小）
   ↓
3. FormData 构建
   ↓
4. POST /api/upload
   ↓
5. 后端返回 session_id
   ↓
6. 保存 session_id 到 sessionStorage
   ↓
7. 使用 PDF.js 渲染预览
   ↓
8. 启用聊天输入框
```

---

## 四、API 接口契约

### 4.1 会话管理

#### **获取会话列表**
```
GET /api/sessions?user_id={userId}

Response:
{
    "success": true,
    "sessions": [
        {
            "session_id": "uuid",
            "title": "论文标题",
            "current_state": "GUIDE_PENDING_REPORT",
            "created_at": "2024-01-01T12:00:00",
            "updated_at": "2024-01-01T12:00:00"
        }
    ]
}
```

#### **获取单个会话**
```
GET /api/session/{session_id}

Response:
{
    "success": true,
    "session": {
        "session_id": "uuid",
        "user_id": "user123",
        "title": "论文标题",
        "current_state": "GUIDE_PENDING_REPORT",
        "paper_path": "/path/to/paper.pdf",
        "markdown_path": "/path/to/markdown.md",
        "session_data": {
            "chat_history": [...],
            "context_packages": {...}
        },
        "created_at": "...",
        "updated_at": "..."
    }
}
```

#### **删除会话**
```
DELETE /api/session/{session_id}

Response:
{
    "success": true,
    "message": "会话已删除"
}
```

---

### 4.2 文件处理

#### **上传 PDF**
```
POST /api/upload
Content-Type: multipart/form-data

FormData:
- file: PDF 文件
- user_id: 用户 ID

Response:
{
    "success": true,
    "session_id": "uuid",
    "title": "论文标题",
    "pdf_url": "/uploads/filename.pdf"
}
```

---

### 4.3 对话交互

#### **发送消息**
```
POST /api/chat
Content-Type: application/json

Body:
{
    "user_id": "user123",
    "session_id": "uuid",
    "message": "用户的问题"
}

Response:
{
    "success": true,
    "response": "AI 的回复",
    "current_state": "GUIDE_PENDING_REPORT"
}
```

---

## 五、状态流转

### 5.1 FSM 状态机
```
初始状态: GUIDE_PENDING_REPORT
  ↓ (用户上传论文)
GUIDE_PENDING_PLAN (引导智能体)
  ↓ (生成阅读计划)
CONTROL_ROUTING (控制智能体)
  ↓ (路由到具体智能体)
┌────────────────────────────────┐
│ INTRODUCTION | REVIEW | METHOD │
│ RESULT | DISCUSSION            │
└────────────────────────────────┘
```

### 5.2 前端状态显示
- 每次 API 响应都返回 `current_state`
- 前端可以根据状态显示不同的提示信息
- 未来可以在右侧面板显示状态可视化

---

## 六、用户体验优化

### 6.1 加载反馈
```javascript
// 上传文件时
showLoading('正在上传文件...')

// 等待 AI 回复时
isSending: true  // 禁用输入框，显示"发送中..."
```

### 6.2 错误处理
```javascript
try {
    // API 调用
} catch (error) {
    alert('操作失败: ' + error.message)
    // 或使用更友好的 Toast 提示
}
```

### 6.3 时间显示
```javascript
// formatDateTime() 函数
- 1 分钟内: "刚刚"
- 1 小时内: "X 分钟前"
- 今天: "今天 HH:mm"
- 昨天: "昨天 HH:mm"
- 更早: "YYYY-MM-DD HH:mm"
```

---

## 七、未来扩展

### 7.1 右侧功能区
- 显示当前 FSM 状态
- 显示阅读计划（章节列表）
- 显示知识点概念卡片
- 导出对话记录

### 7.2 Markdown 预览
- 将转换后的 Markdown 显示在右侧面板
- 支持章节跳转
- 支持 LaTeX 公式渲染

### 7.3 多模态支持
- 图片上传和识别
- 语音输入（文字转语音）
- 导出为 PDF 报告

---

## 八、文件清单

### 8.1 HTML 模板
```
templates/
├── welcome.html      # 欢迎页（用户认证 + 会话列表）
└── index.html        # 主页面（三栏布局）
```

### 8.2 CSS 样式
```
static/css/
├── welcome.css       # 欢迎页样式（渐变背景 + 卡片）
└── main.css          # 主页面样式（macOS 风格）
```

### 8.3 JavaScript 逻辑
```
static/js/
├── welcome.js            # 欢迎页逻辑（认证 + 会话加载）
├── main-layout.js        # 布局控制器（Vue 应用）
├── main-chat-vue.js      # 聊天组件（Vue 组件）
└── main-app.js           # 主应用逻辑（初始化 + PDF + 事件）
```

---

## 九、开发规范

### 9.1 代码风格
- 使用 ES6+ 语法（箭头函数、async/await、解构赋值）
- Vue 组件使用选项式 API
- 函数命名：驼峰式（camelCase）
- 常量命名：大写下划线（UPPER_SNAKE_CASE）

### 9.2 注释规范
```javascript
/**
 * 函数功能描述
 * @param {type} paramName - 参数描述
 * @returns {type} 返回值描述
 */
```

### 9.3 Git 提交规范
```
feat: 新增功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
```

---

**文档版本**: v1.0  
**创建时间**: 2024  
**维护者**: Jason
