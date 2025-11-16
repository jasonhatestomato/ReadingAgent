"""
ReadingAgent 配置文件
包含数据库、文件上传、Prompt 等配置
"""
import os
import json
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent

# ========== 加载 API 配置 ==========
def load_api_config():
    """从 api_config.json 加载 API 配置"""
    api_config_path = BASE_DIR / 'api_config.json'
    
    if not api_config_path.exists():
        print("⚠️  api_config.json 不存在，使用默认配置")
        return {
            'api_provider': 'openai',
            'openai': {
                'api_key': os.environ.get('OPENAI_API_KEY', ''),
                'base_url': 'https://api.openai.com/v1',
                'model': 'gpt-4o',
                'temperature': 0.7,
                'max_tokens': 2000
            }
        }
    
    try:
        with open(api_config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        return config
    except Exception as e:
        print(f"⚠️  加载 api_config.json 失败: {e}")
        return {
            'api_provider': 'openai',
            'openai': {
                'api_key': os.environ.get('OPENAI_API_KEY', ''),
                'base_url': 'https://api.openai.com/v1',
                'model': 'gpt-4o',
                'temperature': 0.7,
                'max_tokens': 2000
            }
        }

API_CONFIG_DATA = load_api_config()

# ========== 数据库配置 ==========
DATABASE_CONFIG = {
    'db_path': BASE_DIR / 'data' / 'sessions.db',
    'timeout': 10.0,  # 连接超时时间（秒）
    'check_same_thread': False  # 允许多线程访问（Flask需要）
}

# ========== 文件上传配置 ==========
UPLOAD_CONFIG = {
    'upload_folder': BASE_DIR / 'uploads',
    'markdown_folder': BASE_DIR / 'markdown',
    'allowed_extensions': {'pdf'},
    'max_file_size': 20 * 1024 * 1024,  # 20MB
}

# ========== 本地论文配置 ==========
LOCAL_PAPERS_CONFIG = {
    'local_papers_folder': BASE_DIR / 'local_papers',  # 系统提供的本地论文
    'allowed_extensions': {'pdf'}
}

# ========== Prompt 配置 ==========
PROMPT_CONFIG = {
    'prompt_folder': BASE_DIR / 'prompts',
    'default_prompt_set': 'v1.0'  # 默认使用的 prompt 版本
}

# ========== Flask 应用配置 ==========
FLASK_CONFIG = {
    'SECRET_KEY': os.environ.get('SECRET_KEY', 'reading-agent-dev-secret-key-change-in-production'),
    'JSON_AS_ASCII': False,  # 支持中文 JSON
    'MAX_CONTENT_LENGTH': UPLOAD_CONFIG['max_file_size']
}

# ========== OpenAI API 配置 ==========
# 获取当前使用的 API 提供商配置
CURRENT_PROVIDER = API_CONFIG_DATA.get('api_provider', 'openai')
CURRENT_API_CONFIG = API_CONFIG_DATA.get(CURRENT_PROVIDER, {})

# OpenAI 客户端配置（只包含支持的参数）
OPENAI_CONFIG = {
    'api_key': CURRENT_API_CONFIG.get('api_key') or os.environ.get('OPENAI_API_KEY'),
    'base_url': CURRENT_API_CONFIG.get('base_url', 'https://api.openai.com/v1'),
    'model': CURRENT_API_CONFIG.get('model', 'gpt-4o'),
    'temperature': float(CURRENT_API_CONFIG.get('temperature', 0.7)),
    'max_tokens': int(CURRENT_API_CONFIG.get('max_tokens', 2000)),
    'max_retries': 3,  # 最大重试次数
    'timeout': 60,  # 请求超时（秒）
    'api_version': CURRENT_API_CONFIG.get('api_version'),  # Azure 专用
}
# 注意：不要添加 proxies 等参数，OpenAI SDK v1.0+ 不支持
# 如需代理，请使用环境变量: HTTP_PROXY, HTTPS_PROXY, NO_PROXY

# ========== 智能体映射配置 ==========
# FSM 状态到智能体的映射
STATE_AGENT_MAPPING = {
    'GUIDE_PENDING_REPORT': 'guidance',
    'GUIDE_PENDING_PLAN': 'guidance',
    'CONTROL_ROUTING': 'control',
    'INTRODUCTION': 'introduction',
    'REVIEW': 'review',
    'METHOD': 'method',
    'RESULT': 'result',
    'DISCUSSION': 'discussion',
}

# 智能体名称到显示名称的映射
AGENT_DISPLAY_NAMES = {
    'guidance': '文献导读智能体',
    'control': '中控智能体',
    'introduction': '引言智能体',
    'review': '综述智能体',
    'method': '实验方法智能体',
    'result': '实验结果智能体',
    'discussion': '讨论智能体',
    'concept': '概念澄清智能体',
    'general': '通用智能体',
}

# 确保必要的目录存在
def ensure_directories():
    """确保所有必要的目录存在"""
    directories = [
        DATABASE_CONFIG['db_path'].parent,
        UPLOAD_CONFIG['upload_folder'],
        UPLOAD_CONFIG['markdown_folder'],
        LOCAL_PAPERS_CONFIG['local_papers_folder'],
        PROMPT_CONFIG['prompt_folder'],
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)

# 初始化时创建目录
ensure_directories()
