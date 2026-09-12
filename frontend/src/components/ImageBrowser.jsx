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
  Modal,
  Tooltip,
  Typography,
} from 'antd';
import {
  DownloadOutlined,
  ShareAltOutlined,
  LeftOutlined,
  RightOutlined,
  EyeOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import Masonry from 'react-masonry-css';
import dayjs from 'dayjs';
import { browseApi, taskApi } from '../services/api';
import './ImageBrowser.css';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const DEFAULT_FILTERS = { taskId: '', keyword: '', dateRange: null };

const ImageBrowser = ({ filtersVisible = true }) => {
  const [imageGroups, setImageGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 12,
    total: 0,
  });
  // filters 为输入草稿，appliedFilters 为已提交条件（请求参数的唯一事实来源）；
  // 草稿仅在点击「搜索」/回车后提交，避免逐键请求与多入口状态漂移
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [favorites, setFavorites] = useState(new Set());
  const [selectedGroup, setSelectedGroup] = useState(null);
  // 详情数据按需加载：列表仅返回 4 张预览，进入详情后拉全量并增量渲染
  const [detailLoading, setDetailLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(DETAIL_PAGE_SIZE);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [fullViewMode, setFullViewMode] = useState(false);

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

  // 统一构参层：搜索、翻页、删除后刷新都从 appliedFilters 派生同一套请求参数
  const buildQueryParams = useCallback(
    (page, size) => {
      const params = { page, limit: size, taskId: appliedFilters.taskId || undefined };
      const keyword = (appliedFilters.keyword || '').trim();
      if (keyword) {
        params.keyword = keyword;
      }
      if (appliedFilters.dateRange && appliedFilters.dateRange.length === 2) {
        params.startDate = appliedFilters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = appliedFilters.dateRange[1].format('YYYY-MM-DD');
      }
      return params;
    },
    [appliedFilters]
  );

  // 获取图片分组列表
  const fetchImageGroups = useCallback(async (page = 1, pageSize = null) => {
    const size = pageSize || pagination.pageSize;
    setLoading(true);
    try {
      const res = await browseApi.getImageGroups(buildQueryParams(page, size));
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
  }, [pagination.pageSize, buildQueryParams]);

  // 首次加载及已应用筛选变化时回到第 1 页拉取（翻页由 handlePaginationChange 单独触发）
  useEffect(() => {
    fetchImageGroups(1);
  }, [fetchImageGroups]);

  const handlePaginationChange = (page) => {
    fetchImageGroups(page, pagination.pageSize);
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

  // 提交草稿筛选条件；实际请求由 appliedFilters 变化触发的 effect 统一发出
  const handleSearch = () => {
    setAppliedFilters({ ...filters });
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  // 拉取单组全量图片（列表数据只有预览，详情需单独请求）
  const loadGroupDetail = useCallback(async (postId) => {
    setDetailLoading(true);
    try {
      const res = await browseApi.getImageGroupDetail(postId);
      setSelectedGroup(res.data.data);
    } catch (error) {
      message.error('获取图片详情失败');
      setSelectedGroup(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleViewAllImages = (group) => {
    // 先用列表元数据占位（全量图片为空触发 Spin），请求成功后整体替换
    setSelectedGroup({ ...group, allImages: [] });
    setVisibleCount(DETAIL_PAGE_SIZE);
    loadGroupDetail(group._id);
  };

  const handleBackToGroups = () => {
    setSelectedGroup(null);
  };

  const handleImageClick = (imageUrl, groupImages) => {
    // 如果当前已经在预览同一张图片，则切换到全图模式
    if (previewImage === imageUrl) {
      setFullViewMode(!fullViewMode);
    } else {
      // 否则进入裁剪预览模式
      const index = groupImages.findIndex(img => img.url === imageUrl);
      setPreviewImage(imageUrl);
      setPreviewIndex(index);
      setFullViewMode(false);
    }
  };

  const handlePreviewNavigate = useCallback((direction) => {
    setPreviewIndex(prevIndex => {
      const newIndex = prevIndex + direction;
      if (selectedGroup && newIndex >= 0 && newIndex < selectedGroup.allImages.length) {
        setPreviewImage(selectedGroup.allImages[newIndex].url);
        setFullViewMode(false); // 切换图片时重置为裁剪模式
        return newIndex;
      }
      return prevIndex;
    });
  }, [selectedGroup]);

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

  const handleDeleteImage = (postId, imageUrl) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这张图片吗？此操作不可撤销。',
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          message.loading({ content: '正在删除图片...', key: 'deleteImage' });
          const res = await browseApi.deleteImage(postId, imageUrl);
          message.success({ content: res.data?.message || '图片已删除', key: 'deleteImage' });
          // 关闭预览
          setPreviewImage(null);
          // 刷新分组列表（总数/分组可能变化）
          fetchImageGroups(pagination.current, pagination.pageSize);
          if (!res.data?.data) {
            // 整个 Post 已被删除（删到最后一张且无正文），退出详情视图
            setSelectedGroup(null);
          } else {
            // 同步详情数据，避免 allImages 与服务端不一致导致预览索引越界
            loadGroupDetail(postId);
          }
        } catch (error) {
          console.error('删除图片失败:', error);
          message.error({ content: '删除图片失败', key: 'deleteImage' });
        }
      },
    });
  };

  const handleDeletePost = (postId, title) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除这个网页及其所有图片吗？《${title}》此操作不可撤销。`,
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          message.loading({ content: '正在删除网页...', key: 'deletePost' });
          // 删除整个 Post（图片组）
          await browseApi.deleteNovel(postId);
          message.success({ content: '网页已删除', key: 'deletePost' });
          // 关闭预览
          setSelectedGroup(null);
          setPreviewImage(null);
          // 刷新图片分组列表
          fetchImageGroups(pagination.current, pagination.pageSize);
        } catch (error) {
          console.error('删除网页失败:', error);
          message.error({ content: '删除网页失败', key: 'deletePost' });
        }
      },
    });
  };

  // 瀑布流断点配置
  const masonryBreakpoints = {
    default: 4,
    1100: 3,
    700: 2,
    500: 1,
  };

  // 键盘事件处理 - 左右键切换图片
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!previewImage || !selectedGroup) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (previewIndex > 0) {
          const newIndex = previewIndex - 1;
          setPreviewImage(selectedGroup.allImages[newIndex].url);
          setPreviewIndex(newIndex);
          setFullViewMode(false);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (previewIndex < selectedGroup.allImages.length - 1) {
          const newIndex = previewIndex + 1;
          setPreviewImage(selectedGroup.allImages[newIndex].url);
          setPreviewIndex(newIndex);
          setFullViewMode(false);
        }
      } else if (e.key === 'Escape') {
        // ESC 键关闭预览
        setPreviewImage(null);
        setFullViewMode(false);
      }
    };

    // 只在预览图片时添加事件监听
    if (previewImage) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [previewImage, previewIndex, selectedGroup]);

  if (loading && imageGroups.length === 0) {
    return (
      <div className='image-browser-loading'>
        <Spin size='large' tip='加载中...' />
      </div>
    );
  }

  return (
    <div className='image-browser'>
      {/* 搜索和筛选区域（由 BrowsePage 右上角「筛选」按钮统一折叠/展开） */}
      {filtersVisible && (
      <Card className='filter-card'>
        <Space direction='vertical' style={{ width: '100%' }} size='middle'>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <Input
                placeholder='搜索网页标题/作者'
                value={filters.keyword}
                onChange={handleKeywordChange}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                placeholder='选择任务'
                style={{ width: '100%' }}
                value={filters.taskId || undefined}
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
              <Button onClick={handleReset}>
                重置
              </Button>
            </Col>
          </Row>
        </Space>
      </Card>
      )}

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
                    <Space style={{ width: '100%', gap: '8px' }}>
                      <Button 
                        type='primary' 
                        icon={<EyeOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewAllImages(group);
                        }}
                        style={{ flex: 1 }}
                      >
                        查看全部 ({group.totalImages} 张)
                      </Button>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePost(group._id, group.title);
                        }}
                      />
                    </Space>
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
          <div className='selected-group-header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <Title level={4}>{selectedGroup.title}</Title>
              <Text type='secondary'>
                作者: {selectedGroup.author || '未知'} |
                共 {selectedGroup.totalImages} 张图片 |
                {dayjs(selectedGroup.createdAt).format('YYYY-MM-DD HH:mm')}
              </Text>
            </div>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeletePost(selectedGroup._id, selectedGroup.title)}
            >
              删除整个网页
            </Button>
          </div>

          {detailLoading && selectedGroup.allImages.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
              <Spin size='large' />
            </div>
          ) : (
            <>
          <Masonry
            breakpointCols={masonryBreakpoints}
            className='masonry-grid'
            columnClassName='masonry-column'
          >
            {selectedGroup.allImages.slice(0, visibleCount).map((image, index) => (
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
                        loading='lazy'
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
                    <Tooltip title='下载图片'>
                      <Button
                        type='text'
                        size='small'
                        icon={<DownloadOutlined />}
                        onClick={() => handleDownload(image.url)}
                      />
                    </Tooltip>
                    <Tooltip title='分享图片'>
                      <Button
                        type='text'
                        size='small'
                        icon={<ShareAltOutlined />}
                        onClick={() => handleShare(image.url)}
                      />
                    </Tooltip>
                    <Tooltip title='删除图片'>
                      <Button
                        type='text'
                        size='small'
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteImage(selectedGroup._id, image.url)}
                      />
                    </Tooltip>
                  </Space>
                </Card>
              </div>
            ))}
          </Masonry>
              {selectedGroup.allImages.length > visibleCount && (
                <div style={{ textAlign: 'center', padding: '16px 0 32px' }}>
                  <Button onClick={() => setVisibleCount((c) => c + DETAIL_PAGE_SIZE)}>
                    加载更多（已显示 {visibleCount} / {selectedGroup.allImages.length} 张）
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 图片预览 modal */}
      <Modal
        visible={!!previewImage}
        footer={null}
        onCancel={() => {
          setPreviewImage(null);
          setFullViewMode(false);
        }}
        width='90%'
        centered
        bodyStyle={{
          padding: 0,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        style={{ top: 20 }}
      >
        {/* 导航按钮 */}
        {selectedGroup && selectedGroup.allImages.length > 1 && (
          <>
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={() => handlePreviewNavigate(-1)}
              disabled={previewIndex === 0}
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                border: 'none',
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                border: 'none',
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              size="large"
            />
          </>
        )}

        {/* 顶部信息栏 */}
        <div style={{
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '12px 20px',
          textAlign: 'center',
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {selectedGroup && (
            <div style={{ flex: 1 }}>
              <span>
                {previewIndex + 1} / {selectedGroup.allImages.length} - {selectedGroup.title}
                {fullViewMode && <span style={{ marginLeft: '10px', color: '#1890ff' }}>全图模式</span>}
              </span>
            </div>
          )}
          <div style={{ fontSize: '12px', color: '#999', display: 'flex', gap: '20px', alignItems: 'center' }}>
            <span>⬅️ / ➡️ 切换 | ESC 关闭</span>
            {selectedGroup && previewImage && (
              <Button
                type='text'
                size='small'
                danger
                icon={<DeleteOutlined />}
                style={{ color: '#ff4d4f' }}
                onClick={() => handleDeleteImage(selectedGroup._id, selectedGroup.allImages[previewIndex].url)}
              >
                删除图片
              </Button>
            )}
          </div>
        </div>

        {/* 图片容器 */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          minHeight: '400px',
          maxHeight: 'calc(90vh - 100px)',
          overflow: 'auto',
          width: '100%',
          background: '#ffffff'
        }}>
          <img
            src={previewImage}
            alt='预览'
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(90vh - 140px)',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              borderRadius: '4px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              cursor: fullViewMode ? 'default' : 'pointer',
              margin: '0 auto'
            }}
            onClick={() => !fullViewMode && setFullViewMode(true)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ImageBrowser;

export default ImageBrowser;
