import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, PauseOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';
import dayjs from 'dayjs';

const TaskList = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  useEffect(() => {
    fetchTasks();
  }, [pagination.current, pagination.pageSize]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await taskApi.getAll({
        page: pagination.current,
        limit: pagination.pageSize,
      });
      setTasks(response.data.data);
      setPagination({
        ...pagination,
        total: response.data.pagination.total,
      });
    } catch (error) {
      console.error('Error fetching tasks:', error);
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = () => {
    setEditingTask(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    form.setFieldsValue(task);
    setIsModalVisible(true);
  };

  const handleDeleteTask = async (id) => {
    try {
      await taskApi.delete(id);
      message.success('任务删除成功');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      message.error(error.response?.data?.message || '删除任务失败');
    }
  };

  const handleStartTask = async (id) => {
    try {
      await taskApi.start(id);
      message.success('任务已启动');
      fetchTasks();
    } catch (error) {
      console.error('Error starting task:', error);
      message.error(error.response?.data?.message || '启动任务失败');
    }
  };

  const handlePauseTask = async (id) => {
    try {
      await taskApi.pause(id);
      message.success('任务已暂停');
      fetchTasks();
    } catch (error) {
      console.error('Error pausing task:', error);
      message.error(error.response?.data?.message || '暂停任务失败');
    }
  };

  const handlePreview = (taskId) => {
    navigate(`/preview/${taskId}`);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingTask) {
        await taskApi.update(editingTask._id, values);
        message.success('任务更新成功');
      } else {
        await taskApi.create(values);
        message.success('任务创建成功');
      }
      setIsModalVisible(false);
      fetchTasks();
    } catch (error) {
      console.error('Error saving task:', error);
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else if (error.message) {
        message.error(error.message);
      } else {
        message.error('保存任务失败，请检查输入内容');
      }
    }
  };

  const statusColors = {
    pending: 'default',
    running: 'processing',
    paused: 'warning',
    completed: 'success',
    failed: 'error',
  };

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '论坛地址',
      dataIndex: 'forumUrl',
      key: 'forumUrl',
      render: (url) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'taskType',
      key: 'taskType',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color={statusColors[status]}>{status}</Tag>,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress) => `${progress}%`,
    },
    {
      title: '爬取数量',
      dataIndex: 'crawledItems',
      key: 'crawledItems',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          {record.status === 'pending' && (
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleStartTask(record._id)}>
              开始
            </Button>
          )}
          {record.status === 'running' && (
            <Button type="primary" danger size="small" icon={<PauseOutlined />} onClick={() => handlePauseTask(record._id)}>
              暂停
            </Button>
          )}
          <Button type="primary" ghost size="small" icon={<EditOutlined />} onClick={() => handleEditTask(record)}>
            编辑
          </Button>
          <Button type="primary" ghost size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record._id)}>
            预览
          </Button>
          <Popconfirm title="确认删除?" onConfirm={() => handleDeleteTask(record._id)}>
            <Button type="primary" danger ghost size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="task-list">
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTask}>
            新建任务
          </Button>
          <Button icon={<PlayCircleOutlined rotate={90} />} onClick={fetchTasks}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={tasks}
        loading={loading}
        rowKey="_id"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        onChange={(pag) => setPagination({ ...pagination, current: pag.current, pageSize: pag.pageSize })}
      />

      <Modal
        title={editingTask ? '编辑任务' : '新建任务'}
        visible={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="任务名称（可选，留空时从网页标题自动获取）" name="name">
            <Input placeholder="若不填写，将使用爬取网页的标题作为任务名称" />
          </Form.Item>
          <Form.Item label="任务描述" name="description">
            <Input.TextArea placeholder="请输入任务描述" rows={3} />
          </Form.Item>
          <Form.Item label="论坛地址" name="forumUrl" rules={[{ required: true, message: '请输入论坛地址' }]}>
            <Input placeholder="请输入论坛地址" />
          </Form.Item>
          <Form.Item label="任务类型" name="taskType" rules={[{ required: true, message: '请选择任务类型' }]}>
            <Select placeholder="请选择任务类型">
              <Select.Option value="novel">小说</Select.Option>
              <Select.Option value="image">图片</Select.Option>
              <Select.Option value="mixed">混合</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskList;
