import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  PlusOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { RootState } from '../store';
import { newConversation, setActiveConversation, deleteConversation } from '../store/chatSlice';
import styles from './ChatSidebar.module.css';

const ChatSidebar: React.FC = () => {
  const dispatch = useDispatch();
  const { conversations, activeConversationId } = useSelector((state: RootState) => state.chat);
  const [collapsed, setCollapsed] = useState(false);

  const handleNewChat = () => {
    dispatch(newConversation());
    setCollapsed(false);
  };

  const handleSelect = (id: string) => {
    dispatch(setActiveConversation(id));
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dispatch(deleteConversation(id));
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  return (
    <>
      {!collapsed && (
        <div className={styles.backdrop} onClick={() => setCollapsed(true)} />
      )}

      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.header}>
          <button className={styles.newChatBtn} onClick={handleNewChat} title="新对话">
            <PlusOutlined />
            {!collapsed && <span>新对话</span>}
          </button>
          <button
            className={styles.toggleBtn}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.list}>
          {conversations.length === 0 ? (
            <div className={styles.empty} onClick={handleNewChat}>
              <MessageOutlined className={styles.emptyIcon} />
              <span className={styles.emptyText}>暂无对话记录</span>
              <span className={styles.emptyHint}>点击开始新对话</span>
            </div>
          ) : (
            <>
              {!collapsed && <div className={styles.listLabel}>对话历史</div>}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`${styles.item} ${conv.id === activeConversationId ? styles.itemActive : ''}`}
                  onClick={() => handleSelect(conv.id)}
                  title={collapsed ? conv.title : undefined}
                >
                  <span className={styles.itemDot} />
                  <div className={styles.itemContent}>
                    <div className={styles.itemText}>{conv.title}</div>
                    <div className={styles.itemMeta}>
                      <span className={styles.itemCount}>{conv.messages.length} 条消息</span>
                      <span className={styles.itemTime}>{formatTime(conv.updatedAt)}</span>
                    </div>
                  </div>
                  <button
                    className={styles.itemDelete}
                    onClick={(e) => handleDelete(e, conv.id)}
                    title="删除对话"
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
};

export default ChatSidebar;
