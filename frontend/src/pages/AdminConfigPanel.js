import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Button,
  Input,
  InputNumber,
  Select,
  Switch,
  Tabs,
  Table,
  Modal,
  message,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import './AdminConfigPanel.css';

const AdminConfigPanel = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [proxyModalVisible, setProxyModalVisible] = useState(false);
  const [newProxy, setNewProxy] = useState({ url: '', description: '' });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/config');
      if (response.data.success) {
        setConfig(response.data.data);
        form.setFieldsValue(response.data.data);
      }
    } catch (error) {
      message.error('获取配置失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateCrawlerConfig = async (values) => {
    try {
      setLoading(true);
      const response = await axios.put('/api/admin/config/crawler', values);
      if (response.data.success) {
        message.success('爬虫配置已更新');
        fetchConfig();
      }
    } catch (error) {
      message.error('更新失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateStorageConfig = async (values) => {
    try {
      setLoading(true);
      const response = await axios.put('/api/admin/config/storage', values);
      if (response.data.success) {
        message.success('存储配置已更新');
        fetchConfig();
      }
    } catch (error) {
      message.error('更新失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateMonitoringConfig = async (values) => {
    try {
      setLoading(true);
      const response = await axios.put(
        '/api/admin/config/monitoring',
        values
      );
      if (response.data.success) {
        message.success('监控配置已更新');
        fetchConfig();
      }
    } catch (error) {
      message.error('更新失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSystemConfig = async (values) => {
    try {
      setLoading(true);
      const response = await axios.put('/api/admin/config/system', values);
      if (response.data.success) {
        message.success('系统设置已更新');
        fetchConfig();
      }
    } catch (error) {
      message.error('更新失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProxy = async () => {
    try {
      if (!newProxy.url) {
        message.error('代理URL不能为空');
        return;
      }

      const response = await axios.post('/api/admin/config/proxies', newProxy);
      if (response.data.success) {
        message.success('代理已添加');
        setNewProxy({ url: '', description: '' });
        setProxyModalVisible(false);
        fetchConfig();
      }
    } catch (error) {
      message.error('添加失败: ' + error.message);
    }
  };

  const handleRemoveProxy = async (proxyUrl) => {
    try {
      const response = await axios.delete(`/api/admin/config/proxies/${proxyUrl}`);
      if (response.data.success) {
        message.success('代理已删除');
        fetchConfig();
      }
    } catch (error) {
      message.error('删除失败: ' + error.message);
    }
  };

  const proxyColumns = [
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
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
      title: '失败次数',
      dataIndex: 'failureCount',
      key: 'failureCount',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Tooltip title="删除">
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveProxy(record.url)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (!config) {
    return <div>加载中...</div>;
  }

  return (
    <div className="admin-config-panel">
      <Tabs
        defaultActiveKey="crawler"
        items={[
          {
            key: 'crawler',
            label: '爬虫配置',
            children: (
              <Card>
                <Tabs
                  defaultActiveKey="basic"
                  items={[
                    {
                      key: 'basic',
                      label: '基本设置',
                      children: (
                        <Form
                          layout="vertical"
                          onFinish={updateCrawlerConfig}
                          initialValues={config?.crawler}
                        >
                          <Form.Item
                            name={['rateLimit', 'enabled']}
                            label="启用请求限流"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Form.Item
                            name={['rateLimit', 'globalLimit']}
                            label="全局请求限制(请求/分钟)"
                          >
                            <InputNumber min={1} />
                          </Form.Item>

                          <Form.Item
                            name={['rateLimit', 'ipLimit']}
                            label="每IP请求限制(请求/分钟)"
                          >
                            <InputNumber min={1} />
                          </Form.Item>

                          <Form.Item
                            name={['rateLimit', 'adaptiveDelay']}
                            label="启用自适应延迟"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Form.Item
                            name={['rateLimit', 'minDelay']}
                            label="最小延迟(ms)"
                          >
                            <InputNumber min={0} />
                          </Form.Item>

                          <Form.Item
                            name={['rateLimit', 'maxDelay']}
                            label="最大延迟(ms)"
                          >
                            <InputNumber min={0} />
                          </Form.Item>

                          <Form.Item
                            name="timeout"
                            label="请求超时(ms)"
                          >
                            <InputNumber min={1000} />
                          </Form.Item>

                          <Form.Item
                            name="retryAttempts"
                            label="重试次数"
                          >
                            <InputNumber min={0} />
                          </Form.Item>

                          <Form.Item
                            name="maxConcurrentRequests"
                            label="最大并发请求数"
                          >
                            <InputNumber min={1} />
                          </Form.Item>

                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                          >
                            保存设置
                          </Button>
                        </Form>
                      ),
                    },
                    {
                      key: 'proxy',
                      label: '代理管理',
                      children: (
                        <div>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setProxyModalVisible(true)}
                            style={{ marginBottom: 16 }}
                          >
                            添加代理
                          </Button>

                          <Table
                            columns={proxyColumns}
                            dataSource={config?.crawler?.proxy?.proxyList || []}
                            rowKey="url"
                            pagination={false}
                          />

                          <Modal
                            title="添加代理IP"
                            visible={proxyModalVisible}
                            onOk={handleAddProxy}
                            onCancel={() => setProxyModalVisible(false)}
                          >
                            <Form layout="vertical">
                              <Form.Item label="代理URL">
                                <Input
                                  placeholder="http://proxy.example.com:8080"
                                  value={newProxy.url}
                                  onChange={(e) =>
                                    setNewProxy({
                                      ...newProxy,
                                      url: e.target.value,
                                    })
                                  }
                                />
                              </Form.Item>

                              <Form.Item label="描述">
                                <Input
                                  placeholder="代理描述(可选)"
                                  value={newProxy.description}
                                  onChange={(e) =>
                                    setNewProxy({
                                      ...newProxy,
                                      description: e.target.value,
                                    })
                                  }
                                />
                              </Form.Item>
                            </Form>
                          </Modal>
                        </div>
                      ),
                    },
                    {
                      key: 'userAgent',
                      label: 'User-Agent管理',
                      children: (
                        <Form
                          layout="vertical"
                          onFinish={updateCrawlerConfig}
                          initialValues={config?.crawler?.userAgent}
                        >
                          <Form.Item
                            name={['userAgent', 'enabled']}
                            label="启用User-Agent轮换"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Form.Item
                            name={['userAgent', 'useDefault']}
                            label="使用默认User-Agent列表"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                          >
                            保存设置
                          </Button>
                        </Form>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'storage',
            label: '存储管理',
            children: (
              <Card>
                <Tabs
                  defaultActiveKey="local"
                  items={[
                    {
                      key: 'local',
                      label: '本地存储',
                      children: (
                        <Form
                          layout="vertical"
                          onFinish={updateStorageConfig}
                          initialValues={config?.storage?.local}
                        >
                          <Form.Item
                            name="enabled"
                            label="启用本地存储"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Form.Item name="basePath" label="存储路径">
                            <Input />
                          </Form.Item>

                          <Form.Item name="maxSize" label="最大大小(字节)">
                            <InputNumber min={0} />
                          </Form.Item>

                          <Form.Item
                            name={['autoClean', 'enabled']}
                            label="启用自动清理"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Form.Item
                            name={['autoClean', 'retentionDays']}
                            label="保留天数"
                          >
                            <InputNumber min={1} />
                          </Form.Item>

                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                          >
                            保存设置
                          </Button>
                        </Form>
                      ),
                    },
                    {
                      key: 'cloud',
                      label: '云存储',
                      children: (
                        <Form
                          layout="vertical"
                          onFinish={updateStorageConfig}
                          initialValues={config?.storage?.cloud}
                        >
                          <Form.Item
                            name="enabled"
                            label="启用云存储"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Form.Item name="provider" label="存储提供商">
                            <Select
                              options={[
                                { label: 'AWS S3', value: 's3' },
                                { label: '阿里云OSS', value: 'oss' },
                                { label: '腾讯云COS', value: 'cos' },
                              ]}
                            />
                          </Form.Item>

                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                          >
                            保存设置
                          </Button>
                        </Form>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'monitoring',
            label: '监控配置',
            children: (
              <Card>
                <Form
                  layout="vertical"
                  onFinish={updateMonitoringConfig}
                  initialValues={config?.monitoring}
                >
                  <Form.Item
                    name={['performance', 'enabled']}
                    label="启用性能监控"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    name={['performance', 'collectionInterval']}
                    label="收集间隔(ms)"
                  >
                    <InputNumber min={5000} />
                  </Form.Item>

                  <Form.Item
                    name={['errorMonitoring', 'enabled']}
                    label="启用错误监控"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    name={['errorMonitoring', 'alertThreshold']}
                    label="告警阈值(错误次数)"
                  >
                    <InputNumber min={1} />
                  </Form.Item>

                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                  >
                    保存设置
                  </Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'system',
            label: '系统设置',
            children: (
              <Card>
                <Form
                  layout="vertical"
                  onFinish={updateSystemConfig}
                  initialValues={config?.system}
                >
                  <Form.Item
                    name={['logging', 'level']}
                    label="日志级别"
                  >
                    <Select
                      options={[
                        { label: 'Error', value: 'error' },
                        { label: 'Warn', value: 'warn' },
                        { label: 'Info', value: 'info' },
                        { label: 'Debug', value: 'debug' },
                      ]}
                    />
                  </Form.Item>

                  <Form.Item
                    name={['logging', 'retention']}
                    label="日志保留天数"
                  >
                    <InputNumber min={1} />
                  </Form.Item>

                  <Form.Item name="timezone" label="时区">
                    <Input />
                  </Form.Item>

                  <Form.Item name="theme" label="主题">
                    <Select
                      options={[
                        { label: '亮色', value: 'light' },
                        { label: '暗色', value: 'dark' },
                      ]}
                    />
                  </Form.Item>

                  <Form.Item
                    name={['maintenance', 'enabled']}
                    label="启用维护模式"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    name={['maintenance', 'message']}
                    label="维护消息"
                  >
                    <Input.TextArea rows={3} />
                  </Form.Item>

                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                  >
                    保存设置
                  </Button>
                </Form>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default AdminConfigPanel;
