import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  message,
  Spin,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  LineChartOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [storageStats, setStorageStats] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 每30秒刷新一次
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statusRes, metricsRes, reportRes, storageRes] = await Promise.all([
        axios.get('/api/admin/monitor/status'),
        axios.get('/api/admin/monitor/history?timeRange=hour'),
        axios.get('/api/admin/monitor/report?timeRange=day'),
        axios.get('/api/admin/storage/stats'),
      ]);

      if (statusRes.data.success) {
        setStatus(statusRes.data.data);
      }
      if (metricsRes.data.success) {
        setMetrics(metricsRes.data.data);
      }
      if (reportRes.data.success) {
        setReport(reportRes.data.data);
      }
      if (storageRes.data.success) {
        setStorageStats(storageRes.data.data);
      }
    } catch (error) {
      message.error('获取数据失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/monitor/report?timeRange=day');
      if (response.data.success) {
        setReport(response.data.data);
        message.success('报告已生成');
      }
    } catch (error) {
      message.error('生成报告失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!status) {
    return <Spin />;
  }

  const alerts = status.alerts || [];
  const metrics_data = status.metrics || {};
  const crawler = metrics_data.crawler || {};
  const system = metrics_data.system || {};
  const database = metrics_data.database || {};

  const memoryPercentage = system.memoryUsage?.percentage || 0;
  const diskPercentage = system.diskUsage?.percentage || 0;
  const cpuUsage = system.cpuUsage || 0;

  // 准备图表数据
  const chartData = metrics.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString(),
    cpu: parseFloat((m.system.cpuUsage).toFixed(2)),
    memory: parseFloat((m.system.memoryUsage?.percentage || 0).toFixed(2)),
    requests: m.crawler.requestsPerSecond || 0,
    queryTime: m.database.queryTime || 0,
  }));

  const alertColumns = [
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity) => {
        const colorMap = {
          critical: 'red',
          high: 'orange',
          medium: 'gold',
          low: 'blue',
        };
        return <Tag color={colorMap[severity]}>{severity.toUpperCase()}</Tag>;
      },
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp) => new Date(timestamp).toLocaleString(),
    },
  ];

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1>系统监控仪表板</h1>
        <Space>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={fetchData}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={generateReport}
            loading={loading}
          >
            生成报告
          </Button>
        </Space>
      </div>

      {/* 告警信息 */}
      {alerts.length > 0 && (
        <Alert
          message={`有 ${alerts.length} 个告警`}
          description={alerts.map((a) => a.message).join(', ')}
          type="warning"
          style={{ marginBottom: 24 }}
          closable
        />
      )}

      {/* 关键指标 */}
      <Card title="关键指标" className="metrics-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="CPU使用率"
              value={cpuUsage}
              suffix="%"
              valueStyle={{
                color: cpuUsage > 80 ? '#ff4d4f' : '#1890ff',
              }}
            />
            <Progress percent={cpuUsage} status={cpuUsage > 80 ? 'exception' : 'normal'} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="内存使用率"
              value={memoryPercentage}
              suffix="%"
              valueStyle={{
                color: memoryPercentage > 85 ? '#ff4d4f' : '#1890ff',
              }}
            />
            <Progress percent={memoryPercentage} status={memoryPercentage > 85 ? 'exception' : 'normal'} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="磁盘使用率"
              value={diskPercentage}
              suffix="%"
              valueStyle={{
                color: diskPercentage > 90 ? '#ff4d4f' : '#1890ff',
              }}
            />
            <Progress percent={diskPercentage} status={diskPercentage > 90 ? 'exception' : 'normal'} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="活跃任务"
              value={crawler.activeTasks || 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
        </Row>
      </Card>

      {/* 爬虫统计 */}
      <Card title="爬虫统计" className="metrics-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="总请求数"
              value={crawler.totalRequests || 0}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="失败请求"
              value={crawler.failedRequests || 0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="平均响应时间"
              value={crawler.averageRequestTime || 0}
              suffix="ms"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="请求/秒"
              value={crawler.requestsPerSecond || 0}
              precision={2}
            />
          </Col>
        </Row>
      </Card>

      {/* 数据库指标 */}
      <Card title="数据库指标" className="metrics-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="操作/秒"
              value={database.operationsPerSecond || 0}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="活跃连接"
              value={database.connectionCount || 0}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="平均查询时间"
              value={database.queryTime || 0}
              suffix="ms"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="慢查询"
              value={database.slowQueries || 0}
              valueStyle={{ color: '#faad14' }}
            />
          </Col>
        </Row>
      </Card>

      {/* 存储统计 */}
      {storageStats && (
        <Card title="存储统计" className="metrics-card">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="媒体文件数"
                value={storageStats.mediaCount || 0}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="媒体大小"
                value={((storageStats.mediaSize || 0) / 1024 / 1024 / 1024).toFixed(2)}
                suffix="GB"
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="数据库大小"
                value={((storageStats.dbSize || 0) / 1024 / 1024).toFixed(2)}
                suffix="MB"
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="上次更新"
                value={storageStats.lastUpdated ? new Date(storageStats.lastUpdated).toLocaleString() : '未更新'}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* CPU和内存趋势图 */}
      {chartData.length > 0 && (
        <Card title="系统资源使用趋势(1小时)" className="chart-card">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cpu"
                stroke="#ff7a45"
                name="CPU使用率(%)"
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="memory"
                stroke="#1890ff"
                name="内存使用率(%)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* 请求和查询时间趋势图 */}
      {chartData.length > 0 && (
        <Card title="性能指标趋势" className="chart-card">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="requests"
                fill="#82ca9d"
                stroke="#82ca9d"
                name="请求/秒"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="queryTime"
                stroke="#ffc658"
                name="查询时间(ms)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* 告警列表 */}
      {alerts.length > 0 && (
        <Card title="告警列表" className="alerts-card">
          <Table
            columns={alertColumns}
            dataSource={alerts}
            rowKey={(record, index) => index}
            pagination={false}
          />
        </Card>
      )}

      {/* 性能报告 */}
      {report && (
        <Card title="日志性能报告" className="report-card">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="平均CPU使用率"
                value={report.summary.avgCpuUsage}
                suffix="%"
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="平均内存使用率"
                value={report.summary.avgMemoryUsage}
                suffix="%"
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="平均查询时间"
                value={report.summary.avgQueryTime}
                suffix="ms"
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic
                title="错误率"
                value={report.summary.errorRate}
                suffix="%"
              />
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
};

export default AdminDashboard;
