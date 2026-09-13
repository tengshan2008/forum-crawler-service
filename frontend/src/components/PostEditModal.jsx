import { useEffect } from 'react';
import { Modal, Form, Input, Radio, Select } from 'antd';
import { postApi } from '../services/api';
import { VISIBILITY_OPTIONS } from '../utils/postMeta';

import { message } from '../utils/antdApp';
// 表单值 → PUT 请求载荷（标题 trim 兜底、标签去空去重）
export function buildPostUpdatePayload(values, post) {
  return {
    title: values.title?.trim() || post.title || '未命名',
    visibility: values.visibility,
    tags: Array.from(
      new Set((values.tags || []).map((t) => t.trim()).filter(Boolean))
    ),
  };
}

// 帖子元信息编辑弹窗（图片组/小说浏览共用）。
// 后端 PUT /api/posts/:id 白名单：title/content/visibility/status/tags，
// 且按 {_id, userId} 校验——只有资源所有者能改，非所有者会收到 404。
const PostEditModal = ({ open, post, onClose, onSaved }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open && post) {
      form.setFieldsValue({
        title: post.title || '',
        visibility: post.visibility || 'private',
        tags: post.tags || [],
      });
    }
  }, [open, post, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = buildPostUpdatePayload(values, post);
      const res = await postApi.update(post._id, payload);
      message.success('信息已更新');
      onSaved?.(res.data?.data || { ...post, ...payload });
    } catch (error) {
      if (error?.errorFields) return; // 表单校验失败，antd 已提示
      console.error('更新帖子信息失败:', error);
      message.error(error.response?.data?.message || '更新失败，仅资源所有者可编辑');
    }
  };

  return (
    <Modal
      title='编辑信息'
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText='保存'
      cancelText='取消'
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout='vertical' preserve={false} style={{ marginTop: 16 }}>
        <Form.Item
          name='title'
          label='标题'
          rules={[
            { required: true, message: '请输入标题' },
            { max: 200, message: '标题最长 200 个字符' },
          ]}
        >
          <Input placeholder='请输入标题' maxLength={200} showCount />
        </Form.Item>

        <Form.Item name='visibility' label='可见性'>
          <Radio.Group optionType='button' buttonStyle='solid'>
            {VISIBILITY_OPTIONS.map((opt) => (
              <Radio.Button key={opt.value} value={opt.value}>
                {opt.icon} {opt.label}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>

        <Form.Item name='tags' label='标签' tooltip='输入后回车添加，可自由创建'>
          <Select
            mode='tags'
            placeholder='添加标签，回车确认'
            tokenSeparators={[',', '，']}
            open={false}
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default PostEditModal;
