/**
 * V2版本聊天功能 - Vue组件版本
 * 支持基于文档的智能对话
 */

// 聊天组件
const ChatComponent = {
    template: `
        <div class="chat-messages-container flex-grow-1" ref="chatMessagesContainer">
            <div id="chat-messages" class="chat-messages">
                <!-- Chat Messages -->
                <div v-for="(msg, index) in chatHistory" :key="index"
                     :class="['message', msg.role + '-message']"
                     :data-message-index="index"
                     @contextmenu.prevent="showMessageContextMenu($event, index)"
                     @click="multiSelectMode ? toggleMessageSelection(index) : null">
                    <div class="message-checkbox" v-if="multiSelectMode">
                        <div :class="['custom-checkbox', { 'checked': selectedMessages.has(index) }]">
                            <i class="fas fa-check"></i>
                        </div>
                    </div>
                    <div class="message-avatar" :class="msg.role === 'user' ? 'bg-dark' : ''">
                        <i :class="['fas', msg.role === 'user' ? 'fa-user' : 'fa-robot', msg.role === 'user' ? 'text-white' : '']"></i>
                    </div>
                    <div class="message-content">
                        <div class="message-bubble">
                            <div class="message-text" v-html="formatMessage(msg.content)"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Chat Input Area -->
        <div class="chat-input-container">
            <!-- Multi-select Toolbar -->
            <div class="multi-select-toolbar" v-if="multiSelectMode">
                <button class="btn btn-danger btn-sm me-2" @click="deleteSelectedMessages">
                    <i class="fas fa-trash me-1"></i>删除选中 ({{ selectedMessages.size}})
                </button>
                <button class="btn btn-secondary btn-sm" @click="exitMultiSelectMode">
                    <i class="fas fa-times me-1"></i>取消
                </button>
            </div>

            <!-- Model Selector - 暂时注释掉 -->
            <!--
            <div class="model-selector mb-2">
                <div class="model-dropdown">
                    <button class="btn btn-sm btn-outline-secondary model-dropdown-toggle" @click.stop="toggleModelDropdown">
                        <span class="current-model">{{ currentModel ? currentModel.model_name : '选择模型' }}</span>
                        <i :class="['fas', 'fa-chevron-up', 'dropdown-arrow', { 'rotated': modelDropdownOpen }]"></i>
                    </button>
                    <div :class="['model-dropdown-menu', { 'show': modelDropdownOpen }]">
                        <div v-if="availableModels.length === 0" class="model-option">
                            <div class="model-info">
                                <div class="model-name">加载中...</div>
                            </div>
                        </div>
                        <div v-for="model in availableModels" :key="model.model_id"
                             :class="['model-option', { 'selected': currentModel && currentModel.model_id === model.model_id }]"
                             @click.stop="selectModel(model.model_id)">
                            <div class="model-info">
                                <div class="model-name">{{ model.model_name }}</div>
                                <div class="model-provider">{{ model.provider }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            -->

            <!-- Input Box and Send Button -->
            <div class="input-group">
                <textarea
                    ref="chatInput"
                    class="form-control chat-input"
                    :placeholder="inputPlaceholder"
                    rows="1"
                    style="resize: none; min-height: 38px; max-height: 80px;"
                    @keypress.enter.prevent="handleEnter"
                    :disabled="!isInputEnabled"
                    v-model="inputText"
                ></textarea>
                <button class="btn btn-dark chat-send-btn" type="button" @click="sendMessage" :disabled="!isInputEnabled">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>

        <!-- Right-click Context Menu -->
        <div v-if="contextMenu" class="message-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
            <div class="context-menu-item" @click="deleteMessage(contextMenu.messageIndex)">
                <i class="fas fa-trash me-2"></i>删除消息
            </div>
            <div class="context-menu-item" @click="copyMessage(contextMenu.messageIndex)">
                <i class="fas fa-copy me-2"></i>复制
            </div>
            <div class="context-menu-item" @click="enterMultiSelectMode">
                <i class="fas fa-check-square me-2"></i>多选
            </div>
        </div>
    `,
    
    data() {
        return {
            chatHistory: [],
            inputText: '',
            currentModel: null,
            availableModels: [],
            modelDropdownOpen: false,
            chatMode: 'general', // 'general' or 'document'
            isDocumentLoaded: false,
            isInputEnabled: false, // Controls input and send button
            isGenerating: false, // 是否正在生成回答
            contextMenu: null,
            multiSelectMode: false,
            selectedMessages: new Set(),
            sessionId: null, // 当前会话ID
        };
    },
    
    computed: {
        inputPlaceholder() {
            if (this.isGenerating) {
                return '正在为您生成回答中...';
            }
            return this.isInputEnabled ? '输入你的问题...' : '请上传PDF文献开始对话';
        }
    },
    
    mounted() {
        this.initializeElements();
        this.bindEvents();
        this.setupTextareaAutoResize();
    },
    
    updated() {
        // 在 DOM 更新后渲染 Mermaid 图表
        this.$nextTick(() => {
            // 使用 requestAnimationFrame 确保 DOM 完全渲染
            requestAnimationFrame(() => {
                // 再添加一个 setTimeout 确保 v-html 完全完成
                setTimeout(() => {
                    this.renderMermaidDiagrams();
                }, 200);
            });
        });
    },
    
    methods: {
        initializeElements() {
            this.chatMessagesContainer = this.$refs.chatMessagesContainer;
            this.chatInput = this.$refs.chatInput;
        },
        
        bindEvents() {
            document.addEventListener('click', this.closeModelDropdown);
            document.addEventListener('click', this.hideContextMenu);
            document.addEventListener('contextmenu', this.handleGlobalContextMenu);
        },
        
        handleGlobalContextMenu(e) {
            if (e.target.closest('.message')) {
                e.preventDefault();
            }
        },
        
        setupTextareaAutoResize() {
            const textarea = this.chatInput;
            if (textarea) {
                textarea.addEventListener('input', () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                });
            }
        },
        
        async sendMessage() {
            const message = this.inputText.trim();
            if (!message || !this.isInputEnabled) return;

            this.isInputEnabled = false; // Disable input during sending
            this.isGenerating = true; // 设置生成状态

            this.chatHistory.push({ role: 'user', content: message });
            this.inputText = '';
            this.scrollToBottom();

            try {
                // 获取必要的参数
                const userId = localStorage.getItem('user_id') || 'default_user';
                const sessionId = this.sessionId || window.currentSessionId;
                
                if (!sessionId) {
                    throw new Error('未找到会话ID，请先上传论文');
                }
                
                // 使用流式接口
                const response = await fetch('/api/chat/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        user_id: userId,
                        session_id: sessionId,
                        message: message 
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '网络请求失败');
                }

                // 处理流式响应
                await this.handleStreamResponse(response);

            } catch (error) {
                console.error('发送消息失败:', error);
                this.chatHistory.push({ role: 'assistant', content: '抱歉，发送失败了: ' + error.message, isError: true });
            } finally {
                this.isInputEnabled = true; // Re-enable input
                this.isGenerating = false; // 取消生成状态
                this.scrollToBottom();
            }
        },
        
        async handleStreamResponse(response) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantMessageContent = '';
            let messageIndex = this.chatHistory.length; // Index for the new assistant message

            this.chatHistory.push({ role: 'assistant', content: '', isStreaming: true }); // Placeholder for streaming message

            try {
                let buffer = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    
                    // 保留最后一个不完整的行
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                
                                if (parsed.content) {
                                    // 流式内容
                                    assistantMessageContent += parsed.content;
                                    this.chatHistory[messageIndex].content = assistantMessageContent;
                                    this.scrollToBottom();
                                } else if (parsed.event === 'done') {
                                    // 流结束
                                    this.chatHistory[messageIndex].isStreaming = false;
                                    console.log('✅ 流式输出完成，最终状态:', parsed.state);
                                    
                                    // 流式输出完成后，手动触发 Mermaid 渲染
                                    this.$nextTick(() => {
                                        requestAnimationFrame(() => {
                                            setTimeout(() => {
                                                this.renderMermaidDiagrams();
                                            }, 300);
                                        });
                                    });
                                } else if (parsed.error) {
                                    // 错误处理
                                    this.chatHistory[messageIndex].content = parsed.error;
                                    this.chatHistory[messageIndex].isError = true;
                                    this.chatHistory[messageIndex].isStreaming = false;
                                }
                            } catch (e) {
                                console.warn('解析流数据失败:', e, 'data:', data);
                            }
                        }
                    }
                }
                
                // 处理剩余的 buffer
                if (buffer.startsWith('data: ')) {
                    const data = buffer.slice(6);
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.event === 'done') {
                            this.chatHistory[messageIndex].isStreaming = false;
                        }
                    } catch (e) {
                        console.warn('解析最后一块数据失败:', e);
                    }
                }
                
            } catch (error) {
                console.error('处理流响应失败:', error);
                this.chatHistory[messageIndex].content = assistantMessageContent || ('响应处理失败: ' + error.message);
                this.chatHistory[messageIndex].isError = true;
                this.chatHistory[messageIndex].isStreaming = false;
            } finally {
                // 确保流状态被移除
                this.chatHistory[messageIndex].isStreaming = false;
                this.scrollToBottom();
            }
        },
        
        formatMessage(text) {
            // 直接使用 marked 渲染，让 Mermaid 代码以 <code class="language-mermaid"> 的形式保留
            let html = marked ? marked.parse(text) : text;
            return html;
        },
        
        async renderMermaidDiagrams() {
            // 等待 Mermaid 加载
            await this.$nextTick();
            
            // 检查 Mermaid 是否加载
            if (!window.mermaid) {
                console.error('⚠️ Mermaid 库未加载，window.mermaid 为 undefined');
                return;
            }
            
            console.log('🔍 Mermaid 已加载，开始查找代码块...');
            
            // 查找所有 Mermaid 代码块（Marked.js 会将其渲染为 <pre><code class="language-mermaid">）
            const codeBlocks = document.querySelectorAll('pre code.language-mermaid:not([data-processed])');
            console.log(`🔍 找到 ${codeBlocks.length} 个 Mermaid 代码块`);
            
            if (codeBlocks.length === 0) {
                return;
            }
            
            // 逐个转换和渲染
            for (let i = 0; i < codeBlocks.length; i++) {
                const codeBlock = codeBlocks[i];
                try {
                    // 标记为已处理
                    codeBlock.setAttribute('data-processed', 'true');
                    
                    // 获取 Mermaid 代码
                    const code = codeBlock.textContent.trim();
                    
                    // 清理代码：移除可能导致解析错误的字符
                    const cleanedCode = code
                        .replace(/[""`´'']/g, '')  // 移除所有类型的引号
                        .replace(/（/g, '(')        // 统一括号为英文
                        .replace(/）/g, ')');
                    
                    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                    
                    console.log(`🎨 [${i+1}/${codeBlocks.length}] 渲染图表 ${id}`);
                    console.log('📝 原始代码:', code.substring(0, 100) + '...');
                    console.log('🧹 清理后代码:', cleanedCode.substring(0, 100) + '...');
                    
                    // 使用 mermaid.render 方法
                    const { svg } = await window.mermaid.render(id + '-svg', cleanedCode);
                    
                    // 创建容器并替换代码块
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mermaid-wrapper';
                    wrapper.innerHTML = svg;
                    
                    // 替换整个 <pre> 标签
                    const preElement = codeBlock.parentElement;
                    preElement.parentElement.replaceChild(wrapper, preElement);
                    
                    console.log(`✅ [${i+1}/${codeBlocks.length}] 成功渲染图表 ${id}`);
                } catch (error) {
                    console.error(`❌ [${i+1}/${codeBlocks.length}] 渲染图表失败:`, error);
                    console.error('错误详情:', error.message, error.stack);
                    codeBlock.removeAttribute('data-processed');
                    
                    // 显示错误信息
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'mermaid-error';
                    errorDiv.style.cssText = 'padding: 10px; background: #fee; border: 1px solid #fcc; border-radius: 4px; margin: 10px 0;';
                    errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #c00;"></i>
                        <span style="color: #c00; margin-left: 5px;">图表渲染失败：${error.message || '未知错误'}</span>`;
                    
                    const preElement = codeBlock.parentElement;
                    preElement.parentElement.replaceChild(errorDiv, preElement);
                }
            }
        },

        
        scrollToBottom() {
            this.$nextTick(() => {
                const container = this.$refs.chatMessagesContainer;
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            });
        },
        
        clearChat() {
            if (confirm('确定要清空所有对话记录吗？')) {
                this.chatHistory = [];
                this.selectedMessages.clear();
                this.multiSelectMode = false;
                this.hideContextMenu();
                this.scrollToBottom();
                console.log('对话已清空');
            }
        },
        
        async loadAvailableModels() {
            try {
                const response = await fetch('/get_available_models');
                if (!response.ok) throw new Error('无法加载模型列表');
                this.availableModels = await response.json();
                if (this.availableModels.length > 0) {
                    // Load current model from backend or set first available
                    const currentModelResponse = await fetch('/get_current_model');
                    if (currentModelResponse.ok) {
                        const currentModelData = await currentModelResponse.json();
                        this.currentModel = this.availableModels.find(m => m.model_id === currentModelData.model_id);
                    }
                    if (!this.currentModel) {
                        this.currentModel = this.availableModels[0];
                        this.selectModel(this.currentModel.model_id); // Set as current in backend
                    }
                }
            } catch (error) {
                console.error('加载可用模型失败:', error);
                this.availableModels = [{ model_id: 'error', model_name: '加载失败', provider: 'N/A' }];
            }
        },
        
        toggleModelDropdown(event) {
            this.modelDropdownOpen = !this.modelDropdownOpen;
            if (this.modelDropdownOpen) {
                this.$refs.chatInput.blur(); // Hide keyboard on mobile
            }
        },
        
        async selectModel(modelId) {
            try {
                const response = await fetch('/switch_model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model_id: modelId })
                });
                if (!response.ok) throw new Error('切换模型失败');
                const result = await response.json();
                this.currentModel = this.availableModels.find(m => m.model_id === modelId);
                console.log('模型已切换:', result.message);
                this.showToast(`模型已切换为 ${this.currentModel.model_name}`);
            } catch (error) {
                console.error('切换模型失败:', error);
                this.showToast('切换模型失败');
            } finally {
                this.modelDropdownOpen = false;
            }
        },
        
        closeModelDropdown() {
            this.modelDropdownOpen = false;
        },
        
        switchChatMode(mode) {
            this.chatMode = mode;
            if (mode === 'document') {
                this.isInputEnabled = true;
            } else {
                this.isInputEnabled = false; // Backend only supports document mode for now
            }
        },
        
        setDocumentLoaded(loaded) {
            this.isDocumentLoaded = loaded;
            if (loaded) {
                this.switchChatMode('document');
            } else {
                this.switchChatMode('general');
            }
        },
        
        setInputEnabled(enabled) {
            this.isInputEnabled = enabled;
        },
        
        handleEnter(event) {
            if (event.shiftKey) {
                // Shift + Enter for new line - let default behavior happen
                return;
            } else {
                // Enter to send
                this.sendMessage();
            }
        },
        
        showMessageContextMenu(event, messageIndex) {
            this.hideContextMenu();
            this.contextMenu = {
                x: event.clientX,
                y: event.clientY,
                messageIndex: messageIndex
            };

            this.$nextTick(() => {
                const menuElement = document.querySelector('.message-context-menu');
                if (menuElement) {
                    const rect = menuElement.getBoundingClientRect();
                    if (rect.right > window.innerWidth) {
                        this.contextMenu.x = event.clientX - rect.width;
                    }
                    if (rect.bottom > window.innerHeight) {
                        this.contextMenu.y = event.clientY - rect.height;
                    }
                }
            });
        },
        
        hideContextMenu() {
            this.contextMenu = null;
        },
        
        deleteMessage(messageIndex) {
            if (confirm('确定要删除这条消息吗？')) {
                this.chatHistory.splice(messageIndex, 1);
                this.showToast('消息已删除');
            }
            this.hideContextMenu();
        },
        
        copyMessage(messageIndex) {
            const message = this.chatHistory[messageIndex];
            if (message && navigator.clipboard) {
                navigator.clipboard.writeText(message.content).then(() => {
                    this.showToast('消息已复制');
                }).catch(err => {
                    console.error('复制失败:', err);
                    this.fallbackCopyText(message.content);
                });
            } else if (message) {
                this.fallbackCopyText(message.content);
            }
            this.hideContextMenu();
        },
        
        fallbackCopyText(text) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showToast('消息已复制（备用方法）');
            } catch (err) {
                console.error('备用复制方法也失败:', err);
                this.showToast('复制失败');
            }
            document.body.removeChild(textArea);
        },
        
        enterMultiSelectMode() {
            this.multiSelectMode = true;
            this.selectedMessages.clear();
            this.hideContextMenu();
        },
        
        exitMultiSelectMode() {
            this.multiSelectMode = false;
            this.selectedMessages.clear();
        },
        
        toggleMessageSelection(messageIndex) {
            if (this.selectedMessages.has(messageIndex)) {
                this.selectedMessages.delete(messageIndex);
            } else {
                this.selectedMessages.add(messageIndex);
            }
        },
        
        deleteSelectedMessages() {
            if (this.selectedMessages.size === 0) {
                this.showToast('请先选择要删除的消息');
                return;
            }
            if (confirm(`确定要删除 ${this.selectedMessages.size} 条消息吗？`)) {
                // Sort in reverse to delete without affecting indices of remaining messages
                const sortedIndexes = Array.from(this.selectedMessages).sort((a, b) => b - a);
                sortedIndexes.forEach(index => {
                    this.chatHistory.splice(index, 1);
                });
                this.exitMultiSelectMode();
                this.showToast('选中的消息已删除');
            }
        },
        
        showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'toast-message';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.remove();
            }, 3000);
        },
        
        // 加载历史聊天记录
        loadHistory(history) {
            if (!history || !Array.isArray(history)) {
                console.warn('无效的历史记录格式');
                return;
            }
            
            // 清空当前历史并加载新的历史记录
            this.chatHistory = [...history];
            
            // 滚动到底部
            this.$nextTick(() => {
                this.scrollToBottom();
            });
            
            console.log('✅ 已加载', history.length, '条历史消息');
        },
        
        // 启用输入
        enableInput() {
            this.isInputEnabled = true;
            this.pdfLoaded = true;
        },
        
        // 禁用输入
        disableInput() {
            this.isInputEnabled = false;
        }
    },
    
    mounted() {
        this.initializeElements();
        this.bindEvents();
        // this.loadAvailableModels(); // 暂时注释，稍后实现
        this.setupTextareaAutoResize();
        this.setDocumentLoaded(false); // Initial state: no document loaded
        
        // 暴露组件实例到全局以便其他模块调用
        window.vueChat = this;
        
        console.log('Vue聊天组件初始化完成');
    },
    
    beforeUnmount() {
        document.removeEventListener('click', this.closeModelDropdown);
        document.removeEventListener('click', this.hideContextMenu);
        document.removeEventListener('contextmenu', this.handleGlobalContextMenu);
    }
};

window.ChatComponent = ChatComponent;
console.log('Vue聊天组件已加载');