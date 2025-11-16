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
let renderRetryCount = 0; // 渲染重试计数器
const MAX_RENDER_RETRIES = 10; // 最大重试次数

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
    // 配置 worker 和 CMap 支持
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    // 配置 CMap 以支持中文字符（重要！）
    pdfjsLib.GlobalWorkerOptions.cMapUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/';
    pdfjsLib.GlobalWorkerOptions.cMapPacked = true;
    
    canvas = document.getElementById('pdf-canvas');
    ctx = canvas.getContext('2d');
    
    console.log('PDF.js 初始化完成（已启用 CMap 支持）');
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
        
        // 先更新Vue状态以显示PDF容器（重要：必须在加载PDF之前）
        if (window.layoutApp) {
            window.layoutApp.pdfLoaded = true;
        }
        if (window.vueChat) {
            window.vueChat.chatHistory = [];
            window.vueChat.pdfLoaded = true;
            window.vueChat.sessionId = data.session_id;
            window.currentSessionId = data.session_id;
        }
        
        // 等待Vue渲染容器
        await new Promise(resolve => setTimeout(resolve, 50));
        
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
        
        // 启用聊天输入框
        if (window.vueChat) {
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
    
    showLoading(true, '正在上传文件到OSS...');
    
    try {
        // 获取 user_id
        const userId = localStorage.getItem('user_id') || 'default_user';
        
        // 1. 获取 OSS 配置
        console.log('📡 获取OSS配置...');
        const ossConfigResponse = await fetch('/api/oss-config');
        if (!ossConfigResponse.ok) {
            throw new Error('获取OSS配置失败');
        }
        const ossConfigData = await ossConfigResponse.json();
        const ossConfig = ossConfigData.config;
        
        // 2. 使用 OSS SDK 上传文件到阿里云
        console.log('📤 上传文件到阿里云OSS...');
        const OSS = window.OSS; // 需要在 HTML 中引入 OSS SDK
        
        if (!OSS) {
            throw new Error('阿里云 OSS SDK 未加载，请检查 index.html 中是否引入了 aliyun-oss-sdk');
        }
        
        const client = new OSS({
            region: 'oss-cn-shanghai',  // 直接使用 region endpoint
            accessKeyId: ossConfig.accessKeyId,
            accessKeySecret: ossConfig.accessKeySecret,
            bucket: ossConfig.bucket
        });
        
        // 生成唯一文件名
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const fileName = `papers/${timestamp}_${randomStr}_${file.name}`;
        
        // 上传到 OSS（Bucket 需要设置为公共读或公共读写）
        const ossResult = await client.put(fileName, file);
        const pdfUrl = ossResult.url;
        
        console.log('✅ OSS 上传成功:', pdfUrl);
        
        // 3. 将 OSS URL 发送给后端
        showLoading(true, '正在处理文件...');
        const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                pdf_url: pdfUrl,
                title: file.name.replace('.pdf', '')
            })
        });
        
        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || '文件处理失败');
        }
        
        const result = await uploadResponse.json();
        console.log('文件处理成功:', result);
        
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
                
                // 配置 CMap 支持以正确显示中文
                const loadingTask = pdfjsLib.getDocument({
                    data: typedarray,
                    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                    cMapPacked: true
                });
                
                pdfDoc = await loadingTask.promise;
                
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
        
        // 获取容器尺寸（用于计算缩放比例）- 使用 .pdf-viewer 而不是 canvas 的直接父元素
        const container = document.querySelector('.pdf-viewer');
        if (!container) {
            console.error('未找到 .pdf-viewer 容器');
            pageRendering = false;
            renderRetryCount = 0;
            return;
        }
        
        let containerWidth = container.clientWidth - 40; // 减去 padding
        let containerHeight = container.clientHeight - 40; // 减去 padding
        
        // 如果容器尺寸为0，说明可能还没显示，等待一下再重试
        if (containerWidth <= 0 || containerHeight <= 0) {
            if (renderRetryCount >= MAX_RENDER_RETRIES) {
                console.error('容器尺寸获取失败，已达到最大重试次数');
                pageRendering = false;
                renderRetryCount = 0;
                return;
            }
            
            renderRetryCount++;
            console.log(`容器尺寸为0，等待100ms后重试... (${renderRetryCount}/${MAX_RENDER_RETRIES})`);
            pageRendering = false;
            await new Promise(resolve => setTimeout(resolve, 100));
            return renderPage(num);
        }
        
        // 重置重试计数器
        renderRetryCount = 0;
        
        console.log('容器尺寸:', containerWidth, 'x', containerHeight);
        
        // 获取原始页面尺寸
        const originalViewport = page.getViewport({ scale: 1.0 });
        console.log('原始页面尺寸:', originalViewport.width, 'x', originalViewport.height);
        
        // 垂直优先适应：优先让高度填满容器，如果宽度超出则按宽度限制
        let baseScale;
        const scaleToFitHeight = containerHeight / originalViewport.height;
        const scaleToFitWidth = containerWidth / originalViewport.width;
        
        // 先尝试用高度缩放
        baseScale = scaleToFitHeight;
        // 检查此时宽度是否超出，如果超出则改用宽度缩放
        if (originalViewport.width * baseScale > containerWidth) {
            baseScale = scaleToFitWidth;
        }
        
        console.log('高度缩放:', scaleToFitHeight, '宽度缩放:', scaleToFitWidth, '基准缩放:', baseScale);
        
        // 应用用户的缩放调整（scale 变量来自缩放按钮）
        let finalScale = baseScale * scale;
        
        console.log('最终缩放:', finalScale);
        
        const viewport = page.getViewport({ scale: finalScale });
        console.log('视口:', viewport.width, 'x', viewport.height);
        
        // 设置画布尺寸
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = viewport.width * devicePixelRatio;
        canvas.height = viewport.height * devicePixelRatio;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        
        console.log('画布尺寸已设置:', canvas.width, 'x', canvas.height);
        
        const scaledViewport = page.getViewport({ scale: finalScale * devicePixelRatio });
        
        // 渲染页面到画布
        const renderContext = {
            canvasContext: ctx,
            viewport: scaledViewport
        };
        
        console.log('开始渲染到画布...');
        await page.render(renderContext).promise;
        
        console.log(`✅ 页面 ${num} 渲染完成`);
        
        // 渲染文本层
        await renderTextLayer(page, viewport);
        
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

// 渲染文本层
async function renderTextLayer(page, viewport) {
    try {
        // 获取 canvas 的包装容器
        const canvasWrapper = document.getElementById('pdf-canvas-wrapper');
        if (!canvasWrapper) {
            console.warn('未找到 canvas 包装容器');
            return;
        }
        
        // 移除旧的文本层
        const oldTextLayer = canvasWrapper.querySelector('.textLayer');
        if (oldTextLayer) {
            oldTextLayer.remove();
        }
        
        // 创建文本层容器
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = viewport.width + 'px';
        textLayerDiv.style.height = viewport.height + 'px';
        // 设置 CSS 变量以避免 PDF.js 警告
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        
        // 将文本层添加到 canvas 包装容器
        canvasWrapper.appendChild(textLayerDiv);
        
        // 获取文本内容
        const textContent = await page.getTextContent();
        
        // 渲染文本层
        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        });
        
        console.log('✅ 文本层渲染完成');
    } catch (error) {
        console.error('❌ 文本层渲染失败:', error);
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
        const response = await fetch('/api/convert-to-markdown', {
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
            
            // 判断是否是 OSS URL（以 http:// 或 https:// 开头）
            if (session.paper_path.startsWith('http://') || session.paper_path.startsWith('https://')) {
                // 直接使用 OSS URL
                pdfUrl = session.paper_path;
                console.log('检测到 OSS URL:', pdfUrl);
            } else if (session.paper_path.includes('/local_papers/')) {
                // 本地示例论文
                const filename = session.paper_path.split('/').pop();
                pdfUrl = `/local-papers/${encodeURIComponent(filename)}`;
            } else {
                // uploads 文件夹（旧的上传方式，已废弃）
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
        
        // 通知Panel组件PDF已加载
        notifyDocumentStatus(true);
        
        // 如果有markdown_path，说明文档已转换，启用mindmap等功能
        if (session.markdown_path) {
            notifyMarkdownReady(true);
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
        
        // 配置 CMap 支持以正确显示中文
        const loadingTask = pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true
        });
        
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

// ==================== PDF 右键菜单功能 ====================

// 初始化右键菜单
function initPdfContextMenu() {
    const contextMenu = document.getElementById('pdf-context-menu');
    const pdfViewer = document.querySelector('.pdf-viewer'); // 使用 querySelector 而不是 getElementById
    
    if (!contextMenu || !pdfViewer) {
        console.warn('右键菜单或PDF查看器元素未找到，跳过初始化');
        return;
    }
    
    let selectedText = '';
    
    // 监听 PDF 查看器的右键点击
    pdfViewer.addEventListener('contextmenu', (e) => {
        // 检查是否点击在文本层上
        const textLayer = e.target.closest('.textLayer');
        if (!textLayer) {
            return; // 不在文本层，允许默认行为
        }
        
        e.preventDefault();
        
        // 获取选中的文本
        selectedText = window.getSelection().toString().trim();
        
        if (!selectedText) {
            return; // 没有选中文本，不显示菜单
        }
        
        // 显示菜单
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        contextMenu.classList.add('active');
    });
    
    // 点击菜单项
    contextMenu.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.pdf-context-menu-item');
        if (!menuItem) return;
        
        const action = menuItem.dataset.action;
        
        switch (action) {
            case 'highlight-yellow':
                highlightSelectedText('#fef3c7'); // 淡黄色
                break;
            case 'highlight-green':
                highlightSelectedText('#d1fae5'); // 淡绿色
                break;
            case 'highlight-blue':
                highlightSelectedText('#dbeafe'); // 淡蓝色
                break;
            case 'copy':
                copySelectedText();
                break;
        }
        
        // 隐藏菜单
        contextMenu.classList.remove('active');
    });
    
    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.remove('active');
        }
    });
}

// 高亮选中的文本
function highlightSelectedText(color) {
    const selection = window.getSelection();
    if (!selection.rangeCount) {
        console.warn('没有选中的文本');
        return;
    }
    
    const range = selection.getRangeAt(0);
    
    // 获取所有被选中的文本节点
    const container = range.commonAncestorContainer;
    const textLayer = container.nodeType === 1 
        ? container.closest('.textLayer') 
        : container.parentElement.closest('.textLayer');
    
    if (!textLayer) {
        console.error('未找到文本层');
        return;
    }
    
    // 遍历文本层中的所有 span 元素
    const spans = textLayer.querySelectorAll('span');
    let highlightedCount = 0;
    
    spans.forEach(span => {
        // 检查这个 span 是否与选区有交集
        const spanRange = document.createRange();
        spanRange.selectNodeContents(span);
        
        // 如果有交集，则高亮
        if (rangesIntersect(range, spanRange)) {
            span.style.backgroundColor = color;
            span.classList.add('pdf-highlight');
            highlightedCount++;
        }
    });
    
    console.log(`✅ 已高亮 ${highlightedCount} 个文本片段`);
    
    // 清除选区
    selection.removeAllRanges();
}

// 检查两个 Range 是否有交集
function rangesIntersect(range1, range2) {
    try {
        // 如果 range2 的结束在 range1 的开始之前，没有交集
        if (range2.compareBoundaryPoints(Range.END_TO_START, range1) < 0) {
            return false;
        }
        // 如果 range2 的开始在 range1 的结束之后，没有交集
        if (range2.compareBoundaryPoints(Range.START_TO_END, range1) > 0) {
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

// 复制选中的文本
function copySelectedText() {
    const text = window.getSelection().toString();
    if (!text) {
        console.warn('没有选中的文本');
        return;
    }
    
    // 尝试使用现代 API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('✅ 文本已复制到剪贴板');
            showToast('已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败:', err);
            // 降级到传统方法
            fallbackCopyText(text);
        });
    } else {
        // 浏览器不支持现代 API，使用传统方法
        fallbackCopyText(text);
    }
}

// 降级复制方法（适用于旧浏览器或非安全上下文）
function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            console.log('✅ 文本已复制到剪贴板（降级方法）');
            showToast('已复制到剪贴板');
        } else {
            console.error('复制失败');
            showToast('复制失败，请手动复制');
        }
    } catch (err) {
        console.error('复制失败:', err);
        showToast('复制失败，请手动复制');
    }
    
    document.body.removeChild(textArea);
}

// 显示临时提示
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #374151;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 10001;
        animation: slideInRight 0.3s ease-out;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initPdfContextMenu();
});

console.log('Reading Agent v2.0 主应用脚本加载完成');
