// Vue Panel组件 - 右侧操作台，支持mindmap视图切换
const PanelComponent = {
    template: `
        <div class="panel-content-wrapper">
            <!-- 控制面板视图 -->
            <div v-if="currentView === 'controls'">
                <!-- 功能按钮网格 -->
                <div class="function-grid">
                    <h6 class="mb-3">功能工具</h6>
                    <div class="row g-2">
                        <!-- 第一行 -->
                        <div class="col-6">
                            <button 
                                class="btn btn-outline-dark w-100 function-btn" 
                                :disabled="!mindmapEnabled"
                                @click="handleMindmap"
                                @click.native="console.log('原生点击事件触发')"
                            >
                                <i class="fas fa-project-diagram d-block mb-1"></i>
                                <small>mindmap ({{ mindmapEnabled ? '已启用' : '未启用' }})</small>
                            </button>
                        </div>
                        <div class="col-6">
                            <button 
                                class="btn btn-outline-dark w-100 function-btn" 
                                :disabled="!notesEnabled"
                                @click="handleNotes"
                            >
                                <i class="fas fa-sticky-note d-block mb-1"></i>
                                <small>notes</small>
                            </button>
                        </div>
                        <!-- 第二行 -->
                        <div class="col-6">
                            <button 
                                class="btn btn-outline-secondary w-100 function-btn" 
                                disabled
                                @click="handleOngoing1"
                            >
                                <i class="fas fa-cog d-block mb-1"></i>
                                <small>on going</small>
                            </button>
                        </div>
                        <div class="col-6">
                            <button 
                                class="btn btn-outline-secondary w-100 function-btn" 
                                disabled
                                @click="handleOngoing2"
                            >
                                <i class="fas fa-tools d-block mb-1"></i>
                                <small>on going</small>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Mindmap视图 -->
            <div v-else-if="currentView === 'mindmap'">
                <div class="mindmap-header d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">
                        <i class="fas fa-project-diagram me-2"></i>思维导图
                    </h6>
                    <button class="btn btn-sm btn-outline-secondary" @click="backToControls">
                        <i class="fas fa-arrow-left me-1"></i>返回
                    </button>
                </div>
                
                <!-- 生成状态 -->
                <div v-if="mindmapGenerating" class="text-center py-4">
                    <i class="fas fa-spinner fa-spin fa-2x text-primary mb-3"></i>
                    <p class="text-muted">正在生成思维导图...</p>
                </div>
                
                <!-- Mindmap容器 -->
                <div v-else-if="mindmapData" id="mindmap-container" class="mindmap-container">
                    <!-- markmap将在这里渲染 -->
                </div>
                
                <!-- 错误状态 -->
                <div v-else-if="mindmapError" class="text-center py-4">
                    <i class="fas fa-exclamation-triangle fa-2x text-warning mb-3"></i>
                    <p class="text-muted">{{ mindmapError }}</p>
                    <button class="btn btn-sm btn-primary" @click="retryMindmap">
                        <i class="fas fa-redo me-1"></i>重试
                    </button>
                </div>
            </div>
        </div>
    `,
    
    data() {
        return {
            // 视图控制
            currentView: 'controls', // 'controls' | 'mindmap'
            
            // 功能按钮状态
            mindmapEnabled: false,
            notesEnabled: false,
            
            // PDF加载状态
            isPdfLoaded: false,
            
            // Mindmap相关状态
            mindmapData: null,
            mindmapGenerating: false,
            mindmapError: null
        };
    },
    
    methods: {
        // 设置PDF加载状态
        setPdfLoaded(loaded) {
            this.isPdfLoaded = loaded;
            
            if (loaded) {
                // 重置mindmap状态
                this.mindmapData = null;
                this.mindmapError = null;
                this.currentView = 'controls';
            } else {
                this.mindmapEnabled = false;
                this.notesEnabled = false;
                this.mindmapData = null;
                this.mindmapError = null;
                this.currentView = 'controls';
            }
            
            console.log('Panel组件PDF状态更新:', loaded);
        },
        
        // 设置Markdown转换完成状态
        setMarkdownReady(ready) {
            if (ready && this.isPdfLoaded) {
                this.mindmapEnabled = true;
                this.notesEnabled = true;
            }
            
            console.log('Panel组件Markdown状态更新:', ready, '按钮状态:', {
                mindmapEnabled: this.mindmapEnabled,
                notesEnabled: this.notesEnabled
            });
        },
        
        // 处理mindmap点击
        async handleMindmap() {
            console.log('🔴 Mindmap按钮点击事件触发');
            console.log('📋 当前状态:', {
                mindmapEnabled: this.mindmapEnabled,
                isPdfLoaded: this.isPdfLoaded,
                currentView: this.currentView,
                mindmapData: !!this.mindmapData
            });
            console.log('🔍 Session ID 信息:', {
                windowCurrentSessionId: window.currentSessionId,
                vueChatSessionId: window.vueChat?.sessionId
            });
            
            if (!this.mindmapEnabled) {
                console.warn('⚠️ Mindmap按钮未启用，取消操作');
                return;
            }
            
            // 如果已经有数据，直接切换视图
            if (this.mindmapData) {
                this.currentView = 'mindmap';
                this.$nextTick(() => {
                    this.renderMindmap();
                });
                return;
            }
            
            // 生成新的mindmap
            this.mindmapGenerating = true;
            this.mindmapError = null;
            this.currentView = 'mindmap';
            
            try {
                // 获取当前 session_id（从全局变量或聊天组件）
                const sessionId = window.currentSessionId || 
                                 (window.vueChat && window.vueChat.sessionId);
                
                if (!sessionId) {
                    throw new Error('请先上传论文');
                }
                
                console.log('📡 发送思维导图生成请求，session_id:', sessionId);
                
                const response = await fetch('/api/generate-mindmap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '网络请求失败');
                }
                
                const data = await response.json();
                
                console.log('📥 思维导图 API 返回数据:', data);
                console.log('📝 Markdown 内容:', data.markdown);
                console.log('📊 Markdown 长度:', data.markdown?.length);
                
                if (data.success) {
                    this.mindmapData = data.markdown;
                    console.log('✅ 思维导图生成成功:', data.from_cache ? '来自缓存' : '新生成');
                    console.log('💾 已保存到 mindmapData:', this.mindmapData?.substring(0, 100));
                    
                    this.$nextTick(() => {
                        this.renderMindmap();
                    });
                } else {
                    throw new Error(data.error || '生成失败');
                }
                
            } catch (error) {
                console.error('生成思维导图失败:', error);
                this.mindmapError = '生成失败: ' + error.message;
            } finally {
                this.mindmapGenerating = false;
            }
        },
        
        // 渲染mindmap
        async renderMindmap() {
            // 等待 DOM 元素真正出现（最多等待 3 秒）
            let retries = 30; // 30 * 100ms = 3秒
            let container = null;
            
            while (retries > 0 && !container) {
                container = document.getElementById('mindmap-container');
                if (!container) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    retries--;
                }
            }
            
            if (!container) {
                console.error('❌ Mindmap 容器未找到');
                return;
            }
            
            if (!this.mindmapData) {
                console.error('❌ Mindmap 数据为空');
                return;
            }
            
            try {
                console.log('开始渲染思维导图，数据长度:', this.mindmapData.length);
                
                // 等待库加载
                await this.waitForLibraries();
                
                // 清空容器并创建SVG
                container.innerHTML = '';
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.style.width = '100%';
                svg.style.height = '500px';
                svg.style.background = '#fff';
                svg.style.border = '1px solid #e0e0e0';
                svg.style.borderRadius = '8px';
                container.appendChild(svg);
                
                // 使用markmap渲染
                console.log('🔍 检查 window.markmap:', window.markmap);
                console.log('🔍 可用的方法:', Object.keys(window.markmap));
                
                if (window.markmap && window.markmap.Markmap && window.markmap.Transformer) {
                    const { Markmap, Transformer } = window.markmap;
                    
                    // 创建 Transformer 实例
                    const transformer = new Transformer();
                    
                    console.log('🔧 Transformer 创建成功');
                    
                    // 转换 markdown 为树结构
                    const { root } = transformer.transform(this.mindmapData);
                    
                    console.log('🌳 Markdown 转换成功，root:', root);
                    
                    // 创建 Markmap 实例并渲染
                    const mm = Markmap.create(svg);
                    mm.setData(root);
                    mm.fit();
                    
                    console.log('✅ 思维导图渲染完成');
                } else {
                    throw new Error('Markmap库未正确加载');
                }
                
            } catch (error) {
                console.error('思维导图渲染失败:', error);
                this.fallbackTextRender(container);
            }
        },
        
        // 等待必要的库加载
        async waitForLibraries() {
            let attempts = 0;
            const maxAttempts = 20; // 最多等待4秒
            
            while (attempts < maxAttempts) {
                const status = {
                    markmap: !!window.markmap,
                    d3: !!window.d3,
                    markmapMarkmap: !!(window.markmap && window.markmap.Markmap),
                    markmapTransformer: !!(window.markmap && window.markmap.Transformer)
                };
                
                console.log(`🔄 [${attempts+1}/${maxAttempts}] 检查库加载状态:`, status);
                
                // 新版本 Markmap 把所有东西都放在 window.markmap 中
                if (window.markmap && window.markmap.Markmap && 
                    window.markmap.Transformer && window.d3) {
                    console.log('✅ Markmap 库已全部加载');
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
                attempts++;
            }
            
            const finalStatus = {
                markmap: !!window.markmap,
                d3: !!window.d3,
                markmapKeys: window.markmap ? Object.keys(window.markmap) : []
            };
            console.warn('⚠️ Markmap 库加载超时，当前状态:', finalStatus);
            throw new Error('Markmap库加载超时');
        },
        
        // 降级到文本显示
        fallbackTextRender(container) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <h6><i class="fas fa-info-circle me-2"></i>思维导图 - 文本模式</h6>
                    <p class="mb-2">以下是生成的思维导图结构：</p>
                    <div class="mindmap-preview" style="padding: 1rem; background: #f8f9fa; border-radius: 0.5rem; font-family: monospace; white-space: pre-wrap; max-height: 400px; overflow-y: auto; font-size: 13px; line-height: 1.5;">
${this.mindmapData}
                    </div>
                    <div class="mt-2">
                        <small class="text-muted">
                            <i class="fas fa-lightbulb me-1"></i>
                            提示：这是基于您的文档生成的结构化大纲，可以帮助您快速理解文章脉络。
                        </small>
                    </div>
                </div>
            `;
        },
        
        // 返回控制面板
        backToControls() {
            this.currentView = 'controls';
        },
        
        // 重试生成mindmap
        retryMindmap() {
            this.mindmapData = null;
            this.mindmapError = null;
            this.handleMindmap();
        },
        
        // 处理notes点击
        handleNotes() {
            if (!this.notesEnabled) return;
            
            console.log('Notes功能点击');
            this.showToast('笔记功能开发中...');
            
            // TODO: 实现notes功能
        },
        
        // 处理ongoing1点击
        handleOngoing1() {
            console.log('Ongoing1功能点击');
            this.showToast('功能开发中...');
        },
        
        // 处理ongoing2点击
        handleOngoing2() {
            console.log('Ongoing2功能点击');
            this.showToast('功能开发中...');
        },
        
        // 显示提示消息
        showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'toast-message';
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 9999;
                font-size: 14px;
            `;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.remove();
            }, 3000);
        },
        
        // 重置所有状态
        resetAll() {
            this.setPdfLoaded(false);
            console.log('Panel组件状态已重置');
        }
    },
    
    mounted() {
        // 暴露组件实例到全局
        window.vuePanel = this;
        console.log('Vue Panel组件初始化完成');
        console.log('✅ Panel methods 可用:', {
            handleMindmap: typeof this.handleMindmap,
            handleNotes: typeof this.handleNotes,
            generateSummary: typeof this.generateSummary
        });
        console.log('📊 Panel initial state:', {
            mindmapEnabled: this.mindmapEnabled,
            notesEnabled: this.notesEnabled,
            isPdfLoaded: this.isPdfLoaded
        });
    }
};

// 导出组件到全局
window.PanelComponent = PanelComponent;
console.log('Vue Panel组件已加载');