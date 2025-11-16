"""
智能体编排器
负责 FSM 状态管理、智能体路由、上下文打包和 LLM 调用
"""
import os
import time
from typing import Dict, List, Optional, Tuple
from openai import OpenAI
from config import STATE_AGENT_MAPPING, AGENT_DISPLAY_NAMES, OPENAI_CONFIG
from prompt_manager import prompt_manager
from db import db


class AgentOrchestrator:
    """智能体编排器"""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        初始化编排器
        
        Args:
            api_key: OpenAI API Key，如果不提供则从配置读取
        """
        self.api_key = api_key or OPENAI_CONFIG['api_key']
        if not self.api_key:
            raise ValueError("未设置 API Key，请在 api_config.json 中配置或设置 OPENAI_API_KEY 环境变量")
        
        # 构建 client 参数（只包含 OpenAI 客户端支持的参数）
        client_kwargs = {
            'api_key': self.api_key,
            'timeout': OPENAI_CONFIG.get('timeout', 60),
        }
        
        # 添加自定义 base_url（如果有）
        if OPENAI_CONFIG.get('base_url'):
            client_kwargs['base_url'] = OPENAI_CONFIG['base_url']
        
        print(f"🔧 初始化 OpenAI 客户端")
        print(f"   Base URL: {client_kwargs.get('base_url', 'default')}")
        print(f"   Model: {OPENAI_CONFIG.get('model')}")
        
        try:
            self.client = OpenAI(**client_kwargs)
        except Exception as e:
            print(f"❌ OpenAI 客户端初始化失败: {e}")
            print(f"   请检查 openai 和 httpx 版本是否匹配")
            raise
            
        self.model = OPENAI_CONFIG['model']
        self.temperature = OPENAI_CONFIG['temperature']
        self.max_tokens = OPENAI_CONFIG['max_tokens']
        self.max_retries = OPENAI_CONFIG['max_retries']
    
    def process_message(
        self,
        session_id: str,
        user_message: str,
        session_data: Dict
    ) -> Tuple[str, str]:
        """
        处理用户消息的主入口
        
        Args:
            session_id: 会话 ID
            user_message: 用户消息
            session_data: 会话数据（包含 current_state, chat_history 等）
        
        Returns:
            (assistant_response, new_state): AI 回复和新的状态
        """
        current_state = session_data.get('current_state', 'GUIDE_PENDING_REPORT')
        
        # 🔍 如果当前处于章节状态且有新消息，重新进行路由判断
        # 注意：不包含 GUIDE_PENDING_PLAN，因为需要让 guidance_agent 自己判断场景二/场景三
        chapter_states = ['INTRODUCTION', 'REVIEW', 'METHOD', 'RESULT', 'DISCUSSION', 'CONTROL_ROUTING']
        if current_state in chapter_states and user_message:
            print(f"🔄 检测到新问题，从状态 {current_state} 重新进行路由判断")
            return self._handle_control_routing(session_id, user_message, session_data)
        
        # 1. 根据状态获取对应的智能体
        agent_name = self._get_agent_by_state(current_state)
        
        # 2. 加载智能体的 Prompt
        system_prompt = prompt_manager.get_prompt(agent_name)
        
        # 3. 构建上下文（历史对话 + 论文内容等）
        context = self._build_context(session_data)
        
        # 4. 调用 LLM
        assistant_response = self._call_llm(
            system_prompt=system_prompt,
            context=context,
            user_message=user_message,
            chat_history=session_data.get('session_data', {}).get('chat_history', [])
        )
        
        # 🔍 调试：打印 LLM 响应
        print(f"\n{'='*60}")
        print(f"🤖 智能体 [{AGENT_DISPLAY_NAMES.get(agent_name, agent_name)}] 响应:")
        print(f"{'='*60}")
        print(f"响应长度: {len(assistant_response)} 字符")
        if len(assistant_response) < 200:
            print(f"响应内容: {assistant_response}")
        else:
            print(f"响应前200字: {assistant_response[:200]}...")
        print(f"{'='*60}\n")
        
        # 🔍 检查空响应
        if not assistant_response or len(assistant_response.strip()) == 0:
            print(f"⚠️  警告：智能体返回了空响应！")
            print(f"   当前状态: {current_state}")
            print(f"   智能体: {agent_name}")
            print(f"   用户消息: {user_message}")
            # 返回友好提示而不是空字符串
            assistant_response = "抱歉，我暂时无法生成回复。请稍后再试或换个方式提问。"
        
        # 🔍 检测场景三的特殊路由标记（guidance_agent专用）
        if agent_name == 'guidance' and current_state == 'GUIDE_PENDING_PLAN':
            import json
            import re
            try:
                # 尝试提取JSON标记
                json_match = re.search(r'\{[^}]*"route"[^}]*\}', assistant_response)
                if json_match:
                    route_data = json.loads(json_match.group())
                    if route_data.get('route') == 'content_question':
                        print("🔄 检测到场景三路由标记，自动转发到 control_routing")
                        # 直接调用 control_routing 处理用户的原始问题
                        # 注意：这里直接返回，不再返回包含JSON的guidance回复
                        return self._handle_control_routing(session_id, user_message, session_data)
            except Exception as e:
                print(f"⚠️  解析路由标记失败（可能不是场景三）: {e}")
        
        # 5. 判断是否需要状态转换
        new_state = self._determine_next_state(
            current_state=current_state,
            user_message=user_message,
            assistant_response=assistant_response,
            session_data=session_data
        )
        
        return assistant_response, new_state
    
    def _handle_control_routing(
        self,
        session_id: str,
        user_message: str,
        session_data: Dict
    ) -> Tuple[str, str]:
        """
        处理CONTROL_ROUTING状态：让control_agent决策路由
        
        Args:
            session_id: 会话 ID
            user_message: 用户消息
            session_data: 会话数据
        
        Returns:
            (assistant_response, new_state): AI 回复和新的状态
        """
        # 1. 调用control_agent进行路由决策
        control_prompt = prompt_manager.get_prompt('control')
        context = self._build_context(session_data)
        
        routing_response = self._call_llm(
            system_prompt=control_prompt,
            context=context,
            user_message=f"用户问题：{user_message}\n\n请分析这个问题应该路由给哪个智能体。",
            chat_history=[]
        )
        
        # 🔍 打印中控智能体的完整回复（用于调试）
        print("\n" + "="*60)
        print("🎯 中控智能体 (Control Agent) 路由决策：")
        print("="*60)
        print(routing_response)
        print("="*60 + "\n")
        
        # 2. 解析路由决策（尝试从JSON中提取agent_name）
        import json
        import re
        
        target_agent = None
        try:
            # 尝试提取JSON（支持多种格式）
            # 方式1: 直接解析整个响应
            try:
                routing_json = json.loads(routing_response.strip())
                target_agent = routing_json.get('agent_name')
            except:
                # 方式2: 提取```json代码块
                json_block_match = re.search(r'```json\s*(\{[^}]+\})\s*```', routing_response, re.DOTALL)
                if json_block_match:
                    routing_json = json.loads(json_block_match.group(1))
                    target_agent = routing_json.get('agent_name')
                else:
                    # 方式3: 提取任意JSON对象
                    json_match = re.search(r'\{[^}]+\}', routing_response)
                    if json_match:
                        routing_json = json.loads(json_match.group())
                        target_agent = routing_json.get('agent_name')
            
            if target_agent:
                print(f"✅ 路由决策成功: {target_agent}")
            else:
                print(f"⚠️  JSON解析成功但未找到agent_name字段")
                
        except Exception as e:
            print(f"❌ 解析路由决策失败: {e}")
        
        # 3. 如果无法解析，默认使用general智能体
        if not target_agent:
            print("⚠️  无法解析路由决策，使用general作为默认")
            target_agent = 'general'
        
        # 3.5 标准化agent名称：移除_agent后缀（如果存在）
        # control_agent返回的可能是 "review_agent"，需要转换为 "review"
        if target_agent.endswith('_agent'):
            original_target = target_agent
            target_agent = target_agent.replace('_agent', '')
            print(f"🔄 标准化agent名称: {original_target} -> {target_agent}")
        
        # 4. 构建context时，包含agent_inquiry_status信息
        context_with_status = self._build_context_with_agent_status(session_data, target_agent)
        
        # 5. 调用目标智能体（不打印子智能体回复，只打印control）
        target_prompt = prompt_manager.get_prompt(target_agent)
        assistant_response = self._call_llm(
            system_prompt=target_prompt,
            context=context_with_status,
            user_message=user_message,
            chat_history=session_data.get('session_data', {}).get('chat_history', [])
        )
        
        # 6. 更新agent_inquiry_status：标记该智能体已被询问
        # 在更新前记录当前状态，用于判断模式
        session_dict = session_data.get('session_data', {})
        agent_inquiry_status = session_dict.get('agent_inquiry_status', {})
        is_first_inquiry = not agent_inquiry_status.get(target_agent, False)
        
        self._update_agent_inquiry_status(session_id, target_agent)
        
        # 🔧 调试标签：在回复末尾添加智能体和模式信息
        mode_text = "首次模式" if is_first_inquiry else "常规模式"
        # 简化的智能体名称映射
        agent_short_names = {
            'introduction': '引言',
            'review': '综述',
            'method': '方法',
            'result': '结果',
            'discussion': '讨论',
            'general': '通用',
            'concept': '概念'
        }
        agent_short = agent_short_names.get(target_agent, target_agent)
        debug_tag = f"\n\n---\n【{agent_short}】【{mode_text}】"
        assistant_response += debug_tag
        
        # 7. 确定新状态（根据目标agent映射到状态）
        agent_to_state = {
            'introduction': 'INTRODUCTION',
            'review': 'REVIEW',
            'method': 'METHOD',
            'result': 'RESULT',
            'discussion': 'DISCUSSION',
        }
        new_state = agent_to_state.get(target_agent, 'CONTROL_ROUTING')
        
        # 6. 直接返回子智能体的回答（不再审核）
        return assistant_response, new_state
    
    def _get_agent_by_state(self, state: str) -> str:
        """
        根据 FSM 状态获取对应的智能体名称
        
        Args:
            state: 当前 FSM 状态
        
        Returns:
            agent_name: 智能体名称
        """
        agent_name = STATE_AGENT_MAPPING.get(state)
        
        if not agent_name:
            # 如果没有映射，使用通用智能体
            print(f"⚠️  未知状态 {state}，使用通用智能体")
            return 'general_agent'
        
        return agent_name
    
    def _build_context(self, session_data: Dict) -> str:
        """
        构建上下文信息
        
        根据设计文档，上下文包括：
        1. 主历史记录（main history）
        2. 选择性上下文包（context packages）
        
        Args:
            session_data: 会话数据
        
        Returns:
            context: 格式化的上下文字符串
        """
        context_parts = []
        
        # 1. 论文基本信息
        paper_path = session_data.get('paper_path')
        markdown_path = session_data.get('markdown_path')
        
        print(f"📋 构建上下文 - paper_path: {paper_path}")
        print(f"📋 构建上下文 - markdown_path: {markdown_path}")
        
        if paper_path:
            context_parts.append(f"📄 论文文件: {paper_path}")
        
        # 2. Markdown 内容（如果已转换）
        if markdown_path and os.path.exists(markdown_path):
            try:
                with open(markdown_path, 'r', encoding='utf-8') as f:
                    markdown_content = f.read()
                    content_length = len(markdown_content)
                    print(f"📋 读取到 Markdown 内容，长度: {content_length} 字符")
                    # 截取前 50000 字符作为上下文（增加到 5 倍，约 50KB）
                    if len(markdown_content) > 50000:
                        markdown_content = markdown_content[:50000] + "\n\n... (内容过长，已截断)"
                    context_parts.append(f"📝 论文内容:\n{markdown_content}")
            except Exception as e:
                print(f"⚠️  读取 Markdown 失败: {e}")
        else:
            if markdown_path:
                print(f"⚠️  Markdown 文件不存在: {markdown_path}")
        
        # 3. 上下文包（从 session_data 中读取）
        session_dict = session_data.get('session_data', {})
        context_packages = session_dict.get('context_packages', {})
        
        if context_packages:
            context_parts.append("📦 上下文包:")
            for key, value in context_packages.items():
                context_parts.append(f"  - {key}: {value}")
        
        # 4. 阅读计划（如果存在）
        reading_plan = session_dict.get('reading_plan')
        if reading_plan:
            context_parts.append(f"📋 阅读计划:\n{reading_plan}")
        
        return "\n\n".join(context_parts) if context_parts else "暂无上下文信息"
    
    def _build_context_with_agent_status(self, session_data: Dict, target_agent: str) -> str:
        """
        构建包含智能体询问状态的上下文
        
        Args:
            session_data: 会话数据
            target_agent: 目标智能体名称
        
        Returns:
            context: 包含状态信息的上下文字符串
        """
        # 获取基础上下文
        base_context = self._build_context(session_data)
        
        # 获取agent_inquiry_status
        session_dict = session_data.get('session_data', {})
        agent_inquiry_status = session_dict.get('agent_inquiry_status', {})
        
        # 判断该智能体是否已被询问
        is_first_inquiry = not agent_inquiry_status.get(target_agent, False)
        
        # 添加模块交互状态信息（格式更清晰）
        status_text = f"\n\n===== 重要：模块交互状态 =====\n"
        status_text += f"当前模块: {AGENT_DISPLAY_NAMES.get(target_agent, target_agent)}\n"
        status_text += f"交互状态: {'未询问（首次询问）' if is_first_inquiry else '已询问（非首次询问）'}\n"
        if is_first_inquiry:
            status_text += "⚠️ 这是用户首次询问此模块，请使用「首次引导模式」输出！\n"
        else:
            status_text += "✅ 用户已询问过此模块，请使用「常规模式」输出！\n"
        status_text += "============================="
        
        print(f"\n🔍 智能体状态检测:")
        print(f"   目标智能体: {target_agent}")
        print(f"   是否首次询问: {is_first_inquiry}")
        print(f"   当前状态记录: {agent_inquiry_status}")
        
        return f"{base_context}{status_text}"
    
    def _update_agent_inquiry_status(self, session_id: str, agent_name: str):
        """
        更新智能体询问状态
        
        Args:
            session_id: 会话ID
            agent_name: 智能体名称
        """
        from db import db
        
        # 获取当前session_data
        session_data = db.get_session(session_id)
        if not session_data:
            return
        
        session_dict = session_data.get('session_data', {})
        agent_inquiry_status = session_dict.get('agent_inquiry_status', {})
        
        # 更新状态
        agent_inquiry_status[agent_name] = True
        session_dict['agent_inquiry_status'] = agent_inquiry_status
        
        # 保存回数据库
        db.update_session(session_id, session_data=session_dict)
        
        print(f"✅ 已更新 {agent_name} 的询问状态为：已询问")
    
    def _call_llm(
        self,
        system_prompt: str,
        context: str,
        user_message: str,
        chat_history: List[Dict]
    ) -> str:
        """
        调用 OpenAI API（带重试机制）
        
        Args:
            system_prompt: 系统 Prompt（智能体的角色定义）
            context: 上下文信息
            user_message: 用户消息
            chat_history: 历史对话
        
        Returns:
            assistant_response: AI 回复
        """
        # 检查是否是 Gemini 模型
        is_gemini = 'gemini' in self.model.lower()
        
        # 构建消息列表
        if is_gemini:
            # Gemini 不支持 system 角色，需要特殊处理
            # 将 system prompt 和 context 合并到第一条 user 消息中
            system_content = system_prompt
            if context:
                system_content += f"\n\n以下是当前会话的上下文信息：\n\n{context}"
            
            messages = []
            
            # 添加历史对话（只保留最近 10 轮）
            recent_history = chat_history[-20:] if len(chat_history) > 20 else chat_history
            for msg in recent_history:
                role = msg.get("role", "user")
                # Gemini 只支持 user 和 model (assistant)
                if role == "assistant":
                    role = "model"
                messages.append({
                    "role": role,
                    "content": msg.get("content", "")
                })
            
            # 将 system prompt 和用户消息合并
            combined_user_message = f"{system_content}\n\n用户问题：{user_message}"
            messages.append({
                "role": "user",
                "content": combined_user_message
            })
        else:
            # OpenAI 标准格式
            messages = [
                {
                    "role": "system",
                    "content": system_prompt
                }
            ]
            
            # 添加上下文（作为系统消息）
            if context:
                messages.append({
                    "role": "system",
                    "content": f"以下是当前会话的上下文信息：\n\n{context}"
                })
            
            # 添加历史对话（只保留最近 10 轮，避免超长）
            recent_history = chat_history[-20:] if len(chat_history) > 20 else chat_history
            for msg in recent_history:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
            
            # 添加当前用户消息
            messages.append({
                "role": "user",
                "content": user_message
            })
        
        # 重试逻辑
        for attempt in range(self.max_retries):
            try:
                # 调用 OpenAI API
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens
                )
                
                # 检查响应是否有效
                if not response.choices or len(response.choices) == 0:
                    raise ValueError("API 返回的 choices 列表为空")
                
                assistant_response = response.choices[0].message.content
                
                # 检查内容是否为空
                if assistant_response is None:
                    raise ValueError("API 返回的内容为 None")
                
                return assistant_response
            
            except Exception as e:
                print(f"❌ OpenAI API 调用失败 (尝试 {attempt + 1}/{self.max_retries}): {e}")
                print(f"   模型: {self.model}")
                print(f"   消息数量: {len(messages)}")
                
                if attempt < self.max_retries - 1:
                    # 指数退避
                    wait_time = 2 ** attempt
                    print(f"⏳ 等待 {wait_time} 秒后重试...")
                    time.sleep(wait_time)
                else:
                    # 所有重试都失败
                    return f"抱歉，我遇到了一些问题无法回复。请稍后再试。\n\n错误详情：{str(e)}"
    
    def _call_llm_stream(
        self,
        system_prompt: str,
        context: str,
        user_message: str,
        chat_history: List[Dict]
    ):
        """
        调用 OpenAI API（流式输出）
        
        Args:
            system_prompt: 系统 Prompt（智能体的角色定义）
            context: 上下文信息
            user_message: 用户消息
            chat_history: 历史对话
        
        Yields:
            str: 流式输出的文本片段
        """
        # 检查是否是 Gemini 模型
        is_gemini = 'gemini' in self.model.lower()
        
        # 构建消息列表（与非流式方法相同）
        if is_gemini:
            system_content = system_prompt
            if context:
                system_content += f"\n\n以下是当前会话的上下文信息：\n\n{context}"
            
            messages = []
            recent_history = chat_history[-20:] if len(chat_history) > 20 else chat_history
            for msg in recent_history:
                role = msg.get("role", "user")
                if role == "assistant":
                    role = "model"
                messages.append({
                    "role": role,
                    "content": msg.get("content", "")
                })
            
            combined_user_message = f"{system_content}\n\n用户问题：{user_message}"
            messages.append({
                "role": "user",
                "content": combined_user_message
            })
        else:
            messages = [
                {
                    "role": "system",
                    "content": system_prompt
                }
            ]
            
            if context:
                messages.append({
                    "role": "system",
                    "content": f"以下是当前会话的上下文信息：\n\n{context}"
                })
            
            recent_history = chat_history[-20:] if len(chat_history) > 20 else chat_history
            for msg in recent_history:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
            
            messages.append({
                "role": "user",
                "content": user_message
            })
        
        try:
            # 调用 OpenAI API (流式)
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                stream=True  # 启用流式输出
            )
            
            # 逐块返回内容
            for chunk in stream:
                # 检查 chunk 是否有 choices
                if not chunk.choices or len(chunk.choices) == 0:
                    continue
                
                # 检查 delta 是否有 content
                delta = chunk.choices[0].delta
                if hasattr(delta, 'content') and delta.content is not None:
                    yield delta.content
            
        except Exception as e:
            print(f"❌ 流式 API 调用失败: {e}")
            print(f"   模型: {self.model}")
            yield f"\n\n抱歉，我遇到了一些问题无法回复。请稍后再试。\n\n错误详情：{str(e)}"
    
    def process_message_stream(
        self,
        session_id: str,
        user_message: str,
        session_data: Dict
    ):
        """
        处理用户消息（流式输出版本）
        
        Args:
            session_id: 会话 ID
            user_message: 用户消息
            session_data: 会话数据
        
        Yields:
            dict: 包含 content 和 state 的字典
        """
        current_state = session_data.get('current_state', 'GUIDE_PENDING_REPORT')
        
        # 状态路由逻辑：章节状态直接路由
        chapter_states = ['INTRODUCTION', 'REVIEW', 'METHOD', 'RESULT', 'DISCUSSION', 'CONTROL_ROUTING']
        if current_state in chapter_states and user_message:
            # 流式版本：逐字返回
            for chunk_data in self._handle_control_routing_stream(session_id, user_message, session_data):
                yield chunk_data
            return
        
        # 获取智能体和 Prompt
        agent_name = self._get_agent_by_state(current_state)
        system_prompt = prompt_manager.get_prompt(agent_name)
        context = self._build_context(session_data)
        
        # 特殊处理 guidance_agent 的场景三：先完整收集响应，检测路由标记
        if agent_name == 'guidance' and current_state == 'GUIDE_PENDING_PLAN':
            # 先收集完整响应（不流式输出）
            full_response = ""
            for chunk in self._call_llm_stream(
                system_prompt=system_prompt,
                context=context,
                user_message=user_message,
                chat_history=session_data.get('session_data', {}).get('chat_history', [])
            ):
                full_response += chunk
            
            # 检测场景三的路由标记
            import json
            import re
            try:
                json_match = re.search(r'\{[^}]*"route"[^}]*\}', full_response)
                if json_match:
                    route_data = json.loads(json_match.group())
                    if route_data.get('route') == 'content_question':
                        print("🔄 检测到场景三路由标记，自动转发到 control_routing")
                        # 直接流式输出真正的答案，不输出 guidance 的响应（包含JSON）
                        for chunk_data in self._handle_control_routing_stream(session_id, user_message, session_data):
                            yield chunk_data
                        return
            except Exception as e:
                print(f"⚠️  解析路由标记失败: {e}")
            
            # 如果没有路由标记，正常流式输出 guidance 的响应
            for i, char in enumerate(full_response):
                yield {'content': char, 'done': False}
            yield {'event': 'done', 'state': self._determine_next_state(
                current_state=current_state,
                user_message=user_message,
                assistant_response=full_response,
                session_data=session_data
            ), 'done': True}
            return
        
        # 其他智能体：正常流式调用 LLM
        full_response = ""
        for chunk in self._call_llm_stream(
            system_prompt=system_prompt,
            context=context,
            user_message=user_message,
            chat_history=session_data.get('session_data', {}).get('chat_history', [])
        ):
            full_response += chunk
            yield {'content': chunk, 'done': False}
        
        # 🔧 调试标签：仅为非 guidance 智能体添加（导读智能体不需要）
        if agent_name != 'guidance':
            # 获取智能体状态，判断模式
            session_dict = session_data.get('session_data', {})
            agent_inquiry_status = session_dict.get('agent_inquiry_status', {})
            is_first_inquiry = not agent_inquiry_status.get(agent_name, False)
            
            mode_text = "首次模式" if is_first_inquiry else "常规模式"
            # 简化的智能体名称映射
            agent_short_names = {
                'introduction': '引言',
                'review': '综述',
                'method': '方法',
                'result': '结果',
                'discussion': '讨论',
                'general': '通用',
                'concept': '概念'
            }
            agent_short = agent_short_names.get(agent_name, agent_name)
            debug_tag = f"\n\n---\n【{agent_short}】【{mode_text}】"
            
            # 逐字输出调试标签
            for char in debug_tag:
                yield {'content': char, 'done': False}
            
            full_response += debug_tag
        
        # 判断新状态
        new_state = self._determine_next_state(
            current_state=current_state,
            user_message=user_message,
            assistant_response=full_response,
            session_data=session_data
        )
        
        # 发送完成信号
        yield {'done': True, 'state': new_state, 'full_response': full_response}
    
    def _handle_control_routing_stream(
        self,
        session_id: str,
        user_message: str,
        session_data: Dict
    ):
        """
        处理CONTROL_ROUTING状态（流式版本）
        
        Args:
            session_id: 会话 ID
            user_message: 用户消息
            session_data: 会话数据
        
        Yields:
            dict: 包含 content 和 state 的字典
        """
        # 1. 调用control_agent进行路由决策（非流式，快速判断）
        control_prompt = prompt_manager.get_prompt('control')
        context = self._build_context(session_data)
        
        routing_response = self._call_llm(
            system_prompt=control_prompt,
            context=context,
            user_message=f"用户问题：{user_message}\n\n请分析这个问题应该路由给哪个智能体。",
            chat_history=[]
        )
        
        print("\n" + "="*60)
        print("🎯 中控智能体 (Control Agent) 路由决策：")
        print("="*60)
        print(routing_response)
        print("="*60 + "\n")
        
        # 2. 解析路由决策
        import json
        import re
        
        target_agent = None
        try:
            # 尝试提取JSON
            try:
                routing_json = json.loads(routing_response.strip())
                target_agent = routing_json.get('agent_name')
            except:
                json_block_match = re.search(r'```json\s*(\{[^}]+\})\s*```', routing_response, re.DOTALL)
                if json_block_match:
                    routing_json = json.loads(json_block_match.group(1))
                    target_agent = routing_json.get('agent_name')
                else:
                    json_match = re.search(r'\{[^}]+\}', routing_response)
                    if json_match:
                        routing_json = json.loads(json_match.group())
                        target_agent = routing_json.get('agent_name')
            
            if target_agent:
                print(f"✅ 路由决策成功: {target_agent}")
        except Exception as e:
            print(f"❌ 解析路由决策失败: {e}")
        
        if not target_agent:
            print("⚠️  无法解析路由决策，使用general作为默认")
            target_agent = 'general'
        
        # 标准化agent名称
        if target_agent.endswith('_agent'):
            target_agent = target_agent.replace('_agent', '')
        
        # 3. 构建context并调用目标智能体（流式输出）
        context_with_status = self._build_context_with_agent_status(session_data, target_agent)
        target_prompt = prompt_manager.get_prompt(target_agent)
        
        # 在调用前记录当前状态，用于判断模式
        session_dict = session_data.get('session_data', {})
        agent_inquiry_status = session_dict.get('agent_inquiry_status', {})
        is_first_inquiry = not agent_inquiry_status.get(target_agent, False)
        
        full_response = ""
        for chunk in self._call_llm_stream(
            system_prompt=target_prompt,
            context=context_with_status,
            user_message=user_message,
            chat_history=session_data.get('session_data', {}).get('chat_history', [])
        ):
            full_response += chunk
            yield {'content': chunk, 'done': False}
        
        # 🔧 调试标签：在流式输出末尾添加智能体和模式信息
        mode_text = "首次模式" if is_first_inquiry else "常规模式"
        # 简化的智能体名称映射
        agent_short_names = {
            'introduction': '引言',
            'review': '综述',
            'method': '方法',
            'result': '结果',
            'discussion': '讨论',
            'general': '通用',
            'concept': '概念'
        }
        agent_short = agent_short_names.get(target_agent, target_agent)
        debug_tag = f"\n\n---\n【{agent_short}】【{mode_text}】"
        
        # 逐字输出调试标签
        for char in debug_tag:
            yield {'content': char, 'done': False}
        
        full_response += debug_tag
        
        # 4. 更新agent_inquiry_status
        self._update_agent_inquiry_status(session_id, target_agent)
        
        # 5. 确定新状态
        agent_to_state = {
            'introduction': 'INTRODUCTION',
            'review': 'REVIEW',
            'method': 'METHOD',
            'result': 'RESULT',
            'discussion': 'DISCUSSION',
        }
        new_state = agent_to_state.get(target_agent, 'CONTROL_ROUTING')
        
        # 6. 发送完成信号
        yield {'done': True, 'state': new_state, 'full_response': full_response}
    
    def _determine_next_state(
        self,
        current_state: str,
        user_message: str,
        assistant_response: str,
        session_data: Dict
    ) -> str:
        """
        判断下一个状态
        
        根据设计文档的 FSM 流程：
        GUIDE_PENDING_REPORT → GUIDE_PENDING_PLAN → CONTROL_ROUTING → 具体章节智能体
        
        Args:
            current_state: 当前状态
            user_message: 用户消息
            assistant_response: AI 回复
            session_data: 会话数据
        
        Returns:
            new_state: 新状态
        """
        # 简化的状态转换逻辑（可以根据实际需求扩展）
        
        print(f"🔄 状态转换判断 - 当前状态: {current_state}")
        print(f"🔄 用户消息: '{user_message}'")
        print(f"🔄 助手回复长度: {len(assistant_response)} 字符")
        
        # 1. GUIDE_PENDING_REPORT: 等待用户上传论文或提问
        if current_state == 'GUIDE_PENDING_REPORT':
            # 如果已经有论文，并且是空消息触发（首次自动触发）
            if session_data.get('paper_path') and user_message == '':
                print("🔄 检测到首次自动触发（空消息），转到 GUIDE_PENDING_PLAN 等待用户回应")
                # 生成初始报告后，转到 GUIDE_PENDING_PLAN，等待用户回复兴趣点
                return 'GUIDE_PENDING_PLAN'
            
            # 如果用户已经回复了（非空消息），需要判断回复类型
            if session_data.get('paper_path') and user_message != '':
                # 检测是否是内容性问题（场景三） - 这部分逻辑已经在 process_message 中处理
                # 如果执行到这里，说明是场景一或场景二，应该生成阅读路径后转到 CONTROL_ROUTING
                print("🔄 用户回复了目标/背景信息，保持在 GUIDE_PENDING_PLAN")
                return 'GUIDE_PENDING_PLAN'
            
            return current_state
        
        # 2. GUIDE_PENDING_PLAN: 引导智能体生成阅读计划
        if current_state == 'GUIDE_PENDING_PLAN':
            # 如果是第一次进入这个状态（空消息），等待用户回复
            if user_message == '':
                print("🔄 第一次进入 GUIDE_PENDING_PLAN（导读报告已生成），等待用户回复")
                return current_state
            
            # 如果用户已回复，检测是否已生成阅读计划
            if user_message != '':
                # 生成了个性化阅读路径或沙漏式阅读法后，转到 CONTROL_ROUTING
                print("🔄 用户已回复目标信息，引导智能体应生成路径，转到 CONTROL_ROUTING")
                return 'CONTROL_ROUTING'
            
            return current_state
        
        # 3. CONTROL_ROUTING: 中控智能体路由到具体章节
        # 注意：CONTROL_ROUTING状态的处理已经在process_message中特殊处理
        # 这里不应该被执行到，因为会在_handle_control_routing中完成路由
        if current_state == 'CONTROL_ROUTING':
            # 保持在 CONTROL_ROUTING，等待下次路由
            return current_state
        
        # 4. 具体章节智能体：保持当前状态，等待用户切换
        # （可以扩展为自动检测何时返回 CONTROL_ROUTING）
        return current_state
    
    def force_state_transition(self, session_id: str, new_state: str) -> bool:
        """
        强制状态转换（供外部调用）
        
        Args:
            session_id: 会话 ID
            new_state: 新状态
        
        Returns:
            success: 是否成功
        """
        try:
            db.update_session(session_id, current_state=new_state)
            print(f"✅ 会话 {session_id} 状态已更新为 {new_state}")
            return True
        except Exception as e:
            print(f"❌ 状态转换失败: {e}")
            return False


# 创建全局实例
try:
    orchestrator = AgentOrchestrator()
    print("✅ 智能体编排器初始化成功")
except ValueError as e:
    print(f"⚠️  智能体编排器初始化失败: {e}")
    print("    请设置 OPENAI_API_KEY 环境变量")
    orchestrator = None
