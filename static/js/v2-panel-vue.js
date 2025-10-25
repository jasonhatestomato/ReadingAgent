// Vue Panel组件 - 右侧操作台，支持mindmap视图切换
const PanelComponent = {
    template: `
        <div class="panel-content-wrapper">
            <!-- 控制面板视图 -->
            <div v-if="currentView === 'controls'">
                <!-- 智能分析区域 -->
                <div class="analysis-controls" v-show="showAnalysisControls">
                    <h6 class="mb-3">智能分析</h6>
                    
                    <!-- 导读报告 -->
                    <div class="mb-3">
                        <button 
                            class="btn btn-primary btn-sm w-100 mb-2" 
                            :disabled="!generateSummaryEnabled"
                            @click="generateSummary"
                        >
                            <i class="fas fa-book-reader me-2"></i>生成导读报告
                        </button>
                        <small class="text-muted d-block">生成文献概要和引导问题 (消耗token)</small>
                    </div>
                    
                    <div class="analysis-status">
                        <small class="text-muted">{{ analysisStatusText }}</small>
                    </div>
                </div>
                
                <!-- 功能按钮网格 -->
                <div class="function-grid mt-4">
                    <h6 class="mb-3">功能工具</h6>
                    <div class="row g-2">
                        <!-- 第一行 -->
                        <div class="col-6">
                            <button 
                                class="btn btn-outline-dark w-100 function-btn" 
                                :disabled="!mindmapEnabled"
                                @click="handleMindmap"
                            >
                                <i class="fas fa-project-diagram d-block mb-1"></i>
                                <small>mindmap</small>
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
            
            // 分析控制状态
            showAnalysisControls: false,
            generateSummaryEnabled: false,
            analysisStatusText: '上传PDF后可进行智能分析',
            
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
                this.showAnalysisControls = true;
                this.analysisStatusText = 'PDF已上传，文本转换中...';
                // 重置mindmap状态
                this.mindmapData = null;
                this.mindmapError = null;
                this.currentView = 'controls';
            } else {
                this.showAnalysisControls = false;
                this.generateSummaryEnabled = false;
                this.mindmapEnabled = false;
                this.notesEnabled = false;
                this.analysisStatusText = '上传PDF后可进行智能分析';
                this.mindmapData = null;
                this.mindmapError = null;
                this.currentView = 'controls';
            }
            
            console.log('Panel组件PDF状态更新:', loaded);
        },
        
        // 设置Markdown转换完成状态
        setMarkdownReady(ready) {
            if (ready && this.isPdfLoaded) {
                this.generateSummaryEnabled = true;
                this.mindmapEnabled = true;
                this.notesEnabled = true;
                this.analysisStatusText = '文本转换完成，可进行智能分析';
            }
            
            console.log('Panel组件Markdown状态更新:', ready, '按钮状态:', {
                generateSummaryEnabled: this.generateSummaryEnabled,
                mindmapEnabled: this.mindmapEnabled,
                notesEnabled: this.notesEnabled
            });
        },
        
        // 生成导读报告
        generateSummary() {
            if (!this.generateSummaryEnabled) return;
            
            this.analysisStatusText = '正在生成导读报告...';
            this.generateSummaryEnabled = false;
            
            // 调用全局函数
            if (window.triggerSummaryGeneration) {
                window.triggerSummaryGeneration();
            } else {
                console.error('triggerSummaryGeneration函数未找到');
                this.analysisStatusText = '生成失败，请重试';
                this.generateSummaryEnabled = true;
            }
        },
        
        // 处理mindmap点击
        async handleMindmap() {
            console.log('Mindmap按钮点击，当前状态:', {
                mindmapEnabled: this.mindmapEnabled,
                isPdfLoaded: this.isPdfLoaded,
                currentView: this.currentView
            });
            
            if (!this.mindmapEnabled) {
                console.warn('Mindmap按钮未启用，取消操作');
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
                const response = await fetch('/generate_mindmap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) {
                    throw new Error('网络请求失败');
                }
                
                const data = await response.json();
                
                if (data.success) {
                    this.mindmapData = data.markdown;
                    console.log('思维导图生成成功:', data.from_cache ? '来自缓存' : '新生成');
                    
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
            const container = document.getElementById('mindmap-container');
            if (!container || !this.mindmapData) return;
            
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
                if (window.markmap && window.markmap.Markmap) {
                    const { Markmap, deriveOptions, transform } = window.markmap;
                    const { root, features } = transform(this.mindmapData);
                    const options = deriveOptions(features);
                    
                    const mm = Markmap.create(svg, options);
                    mm.setData(root);
                    mm.fit();
                    
                    console.log('思维导图渲染完成');
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
                if (window.markmap && window.markmap.Markmap && window.d3) {
                    console.log('Markmap库已加载');
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
                attempts++;
            }
            
            throw new Error('等待库加载超时');
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
    }
};

// 导出组件到全局
window.PanelComponent = PanelComponent;
console.log('Vue Panel组件已加载');