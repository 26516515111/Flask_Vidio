import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types/chat';
import ChatMessageComponent from './ChatMessage';
import EmptyState from './EmptyState';
import styles from './ChatHistory.module.css';

interface ChatHistoryProps {
  messages: ChatMessage[];
  onCapabilityClick?: (key: string) => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, onCapabilityClick }) => {
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={styles.emptyWrapper}>
        <EmptyState onCapabilityClick={onCapabilityClick} />
      </div>
    );
  }

  return (
    <div className={styles.messages}>
      {messages.map((message) => (
        <ChatMessageComponent key={message.id} message={message} />
      ))}
      <div ref={scrollAnchorRef} className={styles.scrollAnchor} />
    </div>
  );
};

export default ChatHistory;
