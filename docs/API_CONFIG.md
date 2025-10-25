# API 配置说明

## 配置文件位置

`api_config.json` - 管理所有 API 相关配置

## 配置结构

```json
{
  "api_provider": "openai",  // 当前使用的提供商: openai | azure | custom
  "openai": { ... },          // OpenAI 配置
  "azure": { ... },           // Azure OpenAI 配置
  "custom": { ... }           // 自定义兼容 OpenAI API 的服务
}
```

## 使用 OpenAI

```json
{
  "api_provider": "openai",
  "openai": {
    "api_key": "sk-xxxxxxxxxxxxxxxxxxxxxx",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o",
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

## 使用 Azure OpenAI

```json
{
  "api_provider": "azure",
  "azure": {
    "api_key": "你的 Azure API Key",
    "base_url": "https://your-resource.openai.azure.com",
    "model": "gpt-4",
    "api_version": "2024-02-15-preview",
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

## 使用其他兼容服务

支持任何兼容 OpenAI API 格式的服务（如国内的中转 API）：

```json
{
  "api_provider": "custom",
  "custom": {
    "api_key": "你的 API Key",
    "base_url": "https://api.example.com/v1",
    "model": "gpt-4",
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

## 配置参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `api_key` | API 密钥 | `sk-xxxxx` |
| `base_url` | API 基础地址 | `https://api.openai.com/v1` |
| `model` | 使用的模型 | `gpt-4o`, `gpt-4`, `gpt-3.5-turbo` |
| `temperature` | 温度参数 (0-1) | `0.7` (越高越随机) |
| `max_tokens` | 最大输出长度 | `2000` |
| `api_version` | API 版本（仅 Azure） | `2024-02-15-preview` |

## 快速配置步骤

### 步骤 1: 填写你的 API Key

编辑 `api_config.json`：

```json
{
  "api_provider": "openai",
  "openai": {
    "api_key": "填入你的 OpenAI API Key",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o",
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

### 步骤 2: 重启应用

```bash
python app.py
```

### 步骤 3: 检查启动日志

成功的日志应该显示：
```
🤖 API 提供商: openai
🔧 模型: gpt-4o
✅ 智能体编排器: 已初始化
```

如果看到：
```
❌ 智能体编排器: 未初始化 (请配置 API Key)
```

说明 API Key 配置有问题，请检查：
1. `api_config.json` 是否正确填写
2. `api_key` 字段不能为空
3. JSON 格式是否正确（没有多余逗号等）

## 切换 API 提供商

只需修改 `api_provider` 字段：

```json
{
  "api_provider": "azure",  // 改为 azure
  "azure": {
    "api_key": "填入你的 Azure Key",
    ...
  }
}
```

重启应用即可生效。

## 环境变量（备用方式）

如果 `api_config.json` 中的 `api_key` 为空，系统会尝试从环境变量读取：

```bash
export OPENAI_API_KEY="sk-xxxxx"
python app.py
```

**优先级**: `api_config.json` > 环境变量

## 安全建议

⚠️ **不要将 `api_config.json` 提交到 Git！**

在 `.gitignore` 中添加：
```
api_config.json
.env
```

分享代码时，使用示例文件：
```bash
cp api_config.json api_config.example.json
# 然后删除 example 文件中的 api_key
```

## 故障排查

### 问题 1: API Key 无效
```
❌ OpenAI API 调用失败: Incorrect API key provided
```
**解决**: 检查 `api_key` 是否正确复制（注意前缀 `sk-`）

### 问题 2: 网络连接失败
```
❌ OpenAI API 调用失败: Connection error
```
**解决**: 
- 检查网络连接
- 如在国内，可能需要使用代理或中转 API
- 尝试修改 `base_url` 为国内可用的服务

### 问题 3: 模型不存在
```
❌ OpenAI API 调用失败: The model 'gpt-5' does not exist
```
**解决**: 修改 `model` 字段为有效的模型名称

### 问题 4: 配额不足
```
❌ OpenAI API 调用失败: You exceeded your current quota
```
**解决**: 
- 检查 OpenAI 账户余额
- 升级付费计划
- 或切换到其他 API 提供商

## 支持的模型列表

### OpenAI
- `gpt-4o` (推荐，最新模型)
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

### 选择建议
- **准确性优先**: `gpt-4o` 或 `gpt-4`
- **速度优先**: `gpt-3.5-turbo`
- **成本优先**: `gpt-3.5-turbo`

## 测试配置

启动应用后，访问 http://localhost:5001，上传 PDF 并发送消息，检查是否能正常回复。
