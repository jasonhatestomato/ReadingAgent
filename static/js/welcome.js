/**
 * 欢迎页面 JavaScript
 * 处理用户身份验证和会话列表
 */

// DOM 元素
let authSection, sessionsSection;
let userIdInput, confirmUserBtn;
let currentUserIdSpan, logoutBtn;
let sessionsList, emptyState;
let newSessionBtn, loadingOverlay;

// 当前用户ID
let currentUserId = null;

// 右键菜单元素
let contextMenu = null;
let contextMenuSessionId = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    bindEvents();
    createContextMenu();
    checkExistingUser();
});

/**
 * 初始化 DOM 元素
 */
function initializeElements() {
    authSection = document.getElementById('auth-section');
    sessionsSection = document.getElementById('sessions-section');
    userIdInput = document.getElementById('user-id-input');
    confirmUserBtn = document.getElementById('confirm-user-btn');
    currentUserIdSpan = document.getElementById('current-user-id');
    logoutBtn = document.getElementById('logout-btn');
    sessionsList = document.getElementById('sessions-list');
    emptyState = document.getElementById('empty-state');
    newSessionBtn = document.getElementById('new-session-btn');
    loadingOverlay = document.getElementById('loading-overlay');
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 确认用户按钮
    confirmUserBtn.addEventListener('click', handleConfirmUser);
    
    // 回车键确认
    userIdInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleConfirmUser();
        }
    });
    
    // 登出按钮
    logoutBtn.addEventListener('click', handleLogout);
    
    // 新建会话按钮
    newSessionBtn.addEventListener('click', handleNewSession);
    
    // 点击其他地方关闭右键菜单
    document.addEventListener('click', hideContextMenu);
}

/**
 * 创建右键菜单
 */
function createContextMenu() {
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.display = 'none';
    contextMenu.innerHTML = `
        <button class="context-menu-item delete-btn" id="context-delete-btn">
            <i class="fas fa-trash-alt me-2"></i>删除会话
        </button>
    `;
    document.body.appendChild(contextMenu);
    
    // 绑定删除按钮事件
    document.getElementById('context-delete-btn').addEventListener('click', handleDeleteSession);
}

/**
 * 显示右键菜单
 */
function showContextMenu(event, sessionId) {
    event.preventDefault();
    event.stopPropagation();
    
    contextMenuSessionId = sessionId;
    
    // 设置菜单位置
    const x = event.pageX;
    const y = event.pageY;
    
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
    
    // 确保菜单不超出视窗
    setTimeout(() => {
        const menuRect = contextMenu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        if (menuRect.right > windowWidth) {
            contextMenu.style.left = (x - menuRect.width) + 'px';
        }
        
        if (menuRect.bottom > windowHeight) {
            contextMenu.style.top = (y - menuRect.height) + 'px';
        }
    }, 0);
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

/**
 * 处理删除会话
 */
async function handleDeleteSession(event) {
    event.stopPropagation();
    hideContextMenu();
    
    if (!contextMenuSessionId) return;
    
    if (!confirm('确定要删除这个会话吗？删除后将无法恢复。')) {
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`/api/session/${contextMenuSessionId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 重新加载会话列表
            await loadUserSessions(currentUserId);
        } else {
            throw new Error(data.error || '删除失败');
        }
    } catch (error) {
        console.error('删除会话失败:', error);
        alert('删除会话失败: ' + error.message);
        hideLoading();
    }
}

/**
 * 检查是否已有用户ID
 */
function checkExistingUser() {
    const savedUserId = localStorage.getItem('user_id');
    
    if (savedUserId) {
        currentUserId = savedUserId;
        userIdInput.value = savedUserId;
        loadUserSessions(savedUserId);
    }
}

/**
 * 处理用户确认
 */
async function handleConfirmUser() {
    const userId = userIdInput.value.trim();
    
    if (!userId) {
        alert('请输入用户ID');
        return;
    }
    
    // 保存到 localStorage
    localStorage.setItem('user_id', userId);
    currentUserId = userId;
    
    // 加载用户会话
    await loadUserSessions(userId);
}

/**
 * 加载用户会话列表
 */
async function loadUserSessions(userId) {
    showLoading();
    
    try {
        const response = await fetch(`/api/sessions?user_id=${encodeURIComponent(userId)}`);
        const data = await response.json();
        
        if (data.success) {
            displaySessions(data.sessions);
            showSessionsSection();
        } else {
            throw new Error(data.error || '获取会话列表失败');
        }
    } catch (error) {
        console.error('获取会话列表失败:', error);
        alert('获取会话列表失败: ' + error.message);
        hideLoading();
    }
}

/**
 * 显示会话列表
 */
function displaySessions(sessions) {
    hideLoading();
    
    // 更新用户显示
    currentUserIdSpan.textContent = currentUserId;
    
    // 清空列表
    sessionsList.innerHTML = '';
    
    if (sessions && sessions.length > 0) {
        // 有会话，显示列表
        sessions.forEach(session => {
            const sessionItem = createSessionItem(session);
            sessionsList.appendChild(sessionItem);
        });
        
        emptyState.style.display = 'none';
        document.getElementById('new-session-text').textContent = '新建会话';
    } else {
        // 无会话，显示空状态
        emptyState.style.display = 'block';
        document.getElementById('new-session-text').textContent = '开启文献阅读之路';
    }
}

/**
 * 创建会话项元素
 */
function createSessionItem(session) {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.onclick = () => handleSessionClick(session.session_id);
    
    // 添加右键菜单事件
    div.oncontextmenu = (e) => showContextMenu(e, session.session_id);
    
    // 格式化时间
    const createdAt = formatDateTime(session.created_at);
    const updatedAt = formatDateTime(session.updated_at);
    
    div.innerHTML = `
        <div class="session-item-header">
            <div class="session-icon">
                <i class="fas fa-file-alt"></i>
            </div>
            <div class="session-title">${escapeHtml(session.title || '未命名会话')}</div>
        </div>
        <div class="session-meta">
            <div class="session-meta-item">
                <i class="far fa-calendar-plus"></i>
                <span>${createdAt}</span>
            </div>
            <div class="session-meta-item">
                <i class="far fa-clock"></i>
                <span>${updatedAt}</span>
            </div>
        </div>
    `;
    
    return div;
}

/**
 * 处理会话点击
 */
function handleSessionClick(sessionId) {
    // 跳转到主页并加载该会话
    window.location.href = `/main?session_id=${sessionId}`;
}

/**
 * 处理新建会话
 */
function handleNewSession() {
    // 跳转到主页，不带 session_id
    window.location.href = '/main';
}

/**
 * 处理登出
 */
function handleLogout() {
    if (confirm('确定要切换用户吗？')) {
        // 清除 localStorage
        localStorage.removeItem('user_id');
        currentUserId = null;
        
        // 重置界面
        hideSessionsSection();
        userIdInput.value = '';
        userIdInput.focus();
    }
}

/**
 * 显示会话区域
 */
function showSessionsSection() {
    authSection.style.display = 'none';
    sessionsSection.style.display = 'block';
}

/**
 * 隐藏会话区域
 */
function hideSessionsSection() {
    sessionsSection.style.display = 'none';
    authSection.style.display = 'block';
}

/**
 * 显示 Loading
 */
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

/**
 * 隐藏 Loading
 */
function hideLoading() {
    loadingOverlay.style.display = 'none';
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateString) {
    if (!dateString) return '未知';
    
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // 小于1分钟
    if (diff < 60000) {
        return '刚刚';
    }
    
    // 小于1小时
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}分钟前`;
    }
    
    // 小于24小时
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}小时前`;
    }
    
    // 小于7天
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days}天前`;
    }
    
    // 其他情况显示完整日期
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
