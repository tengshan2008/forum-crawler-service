import React, { useState, useEffect, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Image,
  Space,
  Button,
  Input,
  Select,
  DatePicker,
  Spin,
  Pagination,
  message,
  Empty,
  Tooltip,
  Modal,
  Avatar,
  Typography,
  Divider,
} from 'antd';
import {
  DownloadOutlined,
  ShareAltOutlined,
  HeartOutlined,
  HeartFilled,
  LeftOutlined,
  RightOutlined,
  EyeOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import Masonry from 'react-masonry-css';
import dayjs from 'dayjs';
import { browseApi } from '../services/api';
import './ImageBrowser.css';

const { RangePicker } = DatePicker;
const { Title, Text, Paragraph } = Typography;

const ImageBrowser = () => {
  const [imageGroups, setImageGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 12,
    total: 0,
  });
  const [filters, setFilters] = useState({
    taskId: '',
    keyword: '',
    dateRange: null,
  });
  const [favorites, setFavorites] = useState(new Set());
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  // 获取任务列表
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await browseApi.getNovels();
        setTasks(res.data.data || []);
      } catch (error) {
        message.error('获取任务列表失败');
      }
    };
    fetchTasks();
  }, []);

  // 获取图片分组列表
  const fetchImageGroups = useCallback(async (page = 1, pageSize = null) => {
    const size = pageSize || pagination.pageSize;
    setLoading(true);
    try {
      const res = await browseApi.getImageGroups({ page, limit: size, taskId: filters.taskId });
      setImageGroups(res.data.data || []);
      setPagination({
        current: res.data.pagination.page,
        pageSize: res.data.pagination.limit,
        total: res.data.pagination.total,
      });
    } catch (error) {
      message.error('获取图片分组失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, filters.taskId]);

  useEffect(() => {
    fetchImageGroups(1);
  }, [fetchImageGroups]);

  const handlePaginationChange = (page) => {
    fetchImageGroups(page, pagination.pageSize);
  };

  const handlePageSizeChange = (value) => {
    setPagination({ ...pagination, current: 1, pageSize: value });
    fetchImageGroups(1, value);
  };

  const handleTaskFilter = (value) => {
    setFilters({ ...filters, taskId: value });
  };

  const handleKeywordChange = (e) => {
    setFilters({ ...filters, keyword: e.target.value });
  };

  const handleDateRangeChange = (dates) => {
    setFilters({ ...filters, dateRange: dates });
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      // 这里可以实现搜索功能，目前先重置过滤器
      setFilters({ taskId: '', keyword: '', dateRange: null });
      fetchImageGroups(1);
    } catch (error) {
      message.error('搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewAllImages = (group) => {
    setSelectedGroup(group);
  };

  const handleBackToGroups = () => {
    setSelectedGroup(null);
  };

  const handleImageClick = (imageUrl, groupImages) => {
    const index = groupImages.findIndex(img => img.url === imageUrl);
    setPreviewImage(imageUrl);
    setPreviewIndex(index);
  };

  const handlePreviewNavigate = (direction) => {
    if (!selectedGroup) return;
    const newIndex = previewIndex + direction;
    if (newIndex >= 0 && newIndex < selectedGroup.allImages.length) {
      setPreviewIndex(newIndex);
      setPreviewImage(selectedGroup.allImages[newIndex].url);
    }
  };

  const handleDownload = (imageUrl) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = imageUrl.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = (imageUrl) => {
    const shareText = `来自论坛爬虫采集的图片：${imageUrl}`;
    if (navigator.share) {
      navigator.share({
        title: '分享图片',
        text: shareText,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(imageUrl);
      message.success('图片链接已复制到剪贴板');
    }
  };

  const handleFavorite = (imageId) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(imageId)) {
      newFavorites.delete(imageId);
    } else {
      newFavorites.add(imageId);
    }
    setFavorites(newFavorites);
  };

  // 瀑布流断点配置
  const masonryBreakpoints = {
    default: 4,
    1100: 3,
    700: 2,
    500: 1,
  };

  if (loading && imageGroups.length === 0) {
    return (
      <div className='image-browser-loading'>
        <Spin size='large' tip='加载中...' />
      </div>
    );
  }

  return (
    <div className='image-browser'>
      {/* 搜索和筛选区域 */}
      <Card className='filter-card'>
        <Space direction='vertical' style={{ width: '100%' }} size='middle'>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Input
                placeholder='搜索网页标题'
                value={filters.keyword}
                onChange={handleKeywordChange}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                placeholder='选择任务'
                style={{ width: '100%' }}
                value={filters.taskId}
                onChange={handleTaskFilter}
                allowClear
              >
                {tasks.map((task) => (
                  <Select.Option key={task._id} value={task._id}>
                    {task.name}
                  </Select.Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={12}>
              <RangePicker
                style={{ width: '100%' }}
                value={filters.dateRange}
                onChange={handleDateRangeChange}
                placeholder={['开始日期', '结束日期']}
              />
            </Col>
          </Row>
          <Row gutter={8}>
            <Col>
              <Button type='primary' onClick={handleSearch}>
                搜索
              </Button>
            </Col>
            <Col>
              <Button
                onClick={() => {
                  setFilters({ taskId: '', keyword: '', dateRange: null });
                  fetchImageGroups(1);
                }}
              >
                重置
              </Button>
            </Col>
            <Col>
              <span>
                共 {pagination.total} 个网页 | 第{' '}
                {pagination.current} 页
              </span>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* 返回按钮 */}
      {selectedGroup && (
        <div style={{ marginBottom: '16px' }}>
          <Button onClick={handleBackToGroups}>
            ← 返回网页列表
          </Button>
        </div>
      )}

      {/* 网页分组列表 */}
      {!selectedGroup && (
        <>
          {imageGroups.length === 0 ? (
            <Empty description='暂无图片网页' style={{ marginTop: '50px' }} />
          ) : (
            <div className='image-groups-grid'>
              {imageGroups.map((group) => (
                <Card
                  key={group._id}
                  hoverable
                  className='image-group-card'
                  onClick={() => handleViewAllImages(group)}
                >
                  <div className='group-header'>
                    <Title level={5} ellipsis={{ rows: 2 }}>
                      {group.title}
                    </Title>
                    <div className='group-meta'>
                      <Text type='secondary'>
                        作者: {group.author || '未知'} |
                        图片: {group.totalImages} 张 |
                        {dayjs(group.createdAt).format('YYYY-MM-DD')}
                      </Text>
                    </div>
                  </div>

                  <div className='preview-images'>
                    {group.previewImages.slice(0, 4).map((image, index) => (
                      <div key={index} className='preview-image-wrapper'>
                        <Image
                          src={image.url}
                          alt={`预览 ${index + 1}`}
                          preview={false}
                          className='preview-image'
                        />
                      </div>
                    ))}
                    {group.totalImages > 4 && (
                      <div className='more-images-overlay'>
                        <Text strong>+{group.totalImages - 4} 张</Text>
                      </div>
                    )}
                  </div>

                  <div className='group-actions'>
                    <Button type='primary' icon={<EyeOutlined />}>
                      查看全部 ({group.totalImages} 张)
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* 分页 */}
          <div className='pagination-wrapper'>
            <Pagination
              current={pagination.current}
              pageSize={pagination.pageSize}
              total={pagination.total}
              onChange={handlePaginationChange}
              showSizeChanger={false}
              showQuickJumper
              showTotal={(total) => `共 ${total} 个网页`}
            />
          </div>
        </>
      )}

      {/* 瀑布流图片展示 */}
      {selectedGroup && (
        <div className='masonry-container'>
          <div className='selected-group-header'>
            <Title level={4}>{selectedGroup.title}</Title>
            <Text type='secondary'>
              作者: {selectedGroup.author || '未知'} |
              共 {selectedGroup.totalImages} 张图片 |
              {dayjs(selectedGroup.createdAt).format('YYYY-MM-DD HH:mm')}
            </Text>
          </div>

          <Masonry
            breakpointCols={masonryBreakpoints}
            className='masonry-grid'
            columnClassName='masonry-column'
          >
            {selectedGroup.allImages.map((image, index) => (
              <div key={index} className='masonry-item'>
                <Card
                  hoverable
                  cover={
                    <div
                      className='masonry-image-cover'
                      onClick={() => handleImageClick(image.url, selectedGroup.allImages)}
                    >
                      <Image
                        src={image.url}
                        alt={`图片 ${index + 1}`}
                        preview={false}
                        style={{
                          width: '100%',
                          height: 'auto',
                          objectFit: 'cover',
                        }}
                      />
                    </div>
                  }
                  className='masonry-card'
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Button
                      type='text'
                      size='small'
                      icon={
                        favorites.has(`${selectedGroup._id}-${index}`) ? (
                          <HeartFilled style={{ color: 'red' }} />
                        ) : (
                          <HeartOutlined />
                        )
                      }
                      onClick={() => handleFavorite(`${selectedGroup._id}-${index}`)}
                    />
                    <Button
                      type='text'
                      size='small'
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownload(image.url)}
                    />
                    <Button
                      type='text'
                      size='small'
                      icon={<ShareAltOutlined />}
                      onClick={() => handleShare(image.url)}
                    />
                  </Space>
                </Card>
              </div>
            ))}
          </Masonry>
        </div>
      )}

      {/* 图片预览 modal */}
      <Modal
        visible={!!previewImage}
        footer={null}
        onCancel={() => setPreviewImage(null)}
        width='80%'
        centered
        bodyStyle={{ padding: 0, position: 'relative' }}
      >
        <div style={{ position: 'relative' }}>
          {selectedGroup && selectedGroup.allImages.length > 1 && (
            <>
              <Button
                type="text"
                icon={<LeftOutlined />}
                onClick={() => handlePreviewNavigate(-1)}
                disabled={previewIndex === 0}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                  background: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  border: 'none',
                }}
                size="large"
              />
              <Button
                type="text"
                icon={<RightOutlined />}
                onClick={() => handlePreviewNavigate(1)}
                disabled={previewIndex === selectedGroup.allImages.length - 1}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                  background: 'rgba(0,0,0,0.5)',
                  color: 'white',
                  border: 'none',
                }}
                size="large"
              />
            </>
          )}
          <div style={{ textAlign: 'center', padding: '10px', background: '#f5f5f5' }}>
            {selectedGroup && (
              <span>
                {previewIndex + 1} / {selectedGroup.allImages.length} - {selectedGroup.title}
              </span>
            )}
          </div>
          <Image
            src={previewImage}
            alt='预览'
            style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ImageBrowser;
