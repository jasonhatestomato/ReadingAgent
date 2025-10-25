/**
 * Reading Agent v2.0 - 布局控制模块
 * 处理三栏布局的拖拽调节和收起/展开功能
 */

// 全局布局应用
const layoutApp = Vue.createApp({
    data() {
        return {
            // 面板状态
            leftPanelCollapsed: false,
            rightPanelCollapsed: false,
            pdfLoaded: false,
            
            // 拖拽状态
            isResizing: false,
            resizeType: null, // 'left' 或 'right'
            startX: 0,
            initialLeftWidth: 0,
            initialRightWidth: 0,
            
            // 面板宽度 (百分比)
            leftPanelWidth: 25,
            rightPanelWidth: 25,
            
            // 最小宽度设置
            minPanelWidth: 15, // 最小百分比
            maxPanelWidth: 50, // 最大百分比
            collapsedWidth: 48, // 收起状态宽度(px)
            
            // Vue组件实例
            chatAppInstance: null,
            panelAppInstance: null
        };
    },
    
    computed: {
        // 计算中间聊天面板的宽度
        chatPanelWidth() {
            const leftWidth = this.leftPanelCollapsed ? this.collapsedWidth : this.leftPanelWidth;
            const rightWidth = this.rightPanelCollapsed ? this.collapsedWidth : this.rightPanelWidth;
            
            if (this.leftPanelCollapsed && this.rightPanelCollapsed) {
                return `calc(100% - ${this.collapsedWidth * 2}px)`;
            } else if (this.leftPanelCollapsed) {
                return `calc(${100 - rightWidth}% - ${this.collapsedWidth}px)`;
            } else if (this.rightPanelCollapsed) {
                return `calc(${100 - leftWidth}% - ${this.collapsedWidth}px)`;
            } else {
                return `${100 - leftWidth - rightWidth}%`;
            }
        }
    },
    
    // 创建前加载配置
    beforeMount() {
        this.loadLayoutConfig();
    },
    
    mounted() {
        // 初始化布局
        this.initializeLayout();
        
        // 绑定事件
        this.bindEvents();
        
        // 初始化聊天组件
        this.initializeChatComponent();
        
        // 初始化Panel组件
        this.initializePanelComponent();
        
        console.log('Vue布局应用初始化完成');
    },
    
    beforeUnmount() {
        // 清理事件监听器
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.stopResize);
        console.log('Vue布局应用事件监听器已清理');
    },
    
    methods: {
        // 初始化布局
        initializeLayout() {
            this.updatePanelSizes();
            console.log('布局初始化完成');
        },
        
        // 绑定事件
        bindEvents() {
            // 绑定鼠标移动和释放事件到document
            document.addEventListener('mousemove', this.handleMouseMove);
            document.addEventListener('mouseup', this.stopResize);
            
            // 绑定拖拽边界事件
            const leftHandle = document.querySelector('.resize-handle-left');
            const rightHandle = document.querySelector('.resize-handle-right');
            
            if (leftHandle) {
                leftHandle.addEventListener('mousedown', (e) => this.startResize('left', e));
            }
            
            if (rightHandle) {
                rightHandle.addEventListener('mousedown', (e) => this.startResize('right', e));
            }
            
            console.log('事件绑定完成');
        },
        
        // 初始化聊天组件
        initializeChatComponent() {
            if (window.ChatComponent) {
                // 创建聊天应用实例
                const chatApp = Vue.createApp(window.ChatComponent);
                this.chatAppInstance = chatApp.mount('#vue-chat-app');
                
                // 暴露聊天组件实例到全局
                window.vueChat = this.chatAppInstance;
                
                console.log('Vue聊天组件已挂载');
            } else {
                console.warn('ChatComponent未找到，延迟初始化');
                setTimeout(() => this.initializeChatComponent(), 100);
            }
        },
        
        // 初始化Panel组件
        initializePanelComponent() {
            if (window.PanelComponent) {
                // 创建Panel应用实例
                const panelApp = Vue.createApp(window.PanelComponent);
                this.panelAppInstance = panelApp.mount('#vue-panel-app');
                
                // 暴露Panel组件实例到全局
                window.vuePanel = this.panelAppInstance;
                
                console.log('Vue Panel组件已挂载');
            } else {
                console.warn('PanelComponent未找到，延迟初始化');
                setTimeout(() => this.initializePanelComponent(), 100);
            }
        },
        
        // 切换左侧面板
        toggleLeftPanel() {
            this.leftPanelCollapsed = !this.leftPanelCollapsed;
            this.$nextTick(() => {
                this.updatePanelSizes();
                this.saveLayoutConfig();
            });
        },
        
        // 切换右侧面板
        toggleRightPanel() {
            this.rightPanelCollapsed = !this.rightPanelCollapsed;
            this.$nextTick(() => {
                this.updatePanelSizes();
                this.saveLayoutConfig();
            });
        },
        
        // 开始调节大小
        startResize(type, event) {
            this.isResizing = true;
            this.resizeType = type;
            this.startX = event.clientX;
            
            // 记录初始宽度
            if (type === 'left') {
                this.initialLeftWidth = this.leftPanelWidth;
            } else {
                this.initialRightWidth = this.rightPanelWidth;
            }
            
            // 禁用文本选择
            document.body.style.userSelect = 'none';
            
            console.log('开始拖拽调节:', type);
        },
        
        // 处理鼠标移动
        handleMouseMove(event) {
            if (!this.isResizing) return;
            
            const deltaX = event.clientX - this.startX;
            const containerWidth = document.querySelector('.main-layout-container').offsetWidth;
            const deltaPercent = (deltaX / containerWidth) * 100;
            
            if (this.resizeType === 'left') {
                this.leftPanelWidth = Math.max(15, Math.min(50, this.initialLeftWidth + deltaPercent));
            } else {
                this.rightPanelWidth = Math.max(15, Math.min(50, this.initialRightWidth - deltaPercent));
            }
            
            this.updatePanelSizes();
        },
        
        // 停止调节大小
        stopResize() {
            if (!this.isResizing) return;
            
            this.isResizing = false;
            this.resizeType = null;
            
            // 恢复文本选择
            document.body.style.userSelect = '';
            
            // 保存布局配置
            this.saveLayoutConfig();
            
            console.log('拖拽调节结束');
        },
        
        // 更新面板尺寸
        updatePanelSizes() {
            const pdfPanel = document.getElementById('pdf-panel');
            const chatPanel = document.getElementById('chat-panel');
            const contentPanel = document.getElementById('content-panel');
            
            if (pdfPanel) {
                if (this.leftPanelCollapsed) {
                    pdfPanel.style.width = this.collapsedWidth + 'px';
                } else {
                    pdfPanel.style.width = this.leftPanelWidth + '%';
                }
            }
            
            if (contentPanel) {
                if (this.rightPanelCollapsed) {
                    contentPanel.style.width = this.collapsedWidth + 'px';
                } else {
                    contentPanel.style.width = this.rightPanelWidth + '%';
                }
            }
            
            if (chatPanel) {
                chatPanel.style.width = this.chatPanelWidth;
            }
        },
        
        // 设置PDF加载状态
        setPdfLoaded(loaded) {
            this.pdfLoaded = loaded;
            console.log('PDF加载状态更新:', loaded);
        },
        
        // 保存布局配置
        saveLayoutConfig() {
            const config = {
                leftPanelWidth: this.leftPanelWidth,
                rightPanelWidth: this.rightPanelWidth,
                leftPanelCollapsed: this.leftPanelCollapsed,
                rightPanelCollapsed: this.rightPanelCollapsed
            };
            localStorage.setItem('layoutConfig', JSON.stringify(config));
        },
        
        // 加载布局配置
        loadLayoutConfig() {
            try {
                const saved = localStorage.getItem('layoutConfig');
                if (saved) {
                    const config = JSON.parse(saved);
                    this.leftPanelWidth = config.leftPanelWidth || 25;
                    this.rightPanelWidth = config.rightPanelWidth || 25;
                    this.leftPanelCollapsed = config.leftPanelCollapsed || false;
                    this.rightPanelCollapsed = config.rightPanelCollapsed || false;
                }
            } catch (error) {
                console.warn('加载布局配置失败:', error);
            }
        },
        
        // 显示上传Modal
        showUploadModal() {
            const modalElement = document.getElementById('uploadModal');
            if (modalElement) {
                const modal = new bootstrap.Modal(modalElement);
                modal.show();
                // 初始化上传区域事件（只初始化一次）
                if (!modalElement.dataset.initialized) {
                    this.initializeUploadArea();
                    modalElement.dataset.initialized = 'true';
                }
            }
        },
        
        // 显示本地论文Modal
        showLocalPapersModal() {
            const modalElement = document.getElementById('localPapersModal');
            if (modalElement) {
                const modal = new bootstrap.Modal(modalElement);
                modal.show();
                // 加载本地论文列表
                this.loadLocalPapersInModal();
            }
        },
        
        // 关闭Modal（如果需要手动关闭）
        closeModal(modalId) {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            }
        },
        
        // 初始化上传区域
        initializeUploadArea() {
            const uploadArea = document.getElementById('modal-upload-area');
            const fileInput = document.getElementById('file-input');
            
            if (!uploadArea || !fileInput) return;
            
            // 点击上传区域
            uploadArea.onclick = () => fileInput.click();
            
            // 拖拽事件
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                
                const files = e.dataTransfer.files;
                if (files.length > 0 && files[0].type === 'application/pdf') {
                    // 直接传递文件对象
                    if (window.handleFileUpload) {
                        window.handleFileUpload(files[0]);
                    }
                    this.closeModal('uploadModal');
                }
            });
            
            // 文件选择事件
            fileInput.onchange = () => {
                if (fileInput.files.length > 0) {
                    // 直接传递文件对象
                    if (window.handleFileUpload) {
                        window.handleFileUpload(fileInput.files[0]);
                    }
                    this.closeModal('uploadModal');
                }
            };
        },
        
        // 加载本地论文列表到Modal
        loadLocalPapersInModal() {
            const container = document.getElementById('modal-local-papers-container');
            if (!container) return;
            
            fetch('/api/local-papers')
                .then(response => response.json())
                .then(data => {
                    if (data.papers && data.papers.length > 0) {
                        container.innerHTML = data.papers.map(paper => `
                            <div class="local-paper-item" onclick="window.layoutApp.selectLocalPaper('${paper.filename}')">
                                <i class="fas fa-file-pdf paper-icon"></i>
                                <div class="paper-info">
                                    <div class="paper-name">${paper.title || paper.filename}</div>
                                </div>
                            </div>
                        `).join('');
                    } else {
                        container.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 40px 20px;">暂无本地论文</p>';
                    }
                })
                .catch(error => {
                    console.error('加载本地论文失败:', error);
                    container.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 40px 20px;">加载失败，请重试</p>';
                });
        },
        
        // 选择本地论文
        selectLocalPaper(filename) {
            if (window.handleLocalPaperSelect) {
                window.handleLocalPaperSelect(filename);
            }
            this.closeModal('localPapersModal');
        }
    }
});

// 确保DOM加载完成后再挂载
document.addEventListener('DOMContentLoaded', function() {
    // 挂载布局应用到主容器
    const mountedApp = layoutApp.mount('#main-layout');
    
    // 导出全局访问接口
    window.layoutApp = mountedApp;
    
    console.log('Vue布局应用已挂载到window.layoutApp');
});