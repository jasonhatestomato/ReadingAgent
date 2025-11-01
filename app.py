"""
Reading Agent Flask 应用
主应用文件
"""
from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename
import os
from config import FLASK_CONFIG, UPLOAD_CONFIG, LOCAL_PAPERS_CONFIG
from db import db
from prompt_manager import prompt_manager
from agent_orchestrator import orchestrator

# PDF 转换器（使用 MinerU API）
try:
    from pdf_converter import pdf_converter
    PDF_CONVERTER_AVAILABLE = pdf_converter is not None
    if PDF_CONVERTER_AVAILABLE:
        print("✅ PDF 转换器加载成功（MinerU API）")
    else:
        print("⚠️  PDF 转换器未配置，请在 api_config.json 中填写 pdf_converter.api_token")
except ImportError as e:
    print(f"⚠️  PDF 转换器加载失败: {e}")
    print("    如需启用，请运行: pip install requests")
    PDF_CONVERTER_AVAILABLE = False

# 创建 Flask 应用
app = Flask(__name__)
app.config.update(FLASK_CONFIG)

# ========== 页面路由 ==========

@app.route('/')
def index():
    """欢迎页"""
    return render_template('welcome.html')

@app.route('/main')
def main():
    """主页面"""
    return render_template('index.html')

# ========== API 路由 ==========

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """获取用户的会话列表"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({'success': False, 'error': '缺少 user_id'}), 400
        
        sessions = db.get_user_sessions(user_id)
        
        return jsonify({
            'success': True,
            'sessions': sessions
        })
    except Exception as e:
        print(f"获取会话列表失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/oss-config', methods=['GET'])
def get_oss_config():
    """获取OSS配置信息供前端直传使用"""
    try:
        # 读取OSS配置
        import json
        from pathlib import Path
        
        config_dir = Path(__file__).parent / 'config' / 'oss'
        
        # 读取bucket信息
        with open(config_dir / 'info', 'r', encoding='utf-8') as f:
            info_lines = f.readlines()
            bucket = info_lines[0].split('：')[1].strip()
            region = info_lines[1].split('：')[1].strip()
        
        # 读取AccessKey
        with open(config_dir / 'AccessKey.csv', 'r', encoding='utf-8') as f:
            lines = f.readlines()
            access_key_id, access_key_secret = lines[1].strip().split(',')
        
        # 生成OSS endpoint
        region_map = {
            '华东2（上海）': 'oss-cn-shanghai',
            '华北2（北京）': 'oss-cn-beijing',
            '华东1（杭州）': 'oss-cn-hangzhou',
            '华南1（深圳）': 'oss-cn-shenzhen'
        }
        
        endpoint = f"https://{region_map.get(region, 'oss-cn-shanghai')}.aliyuncs.com"
        
        return jsonify({
            'success': True,
            'config': {
                'accessKeyId': access_key_id,
                'accessKeySecret': access_key_secret,
                'bucket': bucket,
                'region': region,
                'endpoint': endpoint
            }
        })
    except Exception as e:
        print(f"获取OSS配置失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/session/<session_id>', methods=['GET'])
def get_session(session_id):
    """获取单个会话详情"""
    try:
        session_data = db.get_session(session_id)
        
        if not session_data:
            return jsonify({'success': False, 'error': '会话不存在'}), 404
        
        return jsonify({
            'success': True,
            'session': session_data
        })
    except Exception as e:
        print(f"获取会话失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """接收前端上传到OSS后的URL并转换为 Markdown"""
    try:
        data = request.get_json()
        
        # 从前端获取参数
        user_id = data.get('user_id')
        pdf_url = data.get('pdf_url')  # 前端上传到OSS后的公网URL
        title = data.get('title', '')
        
        if not user_id:
            return jsonify({'success': False, 'error': '缺少 user_id'}), 400
        
        if not pdf_url:
            return jsonify({'success': False, 'error': '缺少 pdf_url'}), 400
        
        # 检查URL格式
        if not pdf_url.lower().endswith('.pdf'):
            return jsonify({'success': False, 'error': '只支持 PDF 文件'}), 400
        
        # 如果没有提供标题，从URL提取
        if not title:
            title = pdf_url.split('/')[-1].replace('.pdf', '')
        
        # 转换 PDF 为 Markdown
        markdown_path = None
        if PDF_CONVERTER_AVAILABLE:
            try:
                markdown_filename = title.replace(' ', '_') + '.md'
                markdown_output = UPLOAD_CONFIG['markdown_folder'] / markdown_filename
                # 直接使用OSS URL进行转换
                markdown_path = pdf_converter.convert_pdf_to_markdown(
                    pdf_url=pdf_url,  # 直接传递URL
                    output_path=str(markdown_output)
                )
                print(f"✅ PDF 转换为 Markdown: {markdown_path}")
            except Exception as e:
                print(f"⚠️  PDF 转 Markdown 失败（将继续）: {e}")
                # 转换失败不影响会话创建
        else:
            print("⚠️  PDF 转换功能未启用")
        
        # 创建会话
        session_id = db.create_session(
            user_id=user_id,
            title=title,
            paper_path=pdf_url,  # 保存OSS URL而非本地路径
            markdown_path=markdown_path
        )
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'title': title,
            'pdf_url': pdf_url,
            'has_markdown': markdown_path is not None
        })
    except Exception as e:
        print(f"上传文件失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    """处理对话请求"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        session_id = data.get('session_id')
        message = data.get('message', '')  # 允许空消息（触发导读报告）
        
        if not all([user_id, session_id]) or message is None:
            return jsonify({'success': False, 'error': '缺少必要参数'}), 400
        
        # 获取会话
        session_data = db.get_session(session_id)
        if not session_data:
            return jsonify({'success': False, 'error': '会话不存在'}), 404
        
        # 检查智能体编排器是否可用
        if orchestrator is None:
            return jsonify({
                'success': False,
                'error': '智能体编排器未初始化，请检查 OPENAI_API_KEY 环境变量'
            }), 500
        
        # 使用智能体编排器处理消息
        try:
            assistant_response, new_state = orchestrator.process_message(
                session_id=session_id,
                user_message=message,
                session_data=session_data
            )
        except Exception as e:
            print(f"❌ 智能体处理失败: {e}")
            return jsonify({
                'success': False,
                'error': f'智能体处理失败: {str(e)}'
            }), 500
        
        # 更新会话历史
        db.update_chat_history(session_id, {'role': 'user', 'content': message})
        db.update_chat_history(session_id, {'role': 'assistant', 'content': assistant_response})
        
        # 如果状态变化，更新数据库
        if new_state != session_data['current_state']:
            db.update_session(session_id, current_state=new_state)
            print(f"🔄 会话 {session_id} 状态: {session_data['current_state']} → {new_state}")
        
        return jsonify({
            'success': True,
            'response': assistant_response,
            'current_state': new_state
        })
    except Exception as e:
        print(f"处理对话失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/chat/stream', methods=['POST'])
def chat_stream():
    """处理对话请求（流式输出）"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        session_id = data.get('session_id')
        message = data.get('message', '')
        
        if not all([user_id, session_id]) or message is None:
            return jsonify({'success': False, 'error': '缺少必要参数'}), 400
        
        # 获取会话
        session_data = db.get_session(session_id)
        if not session_data:
            return jsonify({'success': False, 'error': '会话不存在'}), 404
        
        # 检查智能体编排器是否可用
        if orchestrator is None:
            return jsonify({
                'success': False,
                'error': '智能体编排器未初始化'
            }), 500
        
        def generate():
            """SSE 生成器"""
            import json
            full_response = ""
            final_state = session_data['current_state']
            
            try:
                # 先保存用户消息
                db.update_chat_history(session_id, {'role': 'user', 'content': message})
                
                # 流式处理消息
                for chunk_data in orchestrator.process_message_stream(
                    session_id=session_id,
                    user_message=message,
                    session_data=session_data
                ):
                    if chunk_data.get('done'):
                        # 流结束
                        final_state = chunk_data.get('state', final_state)
                        if 'full_response' in chunk_data:
                            full_response = chunk_data['full_response']
                        yield f"data: {json.dumps({'event': 'done', 'state': final_state}, ensure_ascii=False)}\n\n"
                    else:
                        # 流式内容
                        content = chunk_data.get('content', '')
                        full_response += content
                        yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
                
                # 保存助手消息
                db.update_chat_history(session_id, {'role': 'assistant', 'content': full_response})
                
                # 更新状态
                if final_state != session_data['current_state']:
                    db.update_session(session_id, current_state=final_state)
                    print(f"🔄 会话 {session_id} 状态: {session_data['current_state']} → {final_state}")
                
            except Exception as e:
                print(f"❌ 流式处理失败: {e}")
                error_msg = f"处理失败: {str(e)}"
                yield f"data: {json.dumps({'error': error_msg}, ensure_ascii=False)}\n\n"
        
        return app.response_class(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )
    
    except Exception as e:
        print(f"流式对话失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/convert-to-markdown', methods=['POST'])
def convert_to_markdown():
    """PDF 转 Markdown（兼容接口，实际在上传时已完成）"""
    try:
        # 这个接口主要是为了兼容前端，实际转换在上传时已完成
        # 直接返回成功
        return jsonify({
            'success': True,
            'message': 'PDF已在上传时转换为Markdown'
        })
    except Exception as e:
        print(f"转换接口调用失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/generate-mindmap', methods=['POST'])
def generate_mindmap():
    """生成思维导图（Markdown 大纲）"""
    global orchestrator
    
    try:
        data = request.get_json() or {}
        session_id = data.get('session_id') or request.args.get('session_id')
        
        # 尝试从前端获取 session_id
        if not session_id and hasattr(request, 'referrer'):
            # 可以从 localStorage 或当前会话获取
            pass
        
        # 如果没有提供 session_id，尝试获取最近的会话
        if not session_id:
            # 这里可以根据实际情况调整逻辑
            return jsonify({
                'success': False,
                'error': '缺少 session_id，请先上传论文'
            }), 400
        
        # 获取会话数据
        session_data = db.get_session(session_id)
        if not session_data:
            return jsonify({'success': False, 'error': '会话不存在'}), 404
        
        # 检查是否已有缓存的思维导图
        session_dict = session_data.get('session_data', {})
        cached_mindmap = session_dict.get('mindmap_outline')
        
        if cached_mindmap:
            print("✅ 返回缓存的思维导图")
            return jsonify({
                'success': True,
                'markdown': cached_mindmap,
                'from_cache': True
            })
        
        # 检查智能体编排器
        if orchestrator is None:
            return jsonify({
                'success': False,
                'error': '智能体编排器未初始化'
            }), 500
        
        # 构建用于生成思维导图的 Prompt
        mindmap_prompt = """你是一个专业的学术论文分析助手。请基于提供的论文内容，生成一份简洁的思维导图大纲。

要求：
1. 使用 Markdown 标题格式（# ## ### ####）
2. 结构清晰，层级分明（建议 2-4 层）
3. 每个节点简洁明了（5-10个字）
4. 涵盖论文的核心结构：研究背景、研究问题、研究方法、主要发现、研究结论
5. 不要添加任何解释性文字，只输出 Markdown 格式的大纲

示例格式：
# 论文标题
## 研究背景
### 理论基础
### 研究现状
## 研究问题
### 核心问题
### 研究假设
## 研究方法
### 实验设计
### 数据采集
## 主要发现
### 发现一
### 发现二
## 研究结论
### 理论贡献
### 实践意义
"""
        
        # 构建上下文
        from agent_orchestrator import orchestrator
        context = orchestrator._build_context(session_data)
        
        # 调用 LLM 生成大纲
        try:
            mindmap_outline = orchestrator._call_llm(
                system_prompt=mindmap_prompt,
                context=context,
                user_message="请为这篇论文生成思维导图大纲",
                chat_history=[]
            )
            
            # 清理可能的多余内容（只保留 Markdown 标题）
            lines = mindmap_outline.split('\n')
            cleaned_lines = []
            for line in lines:
                stripped = line.strip()
                # 只保留以 # 开头的标题行和空行
                if stripped.startswith('#') or stripped == '':
                    cleaned_lines.append(line)
            
            mindmap_outline = '\n'.join(cleaned_lines).strip()
            
            # 缓存到数据库
            session_dict['mindmap_outline'] = mindmap_outline
            db.update_session(session_id, session_data=session_dict)
            
            print("✅ 思维导图大纲生成成功")
            
            return jsonify({
                'success': True,
                'markdown': mindmap_outline,
                'from_cache': False
            })
            
        except Exception as e:
            print(f"❌ 生成思维导图失败: {e}")
            return jsonify({
                'success': False,
                'error': f'生成失败: {str(e)}'
            }), 500
        
    except Exception as e:
        print(f"思维导图接口失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/proactive-summary', methods=['POST'])
def proactive_summary():
    """生成导读报告（使用智能体编排器）"""
    try:
        # 从 session 或 localStorage 获取当前会话信息
        # 前端应该通过某种方式传递 session_id
        data = request.get_json() or {}
        session_id = data.get('session_id') or request.args.get('session_id')
        
        if not session_id:
            # 尝试从最近的会话获取（临时方案）
            return jsonify({
                'success': False,
                'error': '缺少 session_id'
            }), 400
        
        # 获取会话
        session_data = db.get_session(session_id)
        if not session_data:
            return jsonify({'success': False, 'error': '会话不存在'}), 404
        
        # 检查智能体编排器
        if orchestrator is None:
            return jsonify({
                'success': False,
                'error': '智能体编排器未初始化'
            }), 500
        
        # 使用空消息触发导读报告
        try:
            assistant_response, new_state = orchestrator.process_message(
                session_id=session_id,
                user_message='',  # 空消息触发导读
                session_data=session_data
            )
            
            # 重要：保存导读报告到会话历史
            # 注意：空消息不保存为user消息，只保存assistant的回复
            db.update_chat_history(session_id, {'role': 'assistant', 'content': assistant_response})
            
            # 更新会话状态
            if new_state != session_data['current_state']:
                db.update_session(session_id, current_state=new_state)
                print(f"🔄 导读报告生成后状态更新: {session_data['current_state']} → {new_state}")
            
            return jsonify({
                'success': True,
                'summary': assistant_response,
                'guiding_questions': {
                    'introduction': '对于引言部分，您有什么问题吗？',
                    'questions': []  # 可以根据需要扩展
                }
            })
        except Exception as e:
            print(f"❌ 生成导读报告失败: {e}")
            return jsonify({
                'success': False,
                'error': f'生成失败: {str(e)}'
            }), 500
        
    except Exception as e:
        print(f"导读报告接口失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/local-papers', methods=['GET'])
def get_local_papers():
    """获取本地论文列表"""
    try:
        local_papers_folder = LOCAL_PAPERS_CONFIG['local_papers_folder']
        
        # 获取所有 PDF 和 Markdown 文件
        papers = []
        
        # 扫描 PDF 文件
        for pdf_file in local_papers_folder.glob('*.pdf'):
            # 检查是否有对应的 Markdown 文件
            md_file = pdf_file.with_suffix('.md')
            has_markdown = md_file.exists()
            
            papers.append({
                'filename': pdf_file.name,
                'title': pdf_file.stem,  # 文件名不含扩展名
                'path': str(pdf_file),
                'has_markdown': has_markdown,
                'markdown_path': str(md_file) if has_markdown else None,
                'size': pdf_file.stat().st_size,
                'type': 'pdf'
            })
        
        # 扫描独立的 Markdown 文件（没有对应 PDF）
        for md_file in local_papers_folder.glob('*.md'):
            pdf_file = md_file.with_suffix('.pdf')
            if not pdf_file.exists():  # 只添加没有对应 PDF 的 MD 文件
                papers.append({
                    'filename': md_file.name,
                    'title': md_file.stem,
                    'path': None,  # 纯 Markdown，没有 PDF
                    'has_markdown': True,
                    'markdown_path': str(md_file),
                    'size': md_file.stat().st_size,
                    'type': 'markdown'
                })
        
        # 按文件名排序
        papers.sort(key=lambda x: x['filename'])
        
        return jsonify({
            'success': True,
            'papers': papers,
            'count': len(papers)
        })
    except Exception as e:
        print(f"获取本地论文列表失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/use-local-paper', methods=['POST'])
def use_local_paper():
    """使用本地论文创建会话"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        filename = data.get('filename')
        
        if not all([user_id, filename]):
            return jsonify({'success': False, 'error': '缺少必要参数'}), 400
        
        # 安全检查：防止路径遍历攻击（但保留中文字符）
        if '..' in filename or filename.startswith('/'):
            return jsonify({'success': False, 'error': '非法文件名'}), 400
        
        # 确定文件类型和路径
        local_papers_folder = LOCAL_PAPERS_CONFIG['local_papers_folder']
        
        # 先检查 PDF
        if filename.endswith('.pdf'):
            pdf_path = local_papers_folder / filename
            if not pdf_path.exists():
                return jsonify({'success': False, 'error': f'文件不存在: {filename}'}), 404
            
            paper_path = str(pdf_path)
            title = filename.replace('.pdf', '')
            
            # 检查是否有对应的 Markdown
            md_path = pdf_path.with_suffix('.md')
            markdown_path = str(md_path) if md_path.exists() else None
        
        # 再检查 Markdown
        elif filename.endswith('.md'):
            md_path = local_papers_folder / filename
            if not md_path.exists():
                return jsonify({'success': False, 'error': f'文件不存在: {filename}'}), 404
            
            markdown_path = str(md_path)
            pdf_path = md_path.with_suffix('.pdf')
            paper_path = str(pdf_path) if pdf_path.exists() else None
            title = filename.replace('.md', '')
        
        else:
            return jsonify({'success': False, 'error': f'不支持的文件格式: {filename}'}), 400
        
        # 创建会话
        session_id = db.create_session(
            user_id=user_id,
            title=title,
            paper_path=paper_path,
            markdown_path=markdown_path
        )
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'title': title,
            'has_markdown': markdown_path is not None,
            'has_pdf': paper_path is not None
        })
    except Exception as e:
        print(f"使用本地论文失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/session/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """删除会话"""
    try:
        success = db.delete_session(session_id)
        
        if success:
            return jsonify({'success': True, 'message': '会话已删除'})
        else:
            return jsonify({'success': False, 'error': '会话不存在'}), 404
    except Exception as e:
        print(f"删除会话失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== 静态文件服务 ==========

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """提供上传的文件"""
    from flask import send_from_directory
    return send_from_directory(str(UPLOAD_CONFIG['upload_folder']), filename)

@app.route('/local-papers/<filename>')
def local_paper_file(filename):
    """提供本地论文文件"""
    from flask import send_from_directory
    return send_from_directory(str(LOCAL_PAPERS_CONFIG['local_papers_folder']), filename)

# ========== 主程序入口 ==========

if __name__ == '__main__':
    from config import CURRENT_PROVIDER, OPENAI_CONFIG
    
    print("\n" + "="*60)
    print("🚀 Reading Agent 启动中...")
    print("="*60)
    print(f"📊 数据库: {db.db_path}")
    print(f"📝 Prompt 版本: {prompt_manager.default_version}")
    print(f"📁 上传目录: {UPLOAD_CONFIG['upload_folder']}")
    print(f"🤖 API 提供商: {CURRENT_PROVIDER}")
    print(f"🔧 模型: {OPENAI_CONFIG['model']}")
    
    # PDF 转换状态
    if PDF_CONVERTER_AVAILABLE:
        print(f"📄 PDF 转换: ✅ 已启用 (MinerU API)")
    else:
        print(f"📄 PDF 转换: ❌ 未启用 (需要配置 MinerU API Token)")
    
    if orchestrator:
        print(f"✅ 智能体编排器: 已初始化")
    else:
        print(f"❌ 智能体编排器: 未初始化 (请配置 API Key)")
    
    print(f"🌐 访问地址: http://localhost:5001")
    print("="*60 + "\n")
    
    app.run(debug=True, host='0.0.0.0', port=5001)
