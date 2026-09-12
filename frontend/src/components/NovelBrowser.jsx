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
  DeleteOutlined,
} from '@ant-design/icons';
import { Modal } from 'antd';
import dayjs from 'dayjs';
import { browseApi, taskApi } from '../services/api';
import NovelReader from './NovelReader';
import CollectionPickerModal from './CollectionPickerModal';
import './NovelBrowser.css';

const { RangePicker } = DatePicker;

const NovelBrowser = ({ filtersVisible = true }) => {
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
  // 收藏夹数据与「收藏」弹窗目标内容（Post 级收藏）
  const [collections, setCollections] = useState([]);
  const [pickerNovel, setPickerNovel] = useState(null);
  const [readerDrawerVisible, setReaderDrawerVisible] = useState(false);
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);

  // 获取任务列表（任务筛选项，误用小说接口会导致下拉空白：返回项没有 name 字段）
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await taskApi.getAll({ page: 1, limit: 100 });
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

  // 收藏夹数据（items 为 postId 集合），一次请求即可推导小说的已收藏状态
  const fetchCollections = useCallback(async () => {
    try {
      const res = await browseApi.getCollections({ page: 1, limit: 100 });
      setCollections(res.data.data || []);
    } catch (error) {
      // 收藏夹加载失败不阻塞浏览主流程
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // 已收藏 Post 集合（心形点亮依据）
  const favoritedNovelIds = new Set(
    collections.flatMap((c) => (c.items || []).map(String))
  );

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

  const handleRead = async (novel) => {
    setReaderLoading(true);
    setReaderDrawerVisible(true);
    try {
      // 先获取完整的小说内容
      const res = await browseApi.getNovelContent(novel._id);
      if (res.data && res.data.data) {
        setSelectedNovel(res.data.data);
      } else {
        message.error('获取小说内容失败');
        setReaderDrawerVisible(false);
      }
    } catch (error) {
      console.error('获取小说内容失败:', error);
      message.error('获取小说内容失败');
      setReaderDrawerVisible(false);
    } finally {
      setReaderLoading(false);
    }
  };

  const handleExport = async (novel) => {
    try {
      message.loading({ content: '正在获取小说内容...', key: 'export' });
      // 先获取完整的小说内容
      const res = await browseApi.getNovelContent(novel._id);
      if (res.data && res.data.data && res.data.data.content) {
        const fullNovel = res.data.data;
        const element = document.createElement('a');
        const file = new Blob([fullNovel.content], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${fullNovel.title}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        message.success({ content: '导出成功', key: 'export' });
      } else {
        message.error({ content: '获取小说内容失败', key: 'export' });
      }
    } catch (error) {
      console.error('导出失败:', error);
      message.error({ content: '导出失败', key: 'export' });
    }
  };

  const handleDelete = (novel) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除小说《${novel.title}》吗？此操作不可撤销。`,
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          message.loading({ content: '正在删除小说...', key: 'delete' });
          await browseApi.deleteNovel(novel._id);
          message.success({ content: '小说已删除', key: 'delete' });
          // 刷新列表
          fetchNovels(pagination.current, pagination.pageSize);
        } catch (error) {
          console.error('删除小说失败:', error);
          message.error({ content: '删除小说失败', key: 'delete' });
        }
      },
    });
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
      {/* 搜索和筛选区域（由 BrowsePage 右上角「筛选」按钮统一折叠/展开） */}
      {filtersVisible && (
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
      )}

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
                        <Tooltip
                          title={
                            favoritedNovelIds.has(String(novel._id))
                              ? '已收藏，点击管理'
                              : '收藏'
                          }
                        >
                          <Button
                            type='text'
                            size='small'
                            icon={
                              favoritedNovelIds.has(String(novel._id)) ? (
                                <HeartFilled style={{ color: '#eb2f96' }} />
                              ) : (
                                <HeartOutlined />
                              )
                            }
                            onClick={() => setPickerNovel(novel)}
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
                        <Tooltip title='删除'>
                          <Button
                            type='text'
                            size='small'
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDelete(novel)}
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
          ) : '加载中...'
        }
        placement='right'
        onClose={() => {
          setReaderDrawerVisible(false);
          setSelectedNovel(null);
        }}
        open={readerDrawerVisible}
        width='80%'
        bodyStyle={{ padding: 0 }}
      >
        {readerLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
            <Spin size='large' tip='正在加载小说内容...' />
          </div>
        ) : selectedNovel ? (
          <NovelReader novel={selectedNovel} />
        ) : null}
      </Drawer>
      <CollectionPickerModal
        open={!!pickerNovel}
        post={pickerNovel}
        collections={collections}
        onClose={() => setPickerNovel(null)}
        onChanged={fetchCollections}
      />
    </div>
  );
};

export default NovelBrowser;
