"""
数据库操作模块
使用 SQLite 存储会话数据
"""
import sqlite3
import json
import uuid
from datetime import datetime
from contextlib import contextmanager
from config import DATABASE_CONFIG

class DatabaseManager:
    """数据库管理器 - 处理所有数据库操作"""
    
    def __init__(self):
        self.db_path = DATABASE_CONFIG['db_path']
        self._init_database()
    
    @contextmanager
    def get_connection(self):
        """获取数据库连接的上下文管理器"""
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=DATABASE_CONFIG['timeout'],
            check_same_thread=DATABASE_CONFIG['check_same_thread']
        )
        conn.row_factory = sqlite3.Row  # 返回字典式结果
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()
    
    def _init_database(self):
        """初始化数据库表"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # 创建 sessions 表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT,
                    current_state TEXT NOT NULL,
                    paper_path TEXT,
                    markdown_path TEXT,
                    session_data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 创建索引
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_user_id 
                ON sessions(user_id)
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_updated_at 
                ON sessions(updated_at DESC)
            ''')
            
            print("✅ 数据库初始化完成")
    
    # ========== CRUD 操作 ==========
    
    def create_session(self, user_id, title, paper_path=None, markdown_path=None):
        """
        创建新会话
        
        Args:
            user_id: 用户ID
            title: 会话标题（文献标题）
            paper_path: PDF文件路径
            markdown_path: Markdown文件路径
        
        Returns:
            str: 新创建的 session_id
        """
        session_id = str(uuid.uuid4())
        initial_data = {
            'chat_history': [],
            'reading_plan': None,
            'context': {},
            'agent_inquiry_status': {
                'review': False,  # review_agent是否已被询问过
                'method': False,
                'result': False,
                'discussion': False
            },
            'mindmap_outline': None  # 思维导图大纲缓存
        }
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO sessions 
                (session_id, user_id, title, current_state, paper_path, markdown_path, session_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                session_id,
                user_id,
                title,
                'GUIDE_PENDING_REPORT',  # 初始状态
                paper_path,
                markdown_path,
                json.dumps(initial_data, ensure_ascii=False)
            ))
        
        print(f"✅ 创建新会话: {session_id} (用户: {user_id})")
        return session_id
    
    def get_user_sessions(self, user_id):
        """
        获取用户的所有会话列表
        
        Args:
            user_id: 用户ID
        
        Returns:
            list: 会话列表，按更新时间倒序
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT session_id, title, created_at, updated_at
                FROM sessions
                WHERE user_id = ?
                ORDER BY updated_at DESC
            ''', (user_id,))
            
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    
    def get_session(self, session_id):
        """
        获取单个会话的完整信息
        
        Args:
            session_id: 会话ID
        
        Returns:
            dict: 会话详情，如果不存在返回 None
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT *
                FROM sessions
                WHERE session_id = ?
            ''', (session_id,))
            
            row = cursor.fetchone()
            if row:
                session = dict(row)
                # 解析 JSON 数据
                session['session_data'] = json.loads(session['session_data'])
                return session
            return None
    
    def update_session(self, session_id, **kwargs):
        """
        更新会话信息
        
        Args:
            session_id: 会话ID
            **kwargs: 要更新的字段（支持：title, current_state, paper_path, markdown_path, session_data）
        """
        # 构建动态 UPDATE 语句
        fields = []
        values = []
        
        for key, value in kwargs.items():
            if key == 'session_data':
                # JSON 数据需要序列化
                value = json.dumps(value, ensure_ascii=False)
            fields.append(f"{key} = ?")
            values.append(value)
        
        # 更新时间戳
        fields.append("updated_at = CURRENT_TIMESTAMP")
        
        if not fields:
            return
        
        values.append(session_id)
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                UPDATE sessions
                SET {', '.join(fields)}
                WHERE session_id = ?
            ''', values)
            
            print(f"✅ 更新会话: {session_id}")
    
    def update_chat_history(self, session_id, new_message):
        """
        向会话添加新的聊天消息
        
        Args:
            session_id: 会话ID
            new_message: 新消息 dict，格式：{'role': 'user'/'assistant', 'content': '...'}
        """
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"会话不存在: {session_id}")
        
        session_data = session['session_data']
        session_data['chat_history'].append(new_message)
        
        self.update_session(session_id, session_data=session_data)
    
    def delete_session(self, session_id):
        """
        删除会话
        
        Args:
            session_id: 会话ID
        
        Returns:
            bool: 是否成功删除
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM sessions WHERE session_id = ?', (session_id,))
            success = cursor.rowcount > 0
            
            if success:
                print(f"✅ 删除会话: {session_id}")
            
            return success

# 全局数据库实例
db = DatabaseManager()
