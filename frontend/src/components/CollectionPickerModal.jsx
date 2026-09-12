import React, { useState } from 'react';
import { Modal, Checkbox, Input, Button, Empty, Space, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { browseApi } from '../services/api';

const { Text } = Typography;

/**
 * 重名预检（纯函数，可直测）：在已加载的本人收藏夹里精确匹配名称。
 * 与后端复合唯一索引 {userId, name} 同语义（大小写敏感）；后端仍是最终裁决。
 */
export const findDuplicateCollectionName = (collections, name) =>
  (collections || []).find((c) => c.name === name) || null;

/**
 * 收藏到收藏夹弹窗（图片/小说浏览共用）
 * 后端收藏粒度为整个 Post（网页/组）：勾选即调后端增删，支持「新建并收藏」。
 * 收藏夹列表由父组件加载并经 props 传入，操作成功后通过 onChanged 触发父组件刷新。
 */
const CollectionPickerModal = ({ open, post, collections = [], onClose, onChanged }) => {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState(null);

  if (!post) return null;

  const checkedIds = new Set(
    collections
      .filter((c) => (c.items || []).map(String).includes(String(post._id)))
      .map((c) => String(c._id))
  );

  // 勾选 = 加入收藏夹，取消勾选 = 移除，即时生效
  const handleToggle = async (collectionId, checked) => {
    setPendingId(collectionId);
    try {
      const fn = checked ? browseApi.addToCollection : browseApi.removeFromCollection;
      const res = await fn(collectionId, post._id);
      message.success(res.data?.message || (checked ? '已收藏' : '已取消收藏'));
      if (onChanged) await onChanged();
    } catch (error) {
      message.error(error.response?.data?.message || (checked ? '收藏失败' : '取消收藏失败'));
    } finally {
      setPendingId(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      message.warning('请输入收藏夹名称');
      return;
    }
    if (findDuplicateCollectionName(collections, name)) {
      message.error('同名收藏夹已存在');
      return;
    }
    setCreating(true);
    try {
      const res = await browseApi.createCollection({ name });
      const created = res.data?.data;
      if (created?._id) {
        await browseApi.addToCollection(created._id, post._id);
        message.success(`已创建「${name}」并收藏`);
      } else {
        message.success('收藏夹已创建');
      }
      setNewName('');
      if (onChanged) await onChanged();
    } catch (error) {
      // 后端 409「同名收藏夹已存在」等精确文案透出
      message.error(error.response?.data?.message || '创建收藏夹失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      title={`收藏「${post.title || '未命名内容'}」`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
    >
      {collections.length === 0 ? (
        <Empty
          description='暂无收藏夹，新建一个吧'
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ margin: '16px 0' }}
        />
      ) : (
        <Space direction='vertical' style={{ width: '100%' }} size={4}>
          {collections.map((c) => (
            <div
              key={c._id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Checkbox
                checked={checkedIds.has(String(c._id))}
                disabled={pendingId === c._id}
                onChange={(e) => handleToggle(c._id, e.target.checked)}
              >
                {c.name}
              </Checkbox>
              <Text type='secondary'>{c.itemCount ?? (c.items || []).length} 项</Text>
            </div>
          ))}
        </Space>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Input
          placeholder='新建收藏夹名称'
          value={newName}
          maxLength={50}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleCreate}
        />
        <Button icon={<PlusOutlined />} loading={creating} onClick={handleCreate}>
          新建并收藏
        </Button>
      </div>
    </Modal>
  );
};

export default CollectionPickerModal;
