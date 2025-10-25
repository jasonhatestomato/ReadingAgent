# Reading Agent 使用指南

## 快速开始

### 1. 环境准备

#### 1.1 安装依赖
```bash
cd /Users/jason/pycode/ReadingAgent
pip install -r requirements.txt
```

主要依赖：
- Flask 3.0.0 - Web 框架
- OpenAI 1.12.0 - LLM API 客户端
- PyMuPDF 1.23.8 - PDF 处理

#### 1.2 配置环境变量

复制示例文件：
```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的配置：
```bash
# 必填：OpenAI API Key
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx

# 可选：模型配置（默认值已设置）
OPENAI_MODEL=gpt-4o
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=2000

# 可选：Flask 配置
SECRET_KEY=your-secret-key-here
FLASK_ENV=development
```

#### 1.3 填充 Prompt

确保已填充所有智能体的 Prompt 文件：
```
prompts/v1.0/
├── guidance_agent.md        # 文献导读智能体
├── control_agent.md         # 中控智能体
├── introduction_agent.md    # 引言智能体
├── review_agent.md          # 综述智能体
├── method_agent.md          # 实验方法智能体
├── result_agent.md          # 实验结果智能体
├── discussion_agent.md      # 讨论智能体
├── concept_agent.md         # 概念澄清智能体（预留）
└── general_agent.md         # 通用智能体（预留）
```

---

### 2. 启动应用

```bash
python app.py
```

或使用脚本（如果已配置）：
```bash
chmod +x script/run.sh
./script/run.sh
```

启动成功后，访问：
```
http://localhost:5001
```

---

## 使用流程

### 第一步：用户认证
1. 在欢迎页输入你的用户 ID（任意字符串）
2. 点击"确认"按钮

### 第二步：管理会话
- **查看历史会话**：在会话列表中点击任意会话，继续之前的阅读
- **创建新会话**：点击"新建会话"按钮

### 第三步：上传论文
1. 在主页面左侧，点击"选择文件"或拖拽 PDF 文件到上传区
2. 系统会自动：
   - 保存 PDF 到 `uploads/` 目录
   - 转换 PDF 为 Markdown（保存到 `markdown/` 目录）
   - 创建会话记录（保存到 SQLite 数据库）
   - 显示 PDF 预览

### 第四步：与 AI 对话
1. PDF 上传成功后，聊天输入框会自动启用
2. 输入你的问题，例如：
   - "这篇论文的主要研究问题是什么？"
   - "能帮我理解一下引言部分吗？"
   - "实验方法有哪些创新点？"
3. AI 会根据当前 FSM 状态调用相应的智能体回答

---

## FSM 状态流转

### 状态图
```
GUIDE_PENDING_REPORT (初始状态)
    ↓ 上传论文
GUIDE_PENDING_PLAN (引导智能体)
    ↓ 生成阅读计划
CONTROL_ROUTING (中控智能体)
    ↓ 根据用户问题路由
┌────────────────────────────────┐
│ INTRODUCTION (引言智能体)       │
│ REVIEW (综述智能体)             │
│ METHOD (实验方法智能体)         │
│ RESULT (实验结果智能体)         │
│ DISCUSSION (讨论智能体)         │
└────────────────────────────────┘
```

### 状态说明

| 状态 | 智能体 | 功能 |
|------|--------|------|
| `GUIDE_PENDING_REPORT` | guidance_agent | 等待用户上传论文 |
| `GUIDE_PENDING_PLAN` | guidance_agent | 生成阅读计划和指导 |
| `CONTROL_ROUTING` | control_agent | 分析用户问题，路由到具体章节智能体 |
| `INTRODUCTION` | introduction_agent | 回答引言、背景相关问题 |
| `REVIEW` | review_agent | 回答文献综述、相关工作问题 |
| `METHOD` | method_agent | 回答实验方法、设计问题 |
| `RESULT` | result_agent | 回答实验结果、数据分析问题 |
| `DISCUSSION` | discussion_agent | 回答讨论、结论、启发问题 |

### 状态转换规则

1. **GUIDE_PENDING_REPORT → GUIDE_PENDING_PLAN**
   - 触发条件：用户上传 PDF 文件

2. **GUIDE_PENDING_PLAN → CONTROL_ROUTING**
   - 触发条件：引导智能体生成阅读计划后

3. **CONTROL_ROUTING → 具体章节智能体**
   - 触发条件：检测到用户问题中的关键词
   - 关键词映射：
     - 引言：`引言`, `背景`, `研究动机`, `introduction`, `background`
     - 综述：`综述`, `相关工作`, `文献综述`, `review`, `related work`
     - 方法：`方法`, `实验设计`, `实验方法`, `method`, `methodology`
     - 结果：`结果`, `实验结果`, `数据`, `result`, `findings`
     - 讨论：`讨论`, `分析`, `结论`, `discussion`, `conclusion`

---

## 功能特性

### ✅ 已实现功能

#### 后端
- [x] SQLite 数据库（会话管理）
- [x] Prompt 版本管理系统
- [x] PDF 上传和存储
- [x] PDF 转 Markdown（使用 PyMuPDF）
- [x] FSM 状态机
- [x] 智能体编排器（路由、上下文打包、LLM 调用）
- [x] OpenAI API 集成（带重试机制）
- [x] RESTful API 接口

#### 前端
- [x] 用户认证和会话管理
- [x] 三栏拖拽布局（PDF、聊天、功能区）
- [x] PDF 在线预览（PDF.js）
- [x] 实时聊天界面（Vue 3）
- [x] 布局状态持久化（localStorage）
- [x] macOS 风格 UI

### ⏳ 未来扩展

- [ ] 右侧功能区
  - 显示 FSM 当前状态
  - 显示阅读计划
  - 显示概念卡片
- [ ] Markdown 预览和导出
- [ ] 语音输入/输出
- [ ] 多文献对比阅读
- [ ] 阅读笔记导出为 PDF 报告

---

## API 文档

### 会话管理

#### 获取会话列表
```http
GET /api/sessions?user_id={userId}
```
**响应**：
```json
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

#### 获取单个会话
```http
GET /api/session/{session_id}
```
**响应**：
```json
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

#### 删除会话
```http
DELETE /api/session/{session_id}
```

---

### 文件上传

#### 上传 PDF
```http
POST /api/upload
Content-Type: multipart/form-data
```
**请求体**：
- `file`: PDF 文件
- `user_id`: 用户 ID

**响应**：
```json
{
  "success": true,
  "session_id": "uuid",
  "title": "论文标题",
  "pdf_url": "/uploads/filename.pdf",
  "has_markdown": true
}
```

---

### 对话交互

#### 发送消息
```http
POST /api/chat
Content-Type: application/json
```
**请求体**：
```json
{
  "user_id": "user123",
  "session_id": "uuid",
  "message": "这篇论文的主要贡献是什么？"
}
```

**响应**：
```json
{
  "success": true,
  "response": "这篇论文的主要贡献包括...",
  "current_state": "CONTROL_ROUTING"
}
```

---

## 故障排查

### 问题 1：端口被占用
```
Address already in use
Port 5000 is in use by another program.
```

**解决方案**：
- macOS 用户：关闭 AirPlay Receiver（系统设置 → 通用 → 隔空播放与接力）
- 或在 `app.py` 中修改端口：
  ```python
  app.run(debug=True, host='0.0.0.0', port=5001)
  ```

### 问题 2：智能体编排器初始化失败
```
⚠️  智能体编排器初始化失败: 未设置 OPENAI_API_KEY 环境变量
```

**解决方案**：
1. 检查 `.env` 文件是否存在
2. 确认 `OPENAI_API_KEY` 已正确填写
3. 重新启动应用

### 问题 3：PDF 转换失败
```
⚠️  PDF 转 Markdown 失败（将继续）: ...
```

**解决方案**：
- 确认已安装 PyMuPDF：`pip install PyMuPDF`
- 检查 PDF 文件是否损坏
- 查看 `markdown/` 目录权限

### 问题 4：数据库锁定
```
sqlite3.OperationalError: database is locked
```

**解决方案**：
- 关闭其他访问数据库的进程
- 检查 `data/sessions.db` 文件权限
- 删除 `data/sessions.db-journal` 文件（如果存在）

---

## 开发指南

### 项目结构
```
ReadingAgent/
├── app.py                    # Flask 主应用
├── config.py                 # 配置文件
├── db.py                     # 数据库操作
├── prompt_manager.py         # Prompt 管理器
├── agent_orchestrator.py     # 智能体编排器
├── pdf_converter.py          # PDF 转换器
├── requirements.txt          # Python 依赖
├── .env                      # 环境变量（需自行创建）
├── .env.example              # 环境变量示例
│
├── data/                     # 数据目录
│   └── sessions.db           # SQLite 数据库
│
├── uploads/                  # PDF 上传目录
├── markdown/                 # Markdown 输出目录
│
├── prompts/                  # Prompt 目录
│   ├── prompt_config.json    # 版本配置
│   └── v1.0/                 # v1.0 版本 Prompts
│       ├── guidance_agent.md
│       ├── control_agent.md
│       └── ...
│
├── static/                   # 前端静态资源
│   ├── css/
│   │   ├── welcome.css
│   │   └── main.css
│   └── js/
│       ├── welcome.js
│       ├── main-layout.js
│       ├── main-chat-vue.js
│       └── main-app.js
│
├── templates/                # HTML 模板
│   ├── welcome.html
│   └── index.html
│
└── docs/                     # 文档
    ├── PROJECT_STRUCTURE.md
    ├── FRONTEND_DESIGN.md
    └── USER_GUIDE.md
```

### 添加新的智能体

1. 创建 Prompt 文件：
   ```bash
   touch prompts/v1.0/new_agent.md
   ```

2. 在 `config.py` 中添加映射：
   ```python
   STATE_AGENT_MAPPING = {
       'NEW_STATE': 'new_agent',
       # ...
   }
   
   AGENT_DISPLAY_NAMES = {
       'new_agent': '新智能体',
       # ...
   }
   ```

3. 在 `agent_orchestrator.py` 中添加路由规则（可选）

### 自定义 Prompt 版本

1. 创建新版本目录：
   ```bash
   mkdir -p prompts/v2.0
   ```

2. 复制并修改 Prompt 文件：
   ```bash
   cp prompts/v1.0/* prompts/v2.0/
   ```

3. 更新 `prompts/prompt_config.json`：
   ```json
   {
     "versions": ["v1.0", "v2.0"],
     "default_version": "v2.0"
   }
   ```

---

## 贡献指南

### 代码风格
- Python: PEP 8
- JavaScript: ES6+
- 注释: 中文

### Git 提交规范
```
feat: 新增功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式
refactor: 代码重构
test: 测试相关
```

---

## 许可证

MIT License

---

## 联系方式

- 作者: Jason
- 项目: Reading Agent
- 版本: v1.0
