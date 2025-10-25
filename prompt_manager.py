"""
Prompt 管理模块
支持版本化管理和动态加载 Prompt
"""
import json
from pathlib import Path
from config import PROMPT_CONFIG

class PromptManager:
    """Prompt 管理器 - 支持版本化管理和动态加载"""
    
    def __init__(self):
        self.prompt_folder = PROMPT_CONFIG['prompt_folder']
        self.default_version = PROMPT_CONFIG['default_prompt_set']
        self.config_file = self.prompt_folder / 'prompt_config.json'
        
        # 加载配置
        self.config = self._load_config()
        
        # 缓存已加载的 prompts
        self._cache = {}
    
    def _load_config(self):
        """加载 prompt 配置文件"""
        if self.config_file.exists():
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                print(f"✅ 加载 Prompt 配置: {len(config['versions'])} 个版本")
                return config
        else:
            print("⚠️  prompt_config.json 不存在，使用默认配置")
            return {
                "versions": {},
                "default_version": "v1.0",
                "agent_mapping": {}
            }
    
    def get_prompt(self, agent_name, version=None):
        """
        获取指定智能体的 prompt
        
        Args:
            agent_name: 智能体名称（如 'guidance', 'control'）或状态名（如 'GUIDE_PENDING_REPORT'）
            version: prompt 版本，默认使用配置的默认版本
        
        Returns:
            str: prompt 内容
        
        Raises:
            ValueError: 版本或智能体不存在
            FileNotFoundError: Prompt 文件不存在
        """
        version = version or self.default_version
        
        # 从缓存中查找
        cache_key = f"{version}:{agent_name}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        # 如果 agent_name 是状态名，转换为智能体名
        original_name = agent_name
        if agent_name in self.config.get('agent_mapping', {}):
            agent_name = self.config['agent_mapping'][agent_name]
            print(f"🔄 状态映射: {original_name} -> {agent_name}")
        
        # 获取 prompt 文件路径
        version_config = self.config['versions'].get(version)
        if not version_config:
            raise ValueError(f"未找到 prompt 版本: {version}")
        
        filename = version_config['agents'].get(agent_name)
        if not filename:
            raise ValueError(f"未找到智能体 '{agent_name}' 的 prompt 配置")
        
        prompt_path = self.prompt_folder / version / filename
        
        # 读取 prompt 内容
        if not prompt_path.exists():
            raise FileNotFoundError(f"Prompt 文件不存在: {prompt_path}")
        
        with open(prompt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 缓存
        self._cache[cache_key] = content
        
        print(f"✅ 加载 Prompt: {agent_name} (版本: {version})")
        return content
    
    def list_versions(self):
        """
        列出所有可用的 prompt 版本
        
        Returns:
            list: 版本列表
        """
        return list(self.config['versions'].keys())
    
    def get_version_info(self, version):
        """
        获取版本信息
        
        Args:
            version: 版本名称
        
        Returns:
            dict: 版本信息
        """
        return self.config['versions'].get(version)
    
    def list_agents(self, version=None):
        """
        列出指定版本中的所有智能体
        
        Args:
            version: 版本名称，默认使用默认版本
        
        Returns:
            list: 智能体名称列表
        """
        version = version or self.default_version
        version_config = self.config['versions'].get(version)
        
        if not version_config:
            return []
        
        return list(version_config['agents'].keys())
    
    def set_default_version(self, version):
        """
        设置默认版本
        
        Args:
            version: 版本名称
        
        Raises:
            ValueError: 版本不存在
        """
        if version not in self.config['versions']:
            raise ValueError(f"版本 '{version}' 不存在")
        
        self.default_version = version
        self.config['default_version'] = version
        
        # 保存到配置文件
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 默认版本已设置为: {version}")
    
    def clear_cache(self):
        """清除缓存（当 prompt 文件更新时使用）"""
        self._cache.clear()
        print("✅ Prompt 缓存已清除")
    
    def reload_config(self):
        """重新加载配置文件"""
        self.config = self._load_config()
        self.clear_cache()
        print("✅ Prompt 配置已重新加载")

# 全局 PromptManager 实例
prompt_manager = PromptManager()


# ========== 使用示例 ==========
if __name__ == '__main__':
    # 测试 Prompt 管理器
    print("\n" + "="*50)
    print("Prompt Manager 测试")
    print("="*50 + "\n")
    
    # 列出所有版本
    print("可用版本:", prompt_manager.list_versions())
    
    # 列出所有智能体
    print("可用智能体:", prompt_manager.list_agents())
    
    # 获取 guidance agent 的 prompt（通过智能体名）
    try:
        prompt = prompt_manager.get_prompt('guidance')
        print(f"\n✅ 成功加载 guidance_agent prompt (长度: {len(prompt)} 字符)")
    except Exception as e:
        print(f"\n❌ 加载失败: {e}")
    
    # 获取 prompt（通过状态名）
    try:
        prompt = prompt_manager.get_prompt('CONTROL_ROUTING')
        print(f"✅ 成功通过状态名加载 prompt (长度: {len(prompt)} 字符)")
    except Exception as e:
        print(f"❌ 加载失败: {e}")
