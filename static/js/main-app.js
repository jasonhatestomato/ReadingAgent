/**
 * Reading Agent v2.0 - 主应用逻辑
 * 整合PDF处理、文件上传、聊天等功能
 */

// 全局变量
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let canvas = null;
let ctx = null;

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    console.log('Reading Agent v2.0 初始化开始');
    
    // 检查URL参数，看是否需要加载历史会话
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    // 等待Vue应用加载完成
    function waitForVueApp() {
        if (window.layoutApp) {
            console.log('Vue布局应用已准备就绪');
            
            // 初始化PDF.js
            initializePdfJs();
            
            // 初始化文件上传
            initializeFileUpload();
            
            // 初始化上传/本地选择标签页
            initializeUploadTabs();
            
            // 初始化PDF控件
            initializePdfControls();
            
            // 初始化内容标签
            initializeContentTabs();
            
            // 初始化分析控件
            initializeAnalysisControls();
            
            // 如果有 session_id，加载历史会话
            if (sessionId) {
                loadHistorySession(sessionId);
            }
            
            console.log('Reading Agent v2.0 初始化完成');
        } else {
            console.log('等待Vue应用加载...');
            setTimeout(waitForVueApp, 100);
        }
    }
    
    waitForVueApp();
});

// 初始化PDF.js
function initializePdfJs() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    canvas = document.getElementById('pdf-canvas');
    ctx = canvas.getContext('2d');
    
    console.log('PDF.js 初始化完成');
}

// 初始化文件上传
function initializeFileUpload() {
    // 这些元素在modal中，不需要在页面加载时初始化
    // Modal相关的上传逻辑已经在 main-layout.js 中处理
    console.log('文件上传功能已通过Modal初始化');
}

// 初始化上传/本地选择标签页
function initializeUploadTabs() {
    const uploadTab = document.getElementById('upload-tab');
    const localTab = document.getElementById('local-tab');
    const uploadPanel = document.getElementById('upload-panel');
    const localPanel = document.getElementById('local-panel');
    
    if (!uploadTab || !localTab || !uploadPanel || !localPanel) {
        console.warn('标签页元素未找到，跳过初始化');
        return;
    }
    
    // 默认显示上传面板
    uploadPanel.classList.add('active');
    uploadTab.classList.add('active');
    
    // 上传标签点击
    uploadTab.addEventListener('click', () => {
        uploadTab.classList.add('active');
        localTab.classList.remove('active');
        uploadPanel.classList.add('active');
        localPanel.classList.remove('active');
    });
    
    // 本地论文标签点击
    localTab.addEventListener('click', () => {
        localTab.classList.add('active');
        uploadTab.classList.remove('active');
        localPanel.classList.add('active');
        uploadPanel.classList.remove('active');
        
        // 加载本地论文列表
        loadLocalPapers();
    });
    
    console.log('上传标签页功能初始化完成');
}

// 加载本地论文列表
async function loadLocalPapers() {
    const container = document.getElementById('local-papers-container');
    if (!container) {
        console.error('本地论文容器未找到');
        return;
    }
    
    // 显示加载中
    container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    
    try {
        const response = await fetch('/api/local-papers');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '加载失败');
        }
        
        if (!data.papers || data.papers.length === 0) {
            container.innerHTML = '<div class="text-center text-muted">暂无本地论文</div>';
            return;
        }
        
        // 显示论文列表
        displayLocalPapers(data.papers);
        
    } catch (error) {
        console.error('加载本地论文失败:', error);
        container.innerHTML = `<div class="text-center text-danger">加载失败: ${error.message}</div>`;
    }
}

// 显示本地论文列表
function displayLocalPapers(papers) {
    const container = document.getElementById('local-papers-container');
    
    container.innerHTML = '';
    
    papers.forEach(paper => {
        const paperCard = document.createElement('div');
        paperCard.className = 'local-paper-item';
        
        // 根据类型选择图标颜色
        const iconClass = paper.type === 'pdf' ? 'fa-file-pdf' : 'fa-file-alt';
        const iconColor = paper.type === 'pdf' ? '#dc3545' : '#6c757d';
        
        paperCard.innerHTML = `
            <div class="paper-icon" style="color: ${iconColor}">
                <i class="fas ${iconClass}"></i>
            </div>
            <div class="paper-info">
                <div class="paper-name">${escapeHtml(paper.title || paper.filename)}</div>
                <div class="paper-meta">${formatFileSize(paper.size)}</div>
            </div>
        `;
        
        // 点击选择论文
        paperCard.addEventListener('click', () => {
            handleLocalPaperSelect(paper.filename);
        });
        
        container.appendChild(paperCard);
    });
}

// 处理本地论文选择
async function handleLocalPaperSelect(filename) {
    console.log('选择本地论文:', filename);
    
    showLoading(true, '正在加载论文...');
    
    try {
        // 获取 user_id
        const userId = localStorage.getItem('user_id') || 'default_user';
        
        const response = await fetch('/api/use-local-paper', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                filename: filename,
                user_id: userId
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '加载失败');
        }
        
        console.log('本地论文加载成功:', data);
        
        // 保存session_id
        if (data.session_id) {
            window.currentSessionId = data.session_id;
            console.log('Session ID:', data.session_id);
        }
        
        // 加载PDF（如果有）
        if (data.has_pdf) {
            // 如果文件名是 .md 结尾，需要转换为 .pdf
            let pdfFilename = filename;
            if (filename.endsWith('.md')) {
                pdfFilename = filename.replace('.md', '.pdf');
            }
            const pdfUrl = `/local-papers/${pdfFilename}`;
            await loadPdfFromUrl(pdfUrl);
        } else if (!data.has_pdf && !data.has_markdown) {
            throw new Error('该论文既没有PDF也没有Markdown文件');
        }
        
        // 隐藏上传区域
        const uploadSection = document.getElementById('upload-section');
        if (uploadSection) {
            uploadSection.style.display = 'none';
        }
        
        // 更新Vue应用状态
        if (window.layoutApp) {
            window.layoutApp.pdfLoaded = true;
        }
        if (window.vueChat) {
            // 重要：清空旧的聊天历史，因为这是新会话
            window.vueChat.chatHistory = [];
            window.vueChat.pdfLoaded = true;
            window.vueChat.sessionId = data.session_id;
            // 同时设置全局 sessionId，供 Panel 组件使用
            window.currentSessionId = data.session_id;
            // 重要：启用输入框
            if (typeof window.vueChat.setDocumentLoaded === 'function') {
                window.vueChat.setDocumentLoaded(true);
                console.log('✅ 聊天输入框已启用');
            }
        }
        
        showLoading(false);
        
        // 通知 Panel 组件 PDF 已加载
        notifyDocumentStatus(true);
        
        // 处理 Markdown 转换（如果需要）
        if (!data.has_markdown && data.has_pdf) {
            console.log('PDF 没有对应的 Markdown，触发转换...');
            await convertPdfToMarkdown(data.session_id);
        } else if (data.has_markdown) {
            console.log('✅ Markdown 已存在，跳过转换');
            // 重要：即使跳过转换，也要通知组件 Markdown 已就绪
            notifyMarkdownReady(true);
        }
        
        // 自动生成导读报告
        console.log('自动生成导读报告...');
        await generateProactiveSummary(data.session_id);
        
    } catch (error) {
        console.error('加载本地论文失败:', error);
        showLoading(false);
        alert('加载失败: ' + error.message);
    }
}

// 转换 PDF 为 Markdown
async function convertPdfToMarkdown(sessionId) {
    try {
        showLoading(true, '正在转换 PDF 为 Markdown...');
        
        const response = await fetch('/api/convert-to-markdown', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '转换失败');
        }
        
        console.log('✅ PDF 转换完成');
        
        // 通知 Panel 组件 Markdown 已就绪
        notifyMarkdownReady(true);
        
        if (window.vueChat) {
            window.vueChat.chatHistory.push({
                role: 'system',
                content: 'PDF 转换完成！'
            });
        }
        
    } catch (error) {
        console.error('PDF 转换失败:', error);
        // 转换失败不阻塞后续流程
        if (window.vueChat) {
            window.vueChat.chatHistory.push({
                role: 'system',
                content: 'PDF 转换失败，但您仍可以基于 PDF 提问。'
            });
        }
    } finally {
        showLoading(false);
    }
}

// 生成导读报告
async function generateProactiveSummary(sessionId) {
    try {
        showLoading(true, '正在生成导读报告...');
        
        const response = await fetch('/api/proactive-summary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '生成导读报告失败');
        }
        
        console.log('✅ 导读报告生成成功');
        console.log('导读报告数据:', data);
        console.log('window.vueChat:', window.vueChat);
        console.log('data.summary:', data.summary);
        
        // 显示导读报告
        if (window.vueChat) {
            if (data.summary) {
                console.log('添加导读报告到聊天历史...');
                // 直接添加到聊天历史
                window.vueChat.chatHistory.push({
                    role: 'assistant',
                    content: data.summary
                });
                console.log('✅ 导读报告已添加到聊天界面');
                
                // 滚动到底部
                if (window.vueChat.$nextTick) {
                    window.vueChat.$nextTick(() => {
                        window.vueChat.scrollToBottom();
                    });
                }
            } else {
                console.error('❌ data.summary 为空');
            }
        } else {
            console.error('❌ window.vueChat 不存在');
        }
        
    } catch (error) {
        console.error('生成导读报告失败:', error);
        if (window.vueChat) {
            window.vueChat.chatHistory.push({
                role: 'system',
                content: '导读报告生成失败: ' + error.message
            });
        }
    } finally {
        showLoading(false);
    }
}

// 文件验证
function validateFile(file) {
    // 检查文件类型
    if (file.type !== 'application/pdf') {
        alert('请选择PDF文件');
        return false;
    }
    
    // 检查文件大小 (20MB限制)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
        alert(`文件大小不能超过20MB，当前文件: ${formatFileSize(file.size)}`);
        return false;
    }
    
    // 检查文件名
    if (!file.name || file.name.trim() === '') {
        alert('文件名无效');
        return false;
    }
    
    return true;
}

// 处理文件上传
async function handleFileUpload(file) {
    console.log('开始处理文件:', file.name, '大小:', formatFileSize(file.size));
    
    showLoading(true, '正在上传文件...');
    
    try {
        // 获取 user_id
        const userId = localStorage.getItem('user_id') || 'default_user';
        
        // 创建FormData，使用正确的字段名
        const formData = new FormData();
        formData.append('file', file); // 后端期望的字段名是'file'
        formData.append('user_id', userId); // 添加 user_id
        
        // 上传文件到后端
        const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || '文件上传失败');
        }
        
        const result = await uploadResponse.json();
        console.log('文件上传成功:', result);
        
        // 保存 session_id
        if (result.session_id) {
            window.currentSessionId = result.session_id;
            console.log('Session ID:', result.session_id);
        }
        
        // 加载PDF到viewer
        showLoading(true, '正在加载PDF...');
        await loadPdfDocument(file);
        
        // 更新布局状态
        if (window.layoutApp && typeof window.layoutApp.setPdfLoaded === 'function') {
            window.layoutApp.setPdfLoaded(true);
            console.log('PDF加载状态已更新');
        } else {
            console.error('layoutApp或setPdfLoaded方法不可用:', {
                layoutApp: !!window.layoutApp,
                setPdfLoaded: typeof window.layoutApp?.setPdfLoaded
            });
        }
        
        console.log('✅ PDF文件上传和显示完成！');
        
        // 通知聊天组件文档已加载
        if (window.vueChat && typeof window.vueChat.setDocumentLoaded === 'function') {
            window.vueChat.setDocumentLoaded(true);
            console.log('聊天组件已启用');
        } else {
            console.warn('聊天组件未找到或setDocumentLoaded方法不可用');
        }
        
        // 更新聊天应用的 session_id
        if (window.vueChat) {
            // 重要：清空旧的聊天历史，因为这是新会话
            window.vueChat.chatHistory = [];
            window.vueChat.sessionId = result.session_id;
            window.vueChat.pdfLoaded = true;
        }
        
        // 通知 Panel 组件 PDF 已加载
        notifyDocumentStatus(true);
        
        // 显示分析控制面板
        showAnalysisControls(true);
        
        // 自动进行Markdown转换（为后续AI功能做准备）
        showLoading(true, '正在转换文档格式...');
        await triggerMarkdownConversion(true); // 传入silent参数表示静默转换
        
        // 转换完成后，自动生成导读报告
        if (result.session_id) {
            console.log('自动生成导读报告...');
            await generateProactiveSummary(result.session_id);
        }
        
    } catch (error) {
        console.error('文件处理错误:', error);
        alert(`文件处理失败: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// 加载PDF文档到查看器
async function loadPdfDocument(file) {
    const fileReader = new FileReader();
    
    return new Promise((resolve, reject) => {
        fileReader.onload = async function(e) {
            try {
                const typedarray = new Uint8Array(e.target.result);
                pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                
                console.log('PDF文档加载成功，总页数:', pdfDoc.numPages);
                
                // 渲染第一页
                pageNum = 1;
                await renderPage(pageNum);
                
                // 更新页面信息
                updatePageInfo();
                
                resolve();
            } catch (error) {
                console.error('PDF加载失败:', error);
                reject(error);
            }
        };
        
        fileReader.onerror = () => reject(new Error('文件读取失败'));
        fileReader.readAsArrayBuffer(file);
    });
}

// 渲染PDF页面
async function renderPage(num) {
    console.log('renderPage 被调用，页码:', num);
    console.log('pdfDoc:', pdfDoc);
    console.log('canvas:', canvas);
    console.log('ctx:', ctx);
    
    if (pageRendering) {
        pageNumPending = num;
        console.log('页面正在渲染，设置 pending:', num);
        return;
    }
    
    pageRendering = true;
    
    try {
        console.log('开始获取页面:', num);
        const page = await pdfDoc.getPage(num);
        console.log('页面获取成功');
        
        const viewport = page.getViewport({ scale });
        console.log('视口:', viewport.width, 'x', viewport.height);
        
        // 设置画布尺寸
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = viewport.width * devicePixelRatio;
        canvas.height = viewport.height * devicePixelRatio;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        
        console.log('画布尺寸已设置:', canvas.width, 'x', canvas.height);
        
        const scaledViewport = page.getViewport({ scale: scale * devicePixelRatio });
        
        // 渲染页面
        const renderContext = {
            canvasContext: ctx,
            viewport: scaledViewport
        };
        
        console.log('开始渲染到画布...');
        await page.render(renderContext).promise;
        
        console.log(`✅ 页面 ${num} 渲染完成`);
        
    } catch (error) {
        console.error('❌ 页面渲染失败:', error);
    } finally {
        pageRendering = false;
        
        if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
        }
    }
}

// 更新页面信息
function updatePageInfo() {
    const pageInfo = document.getElementById('page-info');
    if (pageInfo && pdfDoc) {
        pageInfo.textContent = `${pageNum} / ${pdfDoc.numPages}`;
    }
}

// 初始化PDF控件
function initializePdfControls() {
    // 上一页
    document.getElementById('prev-page').addEventListener('click', () => {
        if (pageNum <= 1) return;
        pageNum--;
        renderPage(pageNum);
        updatePageInfo();
    });
    
    // 下一页
    document.getElementById('next-page').addEventListener('click', () => {
        if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
        pageNum++;
        renderPage(pageNum);
        updatePageInfo();
    });
    
    // 放大
    document.getElementById('zoom-in').addEventListener('click', () => {
        scale *= 1.2;
        if (pdfDoc) {
            renderPage(pageNum);
        }
    });
    
    // 缩小
    document.getElementById('zoom-out').addEventListener('click', () => {
        scale /= 1.2;
        if (pdfDoc) {
            renderPage(pageNum);
        }
    });
    
    // 清除PDF
    document.getElementById('clear-pdf').addEventListener('click', () => {
        clearPdf();
    });
    
    console.log('PDF控件初始化完成');
}

// 清除PDF
function clearPdf() {
    pdfDoc = null;
    pageNum = 1;
    scale = 1.5;
    
    // 清除画布
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // 重置布局状态
    if (window.layoutApp && typeof window.layoutApp.setPdfLoaded === 'function') {
        window.layoutApp.setPdfLoaded(false);
        console.log('PDF加载状态已重置');
    }
    
    // 清除分析结果
    clearAnalysisResults();
    
    // 隐藏分析控件并重置状态
    showAnalysisControls(false);
    resetAnalysisButtons();
    
    // 通知Vue组件文档已清除
    notifyDocumentStatus(false);
    notifyMarkdownReady(false);
    
    console.log('PDF已清除');
}

// 开始文档分析
async function startDocumentAnalysis() {
    console.log('开始文档分析...');
    
    try {
        // 转换为Markdown
        const convertResponse = await fetch('/api/convert-to-markdown', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!convertResponse.ok) {
            const errorData = await convertResponse.json();
            throw new Error(errorData.error || '文档转换失败');
        }
        
        const convertData = await convertResponse.json();
        console.log('文档转换完成:', convertData);
        
        // 生成导读报告
        const summaryResponse = await fetch('/api/proactive-summary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!summaryResponse.ok) {
            const errorData = await summaryResponse.json();
            throw new Error(errorData.error || '导读报告生成失败');
        }
        
        const summaryData = await summaryResponse.json();
        console.log('导读报告生成成功:', summaryData);
        
        // 将引导问题传递给聊天组件
        if (summaryData.guiding_questions) {
            console.log('引导问题:', summaryData.guiding_questions);
            // TODO: 后续集成Vue聊天组件时使用
            // window.vueRightPanel.updateGuidingQuestions(summaryData.guiding_questions);
        }
        
        console.log('文档分析完成');
        
    } catch (error) {
        console.error('文档分析失败:', error);
        alert('文档分析失败: ' + error.message);
    }
}

// 显示分析结果 - 操作台保持完全空白
function displayAnalysisResults(data) {
    console.log('导读报告生成成功:', data);
    
    // 在控制台显示成功信息
    alert('导读报告已生成！\n\n注意：当前V2版本暂未集成Discussion组件，导读报告的详细内容请查看浏览器控制台。\n\n下一步将集成聊天组件来显示导读报告和引导问题。');
    
    // TODO: 集成Discussion区域的Vue聊天组件后，在这里显示导读报告
    // 预期功能：
    // 1. 显示导读报告的head部分
    // 2. 显示三个引导性问题
    // 3. 显示end部分
    // 4. 用户可以点击问题进行交互
}

// 显示分析错误
function displayAnalysisError(errorMessage) {
    console.error('导读报告生成失败:', errorMessage);
    alert(`导读报告生成失败: ${errorMessage}`);
}

// 清除分析结果
function clearAnalysisResults() {
    const controlPanel = document.querySelector('.control-panel-content');
    
    if (controlPanel) {
        controlPanel.innerHTML = '';
    }
}

// 初始化内容标签
function initializeContentTabs() {
    // 默认激活第一个标签
    const firstTab = document.querySelector('.content-tab');
    const firstContent = document.querySelector('.tab-content');
    
    if (firstTab) firstTab.classList.add('active');
    if (firstContent) firstContent.classList.add('active');
    
    console.log('内容标签初始化完成');
}

// 初始化分析控件
function initializeAnalysisControls() {
    // 现在分析控件由Vue Panel组件管理
    // 将triggerSummaryGeneration函数暴露到全局，供Vue组件调用
    window.triggerSummaryGeneration = triggerSummaryGeneration;
    console.log('分析控件初始化完成 - Vue Panel模式');
}

// 通知Vue组件文档状态变化
function notifyDocumentStatus(loaded) {
    // 通知聊天组件
    function tryNotifyChat() {
        if (window.vueChat && typeof window.vueChat.setDocumentLoaded === 'function') {
            window.vueChat.setDocumentLoaded(loaded);
            console.log('已通知聊天组件文档状态:', loaded);
        } else {
            setTimeout(tryNotifyChat, 100);
        }
    }
    
    // 通知Panel组件
    function tryNotifyPanel() {
        if (window.vuePanel && typeof window.vuePanel.setPdfLoaded === 'function') {
            window.vuePanel.setPdfLoaded(loaded);
            console.log('已通知Panel组件PDF状态:', loaded);
        } else {
            setTimeout(tryNotifyPanel, 100);
        }
    }
    
    tryNotifyChat();
    tryNotifyPanel();
}

// 通知Vue Panel组件Markdown准备就绪
function notifyMarkdownReady(ready) {
    function tryNotifyPanel() {
        if (window.vuePanel && typeof window.vuePanel.setMarkdownReady === 'function') {
            window.vuePanel.setMarkdownReady(ready);
            console.log('已通知Panel组件Markdown状态:', ready);
        } else {
            setTimeout(tryNotifyPanel, 100);
        }
    }
    tryNotifyPanel();
}

// 显示/隐藏加载状态
function showLoading(show, message = '正在处理文档...') {
    const loading = document.getElementById('loading');
    if (loading) {
        if (show) {
            const loadingText = loading.querySelector('p');
            if (loadingText) {
                loadingText.textContent = message;
            }
            loading.style.display = 'flex';
        } else {
            loading.style.display = 'none';
        }
    }
}

// 工具函数：格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// HTML转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 显示/隐藏分析控制面板
function showAnalysisControls(show) {
    const controlsDiv = document.getElementById('analysis-controls');
    const statusDiv = document.getElementById('analysis-status');
    
    if (controlsDiv) {
        controlsDiv.style.display = show ? 'block' : 'none';
        
        if (show && statusDiv) {
            statusDiv.innerHTML = '<small class="text-success"><i class="fas fa-check-circle me-1"></i>PDF已加载，可以开始文档处理</small>';
        }
    }
}

// 重置分析按钮状态
function resetAnalysisButtons() {
    const summaryBtn = document.getElementById('generate-summary-btn');
    
    if (summaryBtn) {
        summaryBtn.disabled = true;  // 需要等待转换完成才能生成导读
        summaryBtn.innerHTML = '<i class="fas fa-book-reader me-2"></i>生成导读报告';
    }
    
}

// 手动触发Markdown转换
async function triggerMarkdownConversion(silent = false) {
    const convertBtn = document.getElementById('convert-markdown-btn');
    const summaryBtn = document.getElementById('generate-summary-btn');
    const statusDiv = document.getElementById('analysis-status');
    
    // 在静默模式下，即使没有UI元素也要继续执行
    if (!statusDiv && !silent) return;
    
    try {
        // 只在非静默模式下更新UI
        if (!silent && convertBtn) {
            convertBtn.disabled = true;
            convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>转换中...';
        }
        
        // 更新状态
        if (!silent) {
            if (statusDiv) {
                statusDiv.innerHTML = '<small class="text-info"><i class="fas fa-cog fa-spin me-1"></i>正在转换PDF为文本格式...</small>';
            }
            // 显示加载状态
            showLoading(true, '正在转换文档...');
        }
        
        // 调用转换API
        const response = await fetch('/convert_to_markdown', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '文档转换失败');
        }
        
        const data = await response.json();
        console.log('文档转换完成:', data);
        
        // 转换完成，启用导读报告按钮
        if (summaryBtn) {
            summaryBtn.disabled = false;
        }
        
        if (!silent) {
            statusDiv.innerHTML = '<small class="text-success"><i class="fas fa-check-circle me-1"></i>文档转换完成！现在可以生成导读报告</small>';
            if (convertBtn) {
                convertBtn.innerHTML = '<i class="fas fa-check me-2"></i>已转换';
            }
        } else {
            // 静默模式下不操作UI，只记录日志
            console.log('静默模式：文档转换完成，可以生成导读报告');
        }
        
        // 通知Vue组件状态变化
        notifyDocumentStatus(true);
        notifyMarkdownReady(true);
        
    } catch (error) {
        console.error('转换失败:', error);
        if (!silent) {
            if (statusDiv) {
                statusDiv.innerHTML = '<small class="text-danger"><i class="fas fa-exclamation-circle me-1"></i>转换失败，请重试</small>';
            }
            if (convertBtn) {
                convertBtn.innerHTML = '<i class="fas fa-file-alt me-2"></i>转换为文本格式';
            }
            alert(`转换失败: ${error.message}`);
        } else {
            console.log('静默模式：文档转换失败');
        }
    } finally {
        if (!silent && convertBtn) {
            convertBtn.disabled = false;
        }
        if (!silent) {
            showLoading(false);
        }
    }
}

// 手动触发导读报告生成
async function triggerSummaryGeneration() {
    const summaryBtn = document.getElementById('generate-summary-btn');
    const statusDiv = document.getElementById('analysis-status');
    
    if (!summaryBtn || !statusDiv) return;
    
    try {
        // 禁用按钮
        summaryBtn.disabled = true;
        summaryBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>生成中...';
        
        // 更新状态
        statusDiv.innerHTML = '<small class="text-info"><i class="fas fa-cog fa-spin me-1"></i>正在生成导读报告...</small>';
        
        // 显示加载状态
        showLoading(true, '正在生成导读报告...');
        
        // 调用导读报告API
        const response = await fetch('/proactive_summary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '导读报告生成失败');
        }
        
        const data = await response.json();
        console.log('导读报告生成完成:', data);
        
        // 显示分析结果
        displayAnalysisResults(data);
        
        statusDiv.innerHTML = '<small class="text-success"><i class="fas fa-check-circle me-1"></i>导读报告生成完成！</small>';
        summaryBtn.innerHTML = '<i class="fas fa-redo me-2"></i>重新生成';
        
    } catch (error) {
        console.error('导读报告生成失败:', error);
        statusDiv.innerHTML = '<small class="text-danger"><i class="fas fa-exclamation-circle me-1"></i>生成失败，请重试</small>';
        summaryBtn.innerHTML = '<i class="fas fa-book-reader me-2"></i>生成导读报告';
        alert(`生成失败: ${error.message}`);
    } finally {
        summaryBtn.disabled = false;
        showLoading(false);
    }
}

// 加载历史会话
async function loadHistorySession(sessionId) {
    try {
        console.log('加载历史会话:', sessionId);
        showLoading(true, '加载历史会话...');
        
        // 获取会话详情
        const response = await fetch(`/api/session/${sessionId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || '加载会话失败');
        }
        
        const session = data.session;
        console.log('会话详情:', session);
        
        // 设置当前会话
        currentSessionId = sessionId;
        
        // 隐藏上传区域
        const uploadArea = document.getElementById('upload-area');
        if (uploadArea) {
            uploadArea.style.display = 'none';
        }
        
        // 加载 PDF
        if (session.paper_path) {
            let pdfUrl;
            if (session.paper_path.includes('/local_papers/')) {
                const filename = session.paper_path.split('/').pop();
                pdfUrl = `/local-papers/${encodeURIComponent(filename)}`;
            } else {
                const filename = session.paper_path.split('/').pop();
                pdfUrl = `/uploads/${filename}`;
            }
            
            console.log('加载 PDF:', pdfUrl);
            await loadPdfFromUrl(pdfUrl);
        }
        
        // 加载聊天历史
        if (session.session_data && session.session_data.chat_history) {
            if (window.vueChat) {
                window.vueChat.loadHistory(session.session_data.chat_history);
                window.vueChat.enableInput();
            }
        }
        
        // 更新Vue应用状态
        if (window.layoutApp) {
            window.layoutApp.pdfLoaded = true;
        }
        if (window.vueChat) {
            window.vueChat.pdfLoaded = true;
            window.vueChat.sessionId = sessionId;
        }
        
        showLoading(false);
        console.log('✅ 历史会话加载完成');
        
    } catch (error) {
        console.error('加载历史会话失败:', error);
        alert(`加载失败: ${error.message}`);
        showLoading(false);
    }
}

// 从URL加载PDF
async function loadPdfFromUrl(url) {
    try {
        console.log('开始加载 PDF:', url);
        
        // 确保 canvas 已初始化
        if (!canvas) {
            canvas = document.getElementById('pdf-canvas');
            ctx = canvas.getContext('2d');
        }
        
        if (!canvas) {
            throw new Error('PDF canvas 未找到');
        }
        
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDoc = await loadingTask.promise;
        
        console.log('PDF 文档已加载，总页数:', pdfDoc.numPages);
        
        pageNum = 1;
        
        await renderPage(pageNum);
        
        console.log('✅ PDF 加载完成');
    } catch (error) {
        console.error('加载 PDF 失败:', error);
        throw error;
    }
}

// 导出全局函数供其他模块使用
window.readingAgentApp = {
    clearPdf,
    showLoading,
    formatFileSize,
    renderPage,
    updatePageInfo,
    loadHistorySession
};

console.log('Reading Agent v2.0 主应用脚本加载完成');
