import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, message, Tooltip, Checkbox, InputNumber } from 'antd';
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

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await taskApi.getAll({
        page: pagination.current,
        limit: pagination.pageSize,
      });
      setTasks(response.data.data);
      if (response.data.pagination.total !== pagination.total) {
        setPagination((prev) => ({
          ...prev,
          total: response.data.pagination.total,
        }));
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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

  const handleDeleteTask = useCallback(async (id) => {
    try {
      await taskApi.delete(id);
      message.success('任务删除成功');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      message.error(error.response?.data?.message || '删除任务失败');
    }
  }, [fetchTasks]);

  const handleStartTask = useCallback(async (id) => {
    try {
      await taskApi.start(id);
      message.success('任务已启动');
      fetchTasks();
    } catch (error) {
      console.error('Error starting task:', error);
      message.error(error.response?.data?.message || '启动任务失败');
    }
  }, [fetchTasks]);

  const handlePauseTask = useCallback(async (id) => {
    try {
      await taskApi.pause(id);
      message.success('任务已暂停');
      fetchTasks();
    } catch (error) {
      console.error('Error pausing task:', error);
      message.error(error.response?.data?.message || '暂停任务失败');
    }
  }, [fetchTasks]);

  const handlePreview = (taskId) => {
    navigate(`/preview/${taskId}`);
  };

  const handleModalOk = useCallback(async () => {
    try {
      const values = await form.validateFields();
      console.log('Form values:', values);
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
      console.error('Error details:', JSON.stringify(error, null, 2));
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else if (error.errorFields && error.errorFields.length > 0) {
        // 显示具体的验证错误
        const firstError = error.errorFields[0];
        console.error('First error field:', firstError.name, 'Error:', firstError.errors);
        message.error(firstError.errors[0]);
      } else if (error.message) {
        message.error(error.message);
      } else {
        message.error('保存任务失败，请检查输入内容');
      }
    }
  }, [editingTask, fetchTasks, form]);


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
      render: (name) => {
        if (!name) return '-';
        
        // 如果任务名称较短（少于20个字符），直接显示
        if (name.length <= 20) {
          return name;
        }
        
        // 如果任务名称较长，使用Tooltip显示
        return (
          <Tooltip title={name} placement="topLeft">
            <span style={{ 
              display: 'inline-block', 
              maxWidth: '200px', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {name}
            </span>
          </Tooltip>
        );
      },
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
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form 
          form={form} 
          layout="vertical" 
          initialValues={{ 
            name: '', 
            description: '',
            crawlType: 'single',
            taskType: 'novel',
            schedule: { enabled: false }
          }}
        >
          <Form.Item label="任务名称（可选，留空时从网页标题自动获取）" name="name">
            <Input placeholder="若不填写，将使用爬取网页的标题作为任务名称" />
          </Form.Item>
          <Form.Item label="任务描述" name="description">
            <Input.TextArea placeholder="请输入任务描述" rows={3} />
          </Form.Item>
          <Form.Item label="采集类型" name="crawlType" rules={[{ required: true, message: '请选择采集类型' }]}>
            <Select placeholder="请选择采集类型">
              <Select.Option value="single">单帖采集</Select.Option>
              <Select.Option value="batch">批量采集</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item 
            label="论坛地址" 
            name="forumUrl"
            dependencies={['crawlType']}
            shouldUpdate={(prevValues, currentValues) => prevValues.crawlType !== currentValues.crawlType}
            rules={[
              ({
                getFieldValue,
                getFieldError,
              }) => ({
                required: getFieldValue('crawlType') === 'single',
                message: '单帖采集时请输入帖子地址',
              }),
            ]}
          >
            <Input placeholder="单帖采集时输入帖子地址，批量采集时可留空" />
          </Form.Item>
          <Form.Item 
            label="版块地址" 
            name="sectionUrl"
            dependencies={['crawlType']}
            shouldUpdate={(prevValues, currentValues) => prevValues.crawlType !== currentValues.crawlType}
            rules={[
              ({
                getFieldValue,
                getFieldError,
              }) => ({
                required: getFieldValue('crawlType') === 'batch',
                message: '批量采集时请输入版块地址',
              }),
            ]}
          >
            <Input placeholder="批量采集时输入版块地址，单帖采集时可留空" />
          </Form.Item>
          <Form.Item label="任务类型" name="taskType" rules={[{ required: true, message: '请选择任务类型' }]}>
            <Select placeholder="请选择任务类型">
              <Select.Option value="novel">小说</Select.Option>
              <Select.Option value="image">图片</Select.Option>
              <Select.Option value="mixed">混合</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="定时采集" name={['schedule', 'enabled']} valuePropName="checked">
            <Checkbox>启用定时采集</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => {
            return prevValues.schedule?.enabled !== currentValues.schedule?.enabled;
          }}>
            {({ getFieldValue }) => {
              const isEnabled = getFieldValue(['schedule', 'enabled']);
              return (
                <Form.Item 
                  label="采集间隔（小时）" 
                  name={['schedule', 'interval']} 
                  rules={[
                    {
                      required: isEnabled,
                      type: 'number', 
                      min: 1, 
                      message: '采集间隔至少为1小时'
                    }
                  ]}
                >
                  <InputNumber 
                  placeholder="请输入采集间隔（小时）" 
                  min={1} 
                  disabled={!isEnabled} 
                  style={{ width: '100%' }}
                />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item 
            label="最大爬取页数" 
            name={['config', 'maxPages']} 
            rules={[
              {
                type: 'number', 
                min: 1, 
                max: 100, 
                message: '最大爬取页数范围为1-100'
              }
            ]}
          >
            <InputNumber 
              placeholder="请输入最大爬取页数，默认10页" 
              min={1} 
              max={100} 
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskList;
