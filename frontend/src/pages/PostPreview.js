import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Image, Tag, Spin, Empty, Row, Col, Button, Space, Collapse, message, Tooltip, Pagination, Select } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, CopyOutlined } from '@ant-design/icons';
import { postApi } from '../services/api';
import dayjs from 'dayjs';

const PostPreview = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 12, total: 0 });
  const [contentPagination, setContentPagination] = useState({}); // 用于存储每篇文章的内容分页状态

  const fetchTaskInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      const result = await response.json();
      if (result.data) {
        setTask(result.data);
      }
    } catch (error) {
      console.error('Error fetching task info:', error);
    }
  }, [taskId]);

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

  const handleDownloadText = (post) => {
    try {
      // 构建文本内容
      let text = `标题: ${post.title}\n`;
      text += `作者: ${post.author || '匿名'}\n`;
      text += `发布时间: ${dayjs(post.createdAt).format('YYYY-MM-DD HH:mm:ss')}\n`;
      text += `原始链接: ${post.sourceUrl}\n`;
      text += '\n===============================================\n\n';
      text += post.content || '（暂无内容）';
      text += '\n\n===============================================\n';

      // 创建 Blob 对象
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${post.title}.txt`;

      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 释放 URL 对象
      URL.revokeObjectURL(url);

      message.success('文本已下载');
    } catch (error) {
      console.error('Download error:', error);
      message.error('下载失败');
    }
  };

  const handleCopyContent = (content) => {
    try {
      navigator.clipboard.writeText(content);
      message.success('内容已复制到剪贴板');
    } catch (error) {
      console.error('Copy error:', error);
      message.error('复制失败');
    }
  };

  // 获取内容分页信息
  const getContentPagination = (postId, content) => {
    if (!contentPagination[postId]) {
      const charsPerPage = 3000; // 每页显示 3000 个字符
      const totalPages = Math.ceil(content.length / charsPerPage);
      contentPagination[postId] = {
        currentPage: 1,
        totalPages,
        charsPerPage,
      };
    }
    return contentPagination[postId];
  };

  // 获取当前页的内容
  const getCurrentPageContent = (postId, content) => {
    const pag = getContentPagination(postId, content);
    const start = (pag.currentPage - 1) * pag.charsPerPage;
    const end = start + pag.charsPerPage;
    return content.substring(start, end);
  };

  // 更新内容页码
  const handleContentPageChange = (postId, newPage) => {
    setContentPagination({
      ...contentPagination,
      [postId]: {
        ...contentPagination[postId],
        currentPage: newPage,
      },
    });
  };

  const getImageUrl = (media) => {
    // 如果是本地路径（以 /public 开头）
    if (media.url && media.url.startsWith('/public')) {
      // 检查是否在浏览器中直接访问（非 Docker 环境）
      // 在本地开发时，前端在 3000 端口，后端在 5000 端口
      // 需要明确指向后端服务器
      const isLocalDevelopment = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === 'raspberrypi';

      if (isLocalDevelopment) {
        const backendHost = window.location.hostname === 'raspberrypi' ? 'raspberrypi' : 'localhost';
        const backendUrl = `http://${backendHost}:5000${media.url}`;
        console.log('[getImageUrl] Local image detected, using backend URL:', backendUrl);
        return backendUrl;
      }

      // 在生产环境（Docker/Nginx），使用相对路径或绝对路径
      // 如果 media.url 是绝对路径，直接使用
      if (media.url.startsWith('http://') || media.url.startsWith('https://')) {
        return media.url;
      }

      // 否则使用相对路径，通过 Nginx 代理访问
      return `/api${media.url}`;
    }

    // 远程 URL，直接返回
    return media.url;
  };

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await postApi.getByTaskId(taskId, {
        page: pagination.current,
        limit: pagination.pageSize,
      });

      if (response.data && response.data.data) {
        setPosts(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination?.total || 0,
        }));
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      setPosts([]);
      message.error('获取文章数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [taskId, pagination.current, pagination.pageSize]);

  // 当 taskId 或分页参数变化时重新获取数据
  useEffect(() => {
    if (taskId) {
      fetchTaskInfo();
      fetchPosts();
    }
  }, [taskId, fetchTaskInfo, fetchPosts]);

  if (!loading && (!posts || posts.length === 0)) {
    return (
      <div className="post-preview">
        <div style={{ marginBottom: 24 }}>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
          >
            返回任务列表
          </Button>
        </div>
        <Empty description="暂无内容" />
      </div>
    );
  }

  return (
    <Spin spinning={loading}>
      <div className="post-preview">
        <div style={{ marginBottom: 24 }}>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
          >
            返回任务列表
          </Button>
        </div>

        {/* 任务统计信息 */}
        {task && (
          <Card style={{ marginBottom: 24 }} title="采集统计">
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                    {task.crawledItems || 0}
                  </div>
                  <div style={{ color: '#666', marginTop: '8px' }}>已采集</div>
                </div>
              </Col>
              {task.skippedItems > 0 && (
                <Col xs={12} sm={6}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#faad14' }}>
                      {task.skippedItems}
                    </div>
                    <div style={{ color: '#666', marginTop: '8px' }}>
                      <Tooltip title="重复或其他原因被跳过">已跳过</Tooltip>
                    </div>
                  </div>
                </Col>
              )}
              {task.failedItems > 0 && (
                <Col xs={12} sm={6}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f5222d' }}>
                      {task.failedItems}
                    </div>
                    <div style={{ color: '#666', marginTop: '8px' }}>
                      <Tooltip title="网络错误或解析失败">采集失败</Tooltip>
                    </div>
                  </div>
                </Col>
              )}
              <Col xs={12} sm={6}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                    {task.status === 'completed' ? '✓' : task.status === 'running' ? '...' : task.status}
                  </div>
                  <div style={{ color: '#666', marginTop: '8px' }}>状态</div>
                </div>
              </Col>
            </Row>

            {/* 显示跳过原因摘要 */}
            {task.skipReasons && task.skipReasons.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>跳过原因统计:</div>
                <div>
                  {Object.entries(
                    task.skipReasons.reduce((acc, reason) => {
                      acc[reason.reason] = (acc[reason.reason] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([reason, count]) => (
                    <Tag key={reason} color={getReasonColor(reason)} style={{ marginRight: '8px', marginBottom: '8px' }}>
                      {getReasonLabel(reason)}: {count}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* 每页数量选择器和分页控件 */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#666' }}>每页显示:</span>
            <Select
              value={pagination.pageSize}
              onChange={(value) => {
                setPagination({ ...pagination, current: 1, pageSize: value });
              }}
              style={{ width: '120px' }}
              options={[
                { label: '6 个', value: 6 },
                { label: '12 个', value: 12 },
                { label: '24 个', value: 24 },
                { label: '48 个', value: 48 },
              ]}
            />
          </div>
          <Pagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={(page) => setPagination({ ...pagination, current: page })}
            showSizeChanger={false}
            showQuickJumper
            showTotal={(total) => `共 ${total} 条`}
          />
        </div>

        {posts.map((post) => (
          <Card
            key={post._id}
            style={{ marginBottom: 24 }}
            title={
              <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">
                {post.title}
              </a>
            }
            extra={
              <Space>
                <Tag>{post.postType}</Tag>
                <span>👤 {post.author || '匿名'}</span>
                <span>👍 {post.likes || 0}</span>
                <span>👁 {post.views || 0}</span>
              </Space>
            }
          >
            {/* 内容区域 */}
            {post.content && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, color: '#666' }}>文章内容</h4>
                  <Space>
                    <Button
                      type="primary"
                      ghost
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownloadText(post)}
                    >
                      下载
                    </Button>
                    <Button
                      type="primary"
                      ghost
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyContent(post.content)}
                    >
                      复制
                    </Button>
                  </Space>
                </div>
                <Collapse
                  items={[
                    {
                      key: '1',
                      label: `点击展开完整内容 (${post.content.length} 字)`,
                      children: (() => {
                        const pag = getContentPagination(post._id, post.content);
                        const currentContent = getCurrentPageContent(post._id, post.content);
                        return (
                          <div>
                            <div
                              style={{
                                maxHeight: '500px',
                                overflowY: 'auto',
                                padding: '12px',
                                backgroundColor: '#fafafa',
                                borderRadius: '4px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word',
                                lineHeight: 1.6,
                                marginBottom: 16,
                                fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                              }}
                            >
                              <pre style={{
                                margin: 0,
                                padding: 0,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                lineHeight: 'inherit'
                              }}>
                                {currentContent}
                              </pre>
                            </div>
                            {pag.totalPages > 1 && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                                <Button
                                  disabled={pag.currentPage === 1}
                                  onClick={() => handleContentPageChange(post._id, pag.currentPage - 1)}
                                >
                                  上一页
                                </Button>
                                <span style={{ padding: '4px 12px', lineHeight: '32px' }}>
                                  第 {pag.currentPage} / {pag.totalPages} 页
                                </span>
                                <Button
                                  disabled={pag.currentPage === pag.totalPages}
                                  onClick={() => handleContentPageChange(post._id, pag.currentPage + 1)}
                                >
                                  下一页
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })(),
                    },
                  ]}
                />
              </div>
            )}

            {/* 图片网格区域 */}
            {post.media && post.media.length > 0 ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, color: '#666' }}>
                    媒体内容 ({post.media.length} 项)
                  </h4>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    💡 点击图片预览，按 ⬅️ / ➡️ 键切换，ESC 关闭
                  </span>
                </div>
                <Image.PreviewGroup>
                  <Row gutter={[12, 12]}>
                    {post.media.map((m, idx) => (
                      <Col key={idx} xs={12} sm={8} md={6} lg={4} xl={3}>
                        <Image
                          src={getImageUrl(m)}
                          alt={m.description || `图片 ${idx + 1}`}
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block'
                          }}
                          preview={{
                            mask: `预览 ${idx + 1}`
                          }}
                          fallback={m.originalUrl}
                        />
                      </Col>
                    ))}
                  </Row>
                </Image.PreviewGroup>
              </div>
            ) : (
              <Empty
                description="暂无媒体内容"
                style={{ padding: '40px 0' }}
              />
            )}

            {/* 底部信息 */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#999' }}>
              发布于: {dayjs(post.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </div>
          </Card>
        ))}
      </div>
    </Spin>
  );
};

export default PostPreview;
