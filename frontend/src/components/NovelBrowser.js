import React, { useState, useEffect, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
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
  Drawer,
} from 'antd';
import {
  DownloadOutlined,
  ShareAltOutlined,
  HeartOutlined,
  HeartFilled,
  BookOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { browseApi } from '../services/api';
import NovelReader from './NovelReader';
import './NovelBrowser.css';

const { RangePicker } = DatePicker;

const NovelBrowser = () => {
  const [novels, setNovels] = useState([]);
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
    minWords: '',
    maxWords: '',
  });
  const [favorites, setFavorites] = useState(new Set());
  const [readerDrawerVisible, setReaderDrawerVisible] = useState(false);
  const [selectedNovel, setSelectedNovel] = useState(null);

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

  // 获取小说列表
  const fetchNovels = useCallback(async (page = 1, pageSize = null) => {
    const size = pageSize || pagination.pageSize;
    setLoading(true);
    try {
      const res = await browseApi.getNovels({ page, limit: size, taskId: filters.taskId });
      setNovels(res.data.data || []);
      setPagination({
        current: res.data.pagination.page,
        pageSize: res.data.pagination.limit,
        total: res.data.pagination.total,
      });
    } catch (error) {
      message.error('获取小说列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, filters.taskId]);

  // 搜索小说
  const handleSearch = async () => {
    setLoading(true);
    try {
      const searchData = { page: 1, limit: 20 };
      if (filters.keyword) searchData.keyword = filters.keyword;
      if (filters.taskId) searchData.taskId = filters.taskId;
      if (filters.dateRange && filters.dateRange.length === 2) {
        searchData.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        searchData.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      if (filters.minWords) searchData.minWords = filters.minWords;
      if (filters.maxWords) searchData.maxWords = filters.maxWords;

      const res = await browseApi.searchNovels(searchData);
      setNovels(res.data.data || []);
      setPagination({
        current: 1,
        pageSize: res.data.pagination.limit,
        total: res.data.pagination.total,
      });
    } catch (error) {
      message.error('搜索小说失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNovels(1);
  }, [fetchNovels]);

  const handlePaginationChange = (page) => {
    fetchNovels(page, pagination.pageSize);
  };

  const handlePageSizeChange = (value) => {
    setPagination({ ...pagination, current: 1, pageSize: value });
    fetchNovels(1, value);
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

  const handleWordRangeChange = (type, value) => {
    setFilters({ ...filters, [type]: value });
  };

  const handleFavorite = (novelId) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(novelId)) {
      newFavorites.delete(novelId);
    } else {
      newFavorites.add(novelId);
    }
    setFavorites(newFavorites);
  };

  const handleShare = (novel) => {
    const shareText = `分享小说：${novel.title} 作者：${novel.author || '未知'} 字数：${novel.wordCount}`;
    if (navigator.share) {
      navigator.share({
        title: novel.title,
        text: shareText,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(shareText);
      message.success('分享信息已复制到剪贴板');
    }
  };

  const handleRead = (novel) => {
    setSelectedNovel(novel);
    setReaderDrawerVisible(true);
  };

  const handleExport = (novel) => {
    // 简单实现：导出为 TXT
    const element = document.createElement('a');
    const file = new Blob([novel.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${novel.title}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (loading && novels.length === 0) {
    return (
      <div className='novel-browser-loading'>
        <Spin size='large' tip='加载中...' />
      </div>
    );
  }

  return (
    <div className='novel-browser'>
      {/* 搜索和筛选区域 */}
      <Card className='filter-card'>
        <Space direction='vertical' style={{ width: '100%' }} size='middle'>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Input
                placeholder='搜索小说标题或作者'
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
            <Col xs={24} sm={12} md={6}>
              <Input
                type='number'
                placeholder='最少字数'
                value={filters.minWords}
                onChange={(e) =>
                  handleWordRangeChange('minWords', e.target.value)
                }
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Input
                type='number'
                placeholder='最多字数'
                value={filters.maxWords}
                onChange={(e) =>
                  handleWordRangeChange('maxWords', e.target.value)
                }
              />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={12}>
              <RangePicker
                style={{ width: '100%' }}
                value={filters.dateRange}
                onChange={handleDateRangeChange}
                placeholder={['开始日期', '结束日期']}
              />
            </Col>
            <Col xs={24} sm={12} md={12}>
              <Space>
                <Button type='primary' onClick={handleSearch}>
                  搜索
                </Button>
                <Button
                  onClick={() => {
                    setFilters({
                      taskId: '',
                      keyword: '',
                      dateRange: null,
                      minWords: '',
                      maxWords: '',
                    });
                    fetchNovels(1);
                  }}
                >
                  重置
                </Button>
                <span>
                  共 {pagination.total} 部 | 第{' '}
                  {pagination.current} 页
                </span>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* 小说列表 */}
      {novels.length === 0 ? (
        <Empty description='暂无小说' style={{ marginTop: '50px' }} />
      ) : (
        <>
          <div className='novels-list' style={{ marginTop: '20px' }}>
            {novels.map((novel) => (
              <Card
                key={novel._id}
                className='novel-card'
                style={{ marginBottom: '16px' }}
              >
                <Row gutter={16} align='middle'>
                  <Col xs={24} sm={18} md={20}>
                    <Card.Meta
                      title={
                        <Tooltip title={novel.title}>
                          <div className='novel-title'>
                            {novel.title}
                          </div>
                        </Tooltip>
                      }
                      description={
                        <div className='novel-meta'>
                          <Space split='|'>
                            <span>作者: {novel.author || '未知'}</span>
                            <span>
                              字数:{' '}
                              {novel.wordCount?.toLocaleString() || 0}
                            </span>
                            <span>
                              浏览: {novel.views || 0}
                            </span>
                            <span>
                              时间:{' '}
                              {dayjs(novel.createdAt).format(
                                'YYYY-MM-DD'
                              )}
                            </span>
                          </Space>
                          <p className='novel-excerpt'>
                            {novel.excerpt || '暂无摘要'}
                          </p>
                        </div>
                      }
                    />
                  </Col>
                  <Col xs={24} sm={6} md={4}>
                    <Space direction='vertical' style={{ width: '100%' }}>
                      <Button
                        type='primary'
                        block
                        size='small'
                        icon={<BookOutlined />}
                        onClick={() => handleRead(novel)}
                      >
                        阅读
                      </Button>
                      <Button
                        block
                        size='small'
                        icon={<DownloadOutlined />}
                        onClick={() => handleExport(novel)}
                      >
                        导出
                      </Button>
                      <Space style={{ width: '100%', justifyContent: 'center' }}>
                        <Tooltip title='收藏'>
                          <Button
                            type='text'
                            size='small'
                            icon={
                              favorites.has(novel._id) ? (
                                <HeartFilled style={{ color: 'red' }} />
                              ) : (
                                <HeartOutlined />
                              )
                            }
                            onClick={() => handleFavorite(novel._id)}
                          />
                        </Tooltip>
                        <Tooltip title='分享'>
                          <Button
                            type='text'
                            size='small'
                            icon={<ShareAltOutlined />}
                            onClick={() => handleShare(novel)}
                          />
                        </Tooltip>
                      </Space>
                    </Space>
                  </Col>
                </Row>
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
              showTotal={(total) => `共 ${total} 部小说`}
            />
          </div>
        </>
      )}

      {/* 阅读器 Drawer */}
      <Drawer
        title={
          selectedNovel ? (
            <div>
              <div>{selectedNovel.title}</div>
              <div style={{ fontSize: '12px', color: '#999' }}>
                作者：{selectedNovel.author || '未知'}
              </div>
            </div>
          ) : null
        }
        placement='right'
        onClose={() => setReaderDrawerVisible(false)}
        open={readerDrawerVisible}
        width='80%'
        bodyStyle={{ padding: 0 }}
      >
        {selectedNovel && <NovelReader novel={selectedNovel} />}
      </Drawer>
    </div>
  );
};

export default NovelBrowser;
