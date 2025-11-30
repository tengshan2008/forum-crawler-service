import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { List, Card, Image, Tag, Spin, Empty, Row, Col, Button, Space, Tabs } from 'antd';
import { postApi } from '../services/api';
import dayjs from 'dayjs';

const PostPreview = () => {
  const { taskId } = useParams();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 12, total: 0 });

  useEffect(() => {
    if (taskId) {
      fetchPosts();
    }
  }, [taskId, pagination.current, pagination.pageSize]);

  const getImageUrl = (media) => {
    // 如果有本地路径，需要根据环境添加正确的前缀
    if (media.url && media.url.startsWith('/public')) {
      // 在开发环境下，明确指向后端服务器
      // 在生产环境下，Nginx 会处理静态文件服务
      const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
      if (isDevelopment) {
        return `http://localhost:5000${media.url}`;
      }
      return media.url;
    }
    return media.url;
  };

  const fetchPosts = async () => {
    try {
      const response = await postApi.getByTaskId(taskId, {
        page: pagination.current,
        limit: pagination.pageSize,
      });
      
      if (response.data && response.data.data) {
        setPosts(response.data.data);
        setPagination({
          ...pagination,
          total: response.data.pagination?.total || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  if (!loading && (!posts || posts.length === 0)) {
    return <Empty description="暂无内容" />;
  }

  return (
    <Spin spinning={loading}>
      <div className="post-preview">
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
              <div style={{ marginBottom: 16, padding: '12px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                <p style={{ margin: 0, color: '#333' }}>
                  {post.content}
                </p>
              </div>
            )}

            {/* 图片网格区域 */}
            {post.media && post.media.length > 0 ? (
              <div>
                <h4 style={{ marginBottom: 12, color: '#666' }}>
                  媒体内容 ({post.media.length} 项)
                </h4>
                <Image.PreviewGroup>
                  <Row gutter={[12, 12]}>
                    {post.media.map((m, idx) => (
                      <Col key={idx} xs={12} sm={8} md={6} lg={4} xl={3}>
                        <div style={{ 
                          position: 'relative',
                          paddingBottom: '100%',
                          overflow: 'hidden',
                          borderRadius: '4px',
                          backgroundColor: '#f0f0f0'
                        }}>
                          <Image 
                            src={getImageUrl(m)}
                            alt={m.description || `图片 ${idx + 1}`}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                            preview={{
                              mask: `预览 ${idx + 1}`
                            }}
                          />
                        </div>
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
