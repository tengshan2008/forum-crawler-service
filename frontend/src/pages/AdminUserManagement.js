import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import './AdminUserManagement.css';

const AdminUserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
  });
  const [form] = Form.useForm();
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [pagination]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/users', {
        params: {
          limit: pagination.pageSize,
          skip: (pagination.current - 1) * pagination.pageSize,
        },
      });

      if (response.data.success) {
        setUsers(response.data.data.users);
        setTotal(response.data.data.total);
      }
    } catch (error) {
      message.error('获取用户列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (values) => {
    try {
      setLoading(true);
      const response = await axios.put(
        `/api/admin/users/${selectedUser._id}/role`,
        { role: values.role }
      );

      if (response.data.success) {
        message.success('用户角色已更新');
        setRoleModalVisible(false);
        fetchUsers();
      }
    } catch (error) {
      message.error('更新失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId) => {
    try {
      setLoading(true);
      const response = await axios.patch(
        `/api/admin/users/${userId}/status`
      );

      if (response.data.success) {
        message.success(response.data.message);
        fetchUsers();
      }
    } catch (error) {
      message.error('操作失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      if (!newPassword) {
        message.error('新密码不能为空');
        return;
      }

      setLoading(true);
      const response = await axios.post(
        `/api/admin/users/${selectedUser._id}/reset-password`,
        { newPassword }
      );

      if (response.data.success) {
        message.success('用户密码已重置');
        setPasswordModalVisible(false);
        setNewPassword('');
        fetchUsers();
      }
    } catch (error) {
      message.error('重置密码失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        const colorMap = {
          admin: 'red',
          editor: 'orange',
          user: 'blue',
          guest: 'default',
        };
        const labelMap = {
          admin: '管理员',
          editor: '编辑者',
          user: '用户',
          guest: '访客',
        };
        return (
          <Tag color={colorMap[role]}>
            {labelMap[role] || role}
          </Tag>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'active',
      key: 'active',
      render: (active) => (
        <Tag color={active ? 'green' : 'red'}>
          {active ? '活跃' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '邮箱验证',
      dataIndex: 'isEmailVerified',
      key: 'isEmailVerified',
      render: (verified) => (
        <Tag color={verified ? 'green' : 'orange'}>
          {verified ? '已验证' : '未验证'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt) =>
        new Date(createdAt).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedUser(record);
              form.setFieldsValue({ role: record.role });
              setRoleModalVisible(true);
            }}
          >
            角色
          </Button>

          <Button
            type="text"
            size="small"
            icon={<LockOutlined />}
            onClick={() => {
              setSelectedUser(record);
              setPasswordModalVisible(true);
            }}
          >
            密码
          </Button>

          <Popconfirm
            title={record.active ? '禁用用户' : '启用用户'}
            description={`确定要${record.active ? '禁用' : '启用'}此用户吗?`}
            onConfirm={() => handleToggleStatus(record._id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              size="small"
              danger={record.active}
              icon={record.active ? <LockOutlined /> : <UnlockOutlined />}
            >
              {record.active ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="admin-user-management">
      <Card title="用户管理" loading={loading}>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="_id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize });
            },
          }}
          loading={loading}
        />
      </Card>

      {/* 角色修改模态框 */}
      <Modal
        title="修改用户角色"
        visible={roleModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setRoleModalVisible(false);
          setSelectedUser(null);
        }}
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleUpdateRole}
        >
          <Form.Item label="用户名">
            <Input value={selectedUser?.username} disabled />
          </Form.Item>

          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              options={[
                { label: '管理员', value: 'admin' },
                { label: '编辑者', value: 'editor' },
                { label: '用户', value: 'user' },
                { label: '访客', value: 'guest' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 密码重置模态框 */}
      <Modal
        title="重置用户密码"
        visible={passwordModalVisible}
        onOk={handleResetPassword}
        onCancel={() => {
          setPasswordModalVisible(false);
          setSelectedUser(null);
          setNewPassword('');
        }}
        confirmLoading={loading}
      >
        <Form layout="vertical">
          <Form.Item label="用户名">
            <Input value={selectedUser?.username} disabled />
          </Form.Item>

          <Form.Item label="新密码" required>
            <Input.Password
              placeholder="请输入新密码(至少6个字符)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminUserManagement;
