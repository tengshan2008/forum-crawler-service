import React from 'react';
import { Tag } from 'antd';
import { GlobalOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons';

// Post.visibility 三态的中文元数据（后端枚举：public/private/protected，默认 private）
export const VISIBILITY_OPTIONS = [
  { value: 'public', label: '公开', icon: <GlobalOutlined /> },
  { value: 'protected', label: '受保护', icon: <TeamOutlined /> },
  { value: 'private', label: '私有', icon: <LockOutlined /> },
];

export const getVisibilityMeta = (value) =>
  VISIBILITY_OPTIONS.find((item) => item.value === value) || VISIBILITY_OPTIONS[2];

// 卡片上的可见性小徽标：颜色与三态语义对齐
export const VISIBILITY_TAG_COLORS = {
  public: 'green',
  protected: 'orange',
  private: 'default',
};

const VisibilityTag = ({ visibility, style }) => {
  const meta = getVisibilityMeta(visibility);
  return (
    <Tag
      color={VISIBILITY_TAG_COLORS[meta.value]}
      icon={meta.icon}
      style={{ marginInlineEnd: 0, ...style }}
    >
      {meta.label}
    </Tag>
  );
};

export default VisibilityTag;
