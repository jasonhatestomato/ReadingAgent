# ReadingAgent 项目结构说明

## 📁 目录结构

```
ReadingAgent/
├── config.py                          # 项目配置文件
├── db.py                              # 数据库操作模块
├── prompt_manager.py                  # Prompt 管理模块
├── requirements.txt                   # Python 依赖
│
├── data/                              # 数据存储目录
│   └── sessions.db                    # SQLite 数据库文件（运行时自动创建）
│
├── uploads/                           # 用户上传的 PDF 文件
├── markdown/                          # PDF 转换后的 Markdown 文件
│
├── prompts/                           # Prompt 模板目录
│   ├── prompt_config.json            # Prompt 配置文件
│   └── v1.0/                         # v1.0 版本的 Prompt
│       ├── guidance_agent.md         # 文献导读智能体
│       ├── control_agent.md          # 中控智能体
│       ├── introduction_agent.md     # 引言智能体
│       ├── review_agent.md           # 综述智能体
│       ├── method_agent.md           # 实验方法智能体
│       ├── result_agent.md           # 实验结果智能体
│       ├── discussion_agent.md       # 讨论智能体
│       ├── concept_agent.md          # 概念澄清智能体（预留）
│       └── general_agent.md          # 通用智能体（预留）
│
├── static/                            # 前端静态资源
│   ├── css/                          # 样式文件
│   ├── js/                           # JavaScript 文件
│   └── images/                       # 图片资源
│
├── templates/                         # Flask 模板文件
│   ├── welcome.html                  # 欢迎/会话列表页（待创建）
│   └── index.html                    # 三栏交互主页（待创建）
│
└── docs/                              # 文档目录
    └── PROJECT_STRUCTURE.md          # 本文件
```

## 🗄️ 数据库设计

### sessions 表
| 字段 | 类型 | 说明 |
|------|------|------|
| session_id | TEXT (主键) | 会话唯一标识（UUID） |
| user_id | TEXT | 用户ID |
| title | TEXT | 会话标题（文献标题） |
| current_state | TEXT | 当前 FSM 状态 |
| paper_path | TEXT | PDF 文件路径 |
| markdown_path | TEXT | Markdown 文件路径 |
| session_data | TEXT (JSON) | 会话数据（chat_history、reading_plan 等） |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**索引：**
- `idx_user_id`: 按用户查询
- `idx_updated_at`: 按更新时间排序

## 🤖 智能体系统

### 核心智能体（7个）
1. **guidance_agent** - 文献导读智能体
2. **control_agent** - 中控智能体（路由、协调）
3. **introduction_agent** - 引言智能体
4. **review_agent** - 综述智能体
5. **method_agent** - 实验方法智能体
6. **result_agent** - 实验结果智能体
7. **discussion_agent** - 讨论智能体

### 扩展智能体（2个，暂未实现业务逻辑）
8. **concept_agent** - 概念澄清智能体
9. **general_agent** - 通用智能体

### FSM 状态与智能体映射
| FSM 状态 | 对应智能体 |
|---------|-----------|
| GUIDE_PENDING_REPORT | guidance_agent |
| GUIDE_PENDING_PLAN | guidance_agent |
| CONTROL_ROUTING | control_agent |
| INTRODUCTION | introduction_agent |
| REVIEW | review_agent |
| METHOD | method_agent |
| RESULT | result_agent |
| DISCUSSION | discussion_agent |

## 📝 Prompt 管理

### 版本化管理
- Prompt 按版本组织在 `prompts/` 目录下
- 每个版本是一个独立的子目录（如 `v1.0/`）
- 配置文件 `prompt_config.json` 管理版本和映射关系

### 使用方法
```python
from prompt_manager import prompt_manager

# 通过智能体名称获取
prompt = prompt_manager.get_prompt('guidance')

# 通过 FSM 状态获取（自动映射）
prompt = prompt_manager.get_prompt('GUIDE_PENDING_REPORT')

# 指定版本
prompt = prompt_manager.get_prompt('control', version='v2.0')
```

## 🔧 配置说明

### config.py
- **DATABASE_CONFIG**: 数据库路径、超时设置
- **UPLOAD_CONFIG**: 文件上传目录、大小限制
- **PROMPT_CONFIG**: Prompt 目录、默认版本
- **FLASK_CONFIG**: Flask 应用配置
- **STATE_AGENT_MAPPING**: FSM 状态映射

## 🚀 快速开始

### 1. 安装依赖
```bash
cd /Users/jason/pycode/ReadingAgent
pip install -r requirements.txt
```

### 2. 初始化数据库
```bash
python db.py
```

### 3. 测试 Prompt 管理器
```bash
python prompt_manager.py
```

### 4. 填充 Prompt 内容
编辑 `prompts/v1.0/` 目录下的各个 `.md` 文件，填入完整的系统提示词。

## 📚 待开发模块

- [ ] Flask 应用主文件 (`app.py`)
- [ ] 前端欢迎页 (`templates/welcome.html`)
- [ ] 前端主页 (`templates/index.html`)
- [ ] 前端样式文件
- [ ] 前端 JavaScript 逻辑
- [ ] LLM 调用模块
- [ ] PDF 处理模块
- [ ] API 路由实现

## 📖 开发规范

### 代码风格
- 使用 UTF-8 编码
- 遵循 PEP 8 规范
- 添加清晰的注释和文档字符串

### Git 提交
- 提交信息清晰描述变更内容
- 小步提交，避免大规模混合修改

### 测试
- 每个模块包含基本的测试代码
- 在主程序入口添加 `if __name__ == '__main__'` 测试块

---

*文档创建时间: 2025-10-24*
*最后更新: 2025-10-24*
