import React from 'react';
import { Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import {
  AudioOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { setDrawerOpen } from '../store/settingsSlice';
import styles from './ChatHeader.module.css';

const ChatHeader: React.FC = () => {
  const dispatch = useDispatch();

  const menuItems: MenuProps['items'] = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
      onClick: () => dispatch(setDrawerOpen(true)),
    },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>
          <AudioOutlined />
        </div>
        <span className={styles.logoText}>语音转换助手</span>
      </div>

      <div className={styles.center} />

      <div className={styles.right}>
        <Dropdown menu={{ items: menuItems }} placement="bottomRight">
          <Space className={styles.userDropdown}>
            <SettingOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
          </Space>
        </Dropdown>
      </div>
    </header>
  );
};

export default ChatHeader;
