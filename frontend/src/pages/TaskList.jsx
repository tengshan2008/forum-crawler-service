import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, message, Tooltip, Checkbox, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, PauseOutlined, EyeOutlined, StopOutlined, RedoOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';
import { useTasks } from '../hooks/useTasks';
import dayjs from 'dayjs';

const TaskList = () => {
  const {
    tasks, loading, pagination, setPagination, crawlTypeFilter, setCrawlTypeFilter,
    fetchTasks, deleteTask, startTask, pauseTask, cancelTask, retryTask,
  } = useTasks();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form] = Form.useForm();
  // 日志弹窗状态：SSE 实时推送（snapshot/log/progress/status），REST 仅作兜底
  const [logState, setLogState] = useState({
    open: false,
    loading: true,
    logs: [],
    exists: true,
    status: null,
    progress: null,
    live: false,
  });
  const eventSourceRef = useRef(null);
  const restFallbackRef = useRef(false);
  const logPreRef = useRef(null);
  const navigate = useNavigate();

  // 关闭 SSE 连接（关弹窗/卸载/终态时必须调用，避免连接泄漏与自动重连）
  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => closeEventSource, [closeEventSource]);

  // 日志追加时自动滚到底部
  useEffect(() => {
    const el = logPreRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logState.logs]);

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

  const handlePreview = (taskId) => {
    navigate(`/preview/${taskId}`);
  };

  // REST 兜底：SSE 不可用（旧后端/网络失败）时退回 /logs 接口
  const fetchLogsViaRest = useCallback(
    async (taskId) => {
      if (restFallbackRef.current) return;
      restFallbackRef.current = true;
      try {
        const response = await taskApi.logs(taskId, { lines: 200 });
        const { logs, exists } = response.data.data;
        setLogState((prev) => ({ ...prev, loading: false, live: false, logs, exists }));
      } catch (error) {
        console.error('Error fetching task logs:', error);
        setLogState((prev) => ({ ...prev, loading: false, live: false }));
      }
    },
    []
  );

  // 查看任务执行日志：SSE 实时流（快照 + 历史回放 + 实时推送），REST 兜底
  const handleViewLogs = useCallback(
    (taskId) => {
      closeEventSource();
      restFallbackRef.current = false;
      setLogState({ open: true, loading: true, logs: [], exists: true, status: null, progress: null, live: false });

      let es;
      try {
        es = new EventSource(taskApi.eventsUrl(taskId));
      } catch (err) {
        console.error('EventSource 初始化失败，回退 REST:', err);
        fetchLogsViaRest(taskId);
        return;
      }
      eventSourceRef.current = es;

      const appendLogLines = (lines) => {
        setLogState((prev) => ({ ...prev, logs: [...prev.logs, ...lines].slice(-500) }));
      };

      es.addEventListener('snapshot', (e) => {
        try {
          const d = JSON.parse(e.data);
          const terminal = d.status === 'completed' || d.status === 'failed';
          setLogState((prev) => ({
            ...prev,
            loading: false,
            live: d.status === 'running',
            exists: true,
            status: d.status,
            progress:
              d.status === 'completed'
                ? 100
                : typeof d.progress === 'number'
                  ? d.progress
                  : prev.progress,
          }));
          if (terminal) {
            // 任务已是终态：历史回放紧随其后（含终态事件时由 status 处理器幂等关闭）。
            // 历史已过期、不含终态事件时后端发完即关流——客户端必须主动 close()，
            // 否则浏览器按 EventSource 规范自动重连，终态任务会每 ~3s 无限重连。
            // 延迟关闭以保证回放的日志帧先到达；ref 校验避免关掉用户切换后的新连接。
            setTimeout(() => {
              if (eventSourceRef.current === es) closeEventSource();
            }, 1500);
            fetchTasks();
          }
        } catch {
          setLogState((prev) => ({ ...prev, loading: false }));
        }
      });

      es.addEventListener('log', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d && typeof d.line === 'string') appendLogLines([d.line]);
        } catch {
          /* 忽略坏帧 */
        }
      });

      es.addEventListener('progress', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (typeof d.progress === 'number') {
            setLogState((prev) => ({ ...prev, progress: d.progress }));
          }
        } catch {
          /* 忽略 */
        }
      });

      es.addEventListener('status', (e) => {
        try {
          const d = JSON.parse(e.data);
          const terminal = d.status === 'completed' || d.status === 'failed';
          setLogState((prev) => ({
            ...prev,
            status: d.status,
            live: false,
            progress: d.status === 'completed' ? 100 : prev.progress,
          }));
          if (terminal) {
            // 终态：服务端会关流，客户端也主动关闭防止自动重连
            closeEventSource();
            fetchTasks();
          }
        } catch {
          /* 忽略 */
        }
      });

      es.onerror = () => {
        // readyState=CLOSED 表示服务端关流或不可恢复错误；CONNECTING 是浏览器自动重连中
        if (es.readyState === EventSource.CLOSED) {
          setLogState((prev) => ({ ...prev, live: false }));
          fetchLogsViaRest(taskId);
        }
      };
    },
    [closeEventSource, fetchLogsViaRest, fetchTasks]
  );

  const handleCloseLogs = useCallback(() => {
    closeEventSource();
    setLogState((prev) => ({ ...prev, open: false }));
  }, [closeEventSource]);

  // 获取跳过原因的颜色
  const getReasonColor = (reason) => {
    const colors = {
      'duplicate': 'orange',
      'network_error': 'red',
      'parse_failed': 'volcano',
      'update_check_failed': 'gold',
      'other': 'default'
    };
    return colors[reason] || 'default';
  };

  // 获取跳过原因的描述
  const getReasonLabel = (reason) => {
    const labels = {
      'duplicate': '重复帖子',
      'network_error': '网络错误',
      'parse_failed': '解析失败',
      'update_check_failed': '更新检查失败',
      'other': '其他'
    };
    return labels[reason] || reason;
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
      title: '采集类型',
      dataIndex: 'crawlType',
      key: 'crawlType',
      render: (crawlType) => {
        const typeMap = {
          'single': '单帖采集',
          'batch': '批量采集'
        };
        return typeMap[crawlType] || crawlType;
      },
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
      title: '跳过/失败',
      dataIndex: 'skippedItems',
      key: 'skipped',
      render: (_, record) => (
        <Space size="small">
          {record.skippedItems > 0 && (
            <Tooltip title="重复或其他原因被跳过的帖子">
              <Tag color="orange">{record.skippedItems} 跳过</Tag>
            </Tooltip>
          )}
          {record.failedItems > 0 && (
            <Tooltip title="网络错误或解析失败的帖子">
              <Tag color="red">{record.failedItems} 失败</Tag>
            </Tooltip>
          )}
          {record.skippedItems === 0 && record.failedItems === 0 && (
            <span style={{ color: '#999' }}>无</span>
          )}
        </Space>
      ),
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
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => startTask(record._id)}>
              开始
            </Button>
          )}
          {record.status === 'running' && (
            <Button type="primary" danger size="small" icon={<PauseOutlined />} onClick={() => pauseTask(record._id)}>
              暂停
            </Button>
          )}
          {record.status === 'failed' && (
            <Button type="primary" size="small" icon={<RedoOutlined />} onClick={() => retryTask(record._id)}>
              重试
            </Button>
          )}
          <Button size="small" icon={<FileTextOutlined />} onClick={() => handleViewLogs(record._id)}>
            日志
          </Button>
          <Button type="primary" ghost size="small" icon={<EditOutlined />} onClick={() => handleEditTask(record)}>
            编辑
          </Button>
          <Button type="primary" ghost size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record._id)}>
            预览
          </Button>
          {record.status === 'pending' && (
            <Popconfirm title="确认取消该排队任务?" onConfirm={() => cancelTask(record._id)}>
              <Button type="primary" danger ghost size="small" icon={<StopOutlined />}>
                取消
              </Button>
            </Popconfirm>
          )}
          <Popconfirm title="确认删除?" onConfirm={() => deleteTask(record._id)}>
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
          <Select
            placeholder="采集类型"
            style={{ width: 150 }}
            allowClear
            value={crawlTypeFilter}
            onChange={(value) => {
              setCrawlTypeFilter(value);
              setPagination({ current: 1, pageSize: 10, total: 0 });
            }}
          >
            <Select.Option value="single">单帖采集</Select.Option>
            <Select.Option value="batch">批量采集</Select.Option>
          </Select>
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
        expandable={{
          expandedRowRender: (record) => {
            const hasSkipReasons = record.skipReasons && record.skipReasons.length > 0;
            
            return (
              <div style={{ padding: '16px 0' }}>
                {hasSkipReasons ? (
                  <div>
                    <h4 style={{ marginBottom: '12px' }}>
                      跳过/失败原因详情 ({record.skipReasons.length})
                    </h4>
                    <div style={{ 
                      maxHeight: '300px', 
                      overflowY: 'auto',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                      gap: '12px'
                    }}>
                      {record.skipReasons.map((reason, idx) => (
                        <div key={idx} style={{
                          padding: '12px',
                          border: '1px solid #f0f0f0',
                          borderRadius: '4px',
                          backgroundColor: '#fafafa'
                        }}>
                          <div style={{ marginBottom: '8px' }}>
                            <Tag color={getReasonColor(reason.reason)}>
                              {getReasonLabel(reason.reason)}
                            </Tag>
                            <span style={{ color: '#666', fontSize: '12px', marginLeft: '8px' }}>
                              {dayjs(reason.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                            </span>
                          </div>
                          <div style={{ color: '#666', fontSize: '12px', marginBottom: '8px' }}>
                            <strong>链接:</strong> {reason.url}
                          </div>
                          {reason.message && (
                            <div style={{ color: '#999', fontSize: '12px' }}>
                              <strong>说明:</strong> {reason.message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#999' }}>本次采集无跳过或失败的帖子</span>
                )}
              </div>
            );
          },
          rowExpandable: (record) => record.skipReasons && record.skipReasons.length > 0,
        }}
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

      {/* 任务执行日志：SSE 实时流（历史回放 + 实时推送），REST 兜底 */}
      <Modal
        title="任务执行日志"
        open={logState.open}
        onCancel={handleCloseLogs}
        footer={null}
        width={720}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          {logState.status && (
            <Tag color={statusColors[logState.status] || 'default'}>
              {({ pending: '等待中', running: '执行中', paused: '已暂停', completed: '已完成', failed: '失败' })[logState.status] || logState.status}
            </Tag>
          )}
          {typeof logState.progress === 'number' && (
            <span style={{ color: '#666' }}>进度 {logState.progress}%</span>
          )}
          {logState.live && <Tag color="processing">实时</Tag>}
        </div>
        {logState.loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>加载中...</div>
        ) : logState.logs.length > 0 ? (
          <pre
            ref={logPreRef}
            style={{
              maxHeight: '480px',
              overflowY: 'auto',
              background: '#0f172a',
              color: '#e2e8f0',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logState.logs.join('\n')}
          </pre>
        ) : (
          <span style={{ color: '#999' }}>
            {logState.status === 'running'
              ? '任务正在执行，等待日志输出…'
              : logState.exists === false
                ? '暂无日志（任务尚未执行，或任务在其它执行节点运行导致日志不可见）'
                : '暂无日志'}
          </span>
        )}
      </Modal>
    </div>
  );
};

export default TaskList;
