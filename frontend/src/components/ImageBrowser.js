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
} from 'antd';
import {
  DownloadOutlined,
  ShareAltOutlined,
  HeartOutlined,
  HeartFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { browseApi } from '../services/api';
import './ImageBrowser.css';

const { RangePicker } = DatePicker;

const ImageBrowser = () => {
  const [images, setImages] = useState([]);
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
  const [previewImage, setPreviewImage] = useState(null);

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

  // 获取图片列表
  const fetchImages = useCallback(async (page = 1, pageSize = null) => {
    const size = pageSize || pagination.pageSize;
    setLoading(true);
    try {
      const res = await browseApi.getImages({ page, limit: size, taskId: filters.taskId });
      setImages(res.data.data || []);
      setPagination({
        current: res.data.pagination.page,
        pageSize: res.data.pagination.limit,
        total: res.data.pagination.total,
      });
    } catch (error) {
      message.error('获取图片列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, filters.taskId]);

  // 搜索图片
  const handleSearch = async () => {
    setLoading(true);
    try {
      const searchData = { page: 1, limit: 12 };
      if (filters.keyword) searchData.keyword = filters.keyword;
      if (filters.taskId) searchData.taskId = filters.taskId;
      if (filters.dateRange && filters.dateRange.length === 2) {
        searchData.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        searchData.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }

      const res = await browseApi.searchImages(searchData);
      setImages(res.data.data || []);
      setPagination({
        current: 1,
        pageSize: res.data.pagination.limit,
        total: res.data.pagination.total,
      });
    } catch (error) {
      message.error('搜索图片失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages(1);
  }, [fetchImages]);

  const handlePaginationChange = (page) => {
    fetchImages(page, pagination.pageSize);
  };

  const handlePageSizeChange = (value) => {
    setPagination({ ...pagination, current: 1, pageSize: value });
    fetchImages(1, value);
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

  const handleDownload = (imageUrl) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = imageUrl.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const handleShare = (imageUrl) => {
    const shareText = `来自论坛爬虫采集的图片：${imageUrl}`;
    if (navigator.share) {
      navigator.share({
        title: '分享图片',
        text: shareText,
        url: window.location.href,
      });
    } else {
      // 降级方案：复制到剪贴板
      navigator.clipboard.writeText(imageUrl);
      message.success('图片链接已复制到剪贴板');
    }
  };

  if (loading && images.length === 0) {
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
                placeholder='搜索图片标题或作者'
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
                  fetchImages(1);
                }}
              >
                重置
              </Button>
            </Col>
            <Col>
              <span>
                共 {pagination.total} 张图片 | 第{' '}
                {pagination.current} 页
              </span>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* 图片网格 */}
      {images.length === 0 ? (
        <Empty description='暂无图片' style={{ marginTop: '50px' }} />
      ) : (
        <>
          <div className='image-grid' style={{ marginTop: '20px' }}>
            {images.map((image) => (
              <Card
                key={image._id}
                hoverable
                cover={
                  <div
                    className='image-cover'
                    onClick={() => setPreviewImage(image.url)}
                  >
                    <Image
                      src={image.url}
                      alt={image.postTitle}
                      preview={false}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                }
                className='image-card'
              >
                <Card.Meta
                  title={
                    <Tooltip title={image.postTitle}>
                      <div className='image-title'>
                        {image.postTitle}
                      </div>
                    </Tooltip>
                  }
                  description={
                    <div className='image-meta'>
                      <p>作者: {image.author || '未知'}</p>
                      <p>
                        时间:{' '}
                        {dayjs(image.createdAt).format(
                          'YYYY-MM-DD HH:mm'
                        )}
                      </p>
                    </div>
                  }
                />
                <Space style={{ width: '100%', marginTop: '10px' }}>
                  <Button
                    type='text'
                    size='small'
                    icon={
                      favorites.has(image._id) ? (
                        <HeartFilled style={{ color: 'red' }} />
                      ) : (
                        <HeartOutlined />
                      )
                    }
                    onClick={() => handleFavorite(image._id)}
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
            ))}
          </div>

          {/* 分页 */}
          <div className='pagination-wrapper' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#666' }}>每页显示:</span>
              <Select
                value={pagination.pageSize}
                onChange={handlePageSizeChange}
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
              onChange={handlePaginationChange}
              showSizeChanger={false}
              showQuickJumper
              showTotal={(total) => `共 ${total} 张图片`}
            />
          </div>
        </>
      )}

      {/* 图片预览 modal */}
      <Modal
        visible={!!previewImage}
        footer={null}
        onCancel={() => setPreviewImage(null)}
        width='75%'
        centered
      >
        <Image src={previewImage} alt='预览' style={{ width: '100%' }} />
      </Modal>
    </div>
  );
};

export default ImageBrowser;
