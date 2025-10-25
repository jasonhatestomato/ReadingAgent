# 本地论文功能测试指南

## 功能概述

本地论文功能允许用户从预置的论文库中选择论文，而不需要上传。这在以下场景很有用：
- 教学场景：教师预先准备好论文供学生分析
- 演示场景：准备好示例论文进行功能展示
- 快速测试：无需每次都上传相同的论文

## 测试前准备

### 1. 添加测试论文到本地论文目录

```bash
# 进入本地论文目录
cd /Users/jason/pycode/ReadingAgent/local_papers

# 复制一些测试 PDF 文件到这里
# 例如：
# cp ~/Downloads/sample_paper.pdf ./
# cp ~/Documents/research_paper.pdf ./
```

建议准备 2-3 个不同的 PDF 文件用于测试。

### 2. 启动应用

```bash
cd /Users/jason/pycode/ReadingAgent
python run.py
```

应该看到启动信息，确认：
- ✅ 本地论文目录已创建
- ✅ API 配置加载成功
- ✅ 应用运行在 http://localhost:5001

## 测试步骤

### 测试 1: 查看本地论文列表

1. 打开浏览器访问 `http://localhost:5001`
2. 输入用户 ID，点击"开始使用"
3. 在主页面的左侧面板，点击"选择本地论文"标签
4. **预期结果**：
   - ✅ 看到本地论文列表加载出来
   - ✅ 每篇论文显示文件名和大小
   - ✅ 列表中的论文对应 `local_papers/` 目录中的 PDF 文件

5. **如果看不到论文**：
   - 检查 `local_papers/` 目录是否有 PDF 文件
   - 打开浏览器控制台（F12）查看是否有错误
   - 检查后端日志是否有报错

### 测试 2: 选择本地论文

1. 在本地论文列表中点击某篇论文
2. **预期结果**：
   - ✅ 论文卡片高亮显示
   - ✅ 显示"创建会话中..."加载提示
   - ✅ 页面自动刷新，加载论文 PDF
   - ✅ 左侧面板显示 PDF 内容（第一页）
   - ✅ 右侧聊天区域启用（可以输入问题）

3. **如果 PDF 未显示**：
   - 检查浏览器控制台是否有 PDF 加载错误
   - 检查 `/local-papers/<filename>` 路由是否正常工作
   - 尝试直接访问 `http://localhost:5001/local-papers/<你的文件名>.pdf`

### 测试 3: 切换论文

1. 点击"选择本地论文"标签返回列表
2. 选择另一篇论文
3. **预期结果**：
   - ✅ 创建新的会话
   - ✅ 加载新的论文 PDF
   - ✅ 聊天历史清空（新会话）

### 测试 4: 混合使用上传和本地论文

1. 使用本地论文创建一个会话
2. 回到主页，切换到"上传论文"标签
3. 上传一个新的 PDF
4. **预期结果**：
   - ✅ 两种方式都能正常工作
   - ✅ 可以在浏览器中管理多个会话（不同论文）

## API 端点测试

如果界面测试有问题，可以直接测试 API：

### 测试 GET /api/local-papers

```bash
curl http://localhost:5001/api/local-papers
```

**预期响应**：
```json
{
  "success": true,
  "papers": [
    {
      "filename": "sample_paper.pdf",
      "path": "local_papers/sample_paper.pdf",
      "size": 1234567
    },
    ...
  ]
}
```

### 测试 POST /api/use-local-paper

```bash
curl -X POST http://localhost:5001/api/use-local-paper \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "paper_path": "local_papers/sample_paper.pdf"
  }'
```

**预期响应**：
```json
{
  "success": true,
  "session_id": "..."
}
```

## 故障排查

### 问题 1: 看不到本地论文列表

**可能原因**：
1. `local_papers/` 目录为空
2. JavaScript 加载函数未执行
3. API 端点返回错误

**解决方法**：
```bash
# 检查目录内容
ls -la local_papers/

# 查看浏览器控制台
# F12 -> Console 标签

# 查看网络请求
# F12 -> Network 标签 -> 查看 /api/local-papers 请求状态
```

### 问题 2: 点击论文无反应

**可能原因**：
1. JavaScript 事件绑定失败
2. API 请求失败
3. Session 创建失败

**解决方法**：
```javascript
// 在浏览器控制台测试
handleLocalPaperSelect('local_papers/test.pdf');

// 检查是否有报错
```

### 问题 3: PDF 无法显示

**可能原因**：
1. PDF 文件路径错误
2. 静态文件服务未配置
3. PDF.js 加载失败

**解决方法**：
```bash
# 直接访问 PDF 文件
# 在浏览器打开：
# http://localhost:5001/local-papers/<你的文件名>.pdf

# 如果能访问说明路由正常，可能是 PDF.js 问题
```

### 问题 4: MinerU 转换失败

**注意**：选择本地论文时，系统会尝试使用 MinerU API 转换 PDF。如果：
- 未配置 MinerU API token
- 网络问题
- API 配额用尽

系统会回退到基础模式（仅 PDF 查看，无 Markdown 结构化内容）。

**检查方法**：
```python
# 查看 app.py 日志输出
# 应该看到类似：
# "Markdown conversion failed, using fallback mode"
```

## 下一步

测试完成后，你可以：

1. **添加更多论文**：将常用的研究论文放入 `local_papers/` 目录
2. **组织论文**：考虑创建子目录（需要修改代码支持）
3. **添加元数据**：可以创建一个 `papers.json` 文件，为每篇论文添加标题、作者、摘要等信息
4. **配置 MinerU**：添加 MinerU API token 以启用完整的 Markdown 转换功能

## 参考文档

- [用户指南](USER_GUIDE.md) - 完整的应用使用说明
- [API 配置](API_CONFIG.md) - API 密钥和提供商配置
- [MinerU API 文档](https://mineru.net/docs) - PDF 转换服务文档
