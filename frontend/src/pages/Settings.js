import React, { useState } from 'react';
import { Card, Form, Input, Button, Message, Row, Col, Divider, Space, Alert, Modal } from 'antd';
import { LockOutlined, UserOutlined, MailOutlined, SaveOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { getCurrentUser } from '../services/authService';
import { updateProfile, changePassword } from '../services/api';
import './Settings.css';

const Settings = () => {
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [message, setMessage] = useState({ type: '', text: '' });

  // 初始化表单
  React.useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        username: user.username || '',
        email: user.email || '',
      });
    }
  }, [user, profileForm]);

  // 显示消息
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // 更新个人信息
  const handleProfileSubmit = async (values) => {
    setLoading(true);
    try {
      const response = await updateProfile({
        username: values.username,
        email: values.email,
      });
      
      if (response.data.success) {
        showMessage('success', '个人信息更新成功！');
      } else {
        showMessage('error', response.data.message || '更新失败');
      }
    } catch (error) {
      showMessage('error', error.message || '更新个人信息失败');
    } finally {
      setLoading(false);
    }
  };

  // 更改密码
  const handlePasswordSubmit = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      showMessage('error', '新密码和确认密码不一致');
      return;
    }

    Modal.confirm({
      title: '确认更改密码',
      icon: <ExclamationCircleOutlined />,
      content: '修改后需要重新登录，是否继续？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setLoading(true);
        try {
          const response = await changePassword({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          });

          if (response.data.success) {
            showMessage('success', '密码已更改，请重新登录');
            passwordForm.resetFields();
            setTimeout(() => {
              window.location.href = '/login';
            }, 2000);
          } else {
            showMessage('error', response.data.message || '密码更改失败');
          }
        } catch (error) {
          showMessage('error', error.message || '更改密码失败');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <div className="settings-container">
      <Row gutter={[24, 24]}>
        {/* 消息提示 */}
        {message.text && (
          <Col xs={24}>
            <Alert
              message={message.text}
              type={message.type}
              showIcon
              closable
            />
          </Col>
        )}

        {/* 用户信息卡片 */}
        <Col xs={24} md={12}>
          <Card
            title={
              <Space>
                <UserOutlined />
                <span>个人信息</span>
              </Space>
            }
            className="settings-card"
          >
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={handleProfileSubmit}
              autoComplete="off"
            >
              <Form.Item
                label="用户名"
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少3个字符' },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="输入用户名"
                  disabled
                />
              </Form.Item>

              <Form.Item
                label="邮箱"
                name="email"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '邮箱格式不正确' },
                ]}
              >
                <Input
                  prefix={<MailOutlined />}
                  placeholder="输入邮箱地址"
                />
              </Form.Item>

              <Form.Item
                label="用户角色"
                name="role"
              >
                <Input
                  value={user?.role || 'user'}
                  disabled
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  htmlType="submit"
                  loading={loading}
                  block
                >
                  保存修改
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        {/* 安全设置卡片 */}
        <Col xs={24} md={12}>
          <Card
            title={
              <Space>
                <LockOutlined />
                <span>安全设置</span>
              </Space>
            }
            className="settings-card"
          >
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={handlePasswordSubmit}
              autoComplete="off"
            >
              <Form.Item
                label="当前密码"
                name="currentPassword"
                rules={[{ required: true, message: '请输入当前密码' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="输入当前密码"
                />
              </Form.Item>

              <Form.Item
                label="新密码"
                name="newPassword"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 6, message: '密码至少6个字符' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="输入新密码（至少6个字符）"
                />
              </Form.Item>

              <Form.Item
                label="确认新密码"
                name="confirmPassword"
                rules={[
                  { required: true, message: '请确认新密码' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="再次输入新密码"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  danger
                  icon={<SaveOutlined />}
                  htmlType="submit"
                  loading={loading}
                  block
                >
                  更改密码
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        {/* 账户信息摘要 */}
        <Col xs={24}>
          <Card
            title="账户信息摘要"
            className="settings-card"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={6}>
                <div className="info-item">
                  <div className="info-label">用户名</div>
                  <div className="info-value">{user?.username || '-'}</div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div className="info-item">
                  <div className="info-label">邮箱</div>
                  <div className="info-value">{user?.email || '-'}</div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div className="info-item">
                  <div className="info-label">用户角色</div>
                  <div className="info-value">
                    <span className={`role-badge role-${user?.role}`}>
                      {user?.role === 'admin' ? '管理员' : 
                       user?.role === 'editor' ? '编辑' :
                       user?.role === 'user' ? '普通用户' : '访客'}
                    </span>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div className="info-item">
                  <div className="info-label">账户状态</div>
                  <div className="info-value">
                    <span className={`status-badge status-${user?.status}`}>
                      {user?.status === 'active' ? '活跃' : 
                       user?.status === 'inactive' ? '未激活' : '已禁用'}
                    </span>
                  </div>
                </div>
              </Col>
            </Row>

            <Divider />

            <div className="security-tips">
              <h4>安全建议</h4>
              <ul>
                <li>定期更改您的密码，使用强密码提高账户安全性</li>
                <li>不要在多个网站使用相同的密码</li>
                <li>不要向任何人透露您的密码或API令牌</li>
                <li>如果怀疑账户被黑，请立即更改密码</li>
              </ul>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Settings;
