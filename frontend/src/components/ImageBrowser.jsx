import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Row, Col, Card, Image, Space, Button, Input, AutoComplete, DatePicker, Spin, Pagination, Empty, Tooltip, Typography, Tag, Modal } from 'antd';
import {
  DownloadOutlined,
  ShareAltOutlined,
  LeftOutlined,
  RightOutlined,
  EyeOutlined,
  DeleteOutlined,
  HeartOutlined,
  HeartFilled,
  FileZipOutlined,
  EditOutlined,
} from '@ant-design/icons';
import Masonry from 'react-masonry-css';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { browseApi, taskApi } from '../services/api';
import { createZipBlob } from '../utils/zip';
import VisibilityTag from '../utils/postMeta';
import CollectionPickerModal from './CollectionPickerModal';
import PostEditModal from './PostEditModal';
import './ImageBrowser.css';

import { message, modal } from '../utils/antdApp';
const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const DEFAULT_FILTERS = { taskId: '', keyword: '', dateRange: null };

// 图片按任务落盘在 /public/images/uploads/<taskId>/，目录名即 24 位 ObjectId；
// 支持直接粘贴该 ID 查询（下拉选任务同样写入此字段）
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

// 从 URL 恢复筛选草稿/已提交条件（刷新、分享链接、浏览器前进后退均生效）
const readFiltersFromUrl = (sp) => {
  const start = sp.get('start');
  const end = sp.get('end');
  return {
    taskId: sp.get('task') || '',
    keyword: sp.get('q') || '',
    dateRange: start && end ? [dayjs(start), dayjs(end)] : null,
  };
};
// 详情瀑布流增量渲染页大小（v2.12.0：首次 60 张，「加载更多」每次 +60）
const DETAIL_PAGE_SIZE = 60;
// 裂图占位（v2.10.9）：内联 SVG 数据 URI，单图失效时显示「图片加载失败」而非浏览器裂图图标
const IMAGE_FALLBACK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
    <rect width="320" height="200" fill="#f5f5f5"/>
    <g fill="none" stroke="#bfbfbf" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="110" y="62" width="100" height="76" rx="6"/>
      <circle cx="138" cy="90" r="7" fill="#bfbfbf" stroke="none"/>
      <path d="M118 130l30-28 22 20 18-14 24 22"/>
    </g>
    <text x="160" y="168" font-size="15" fill="#8c8c8c" text-anchor="middle" font-family="sans-serif">图片加载失败</text>
  </svg>
`)}`;

const ImageBrowser = ({ filtersVisible = true }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [imageGroups, setImageGroups] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: Number(searchParams.get('page')) || 1,
    pageSize: 12,
    total: 0,
  });
  // filters 为输入草稿，appliedFilters 为已提交条件（请求参数的唯一事实来源）；
  // 两者初值都从 URL 恢复，草稿仅在点击「搜索」/回车后提交，避免逐键请求与多入口状态漂移
  const [filters, setFilters] = useState(() => readFiltersFromUrl(searchParams));
  const [appliedFilters, setAppliedFilters] = useState(() => readFiltersFromUrl(searchParams));
  // 挂载首刷使用 URL 页码；此后筛选变化统一回到第 1 页
  const initialPageRef = useRef(Number(searchParams.get('page')) || 1);
  const [selectedGroup, setSelectedGroup] = useState(null);
  // 详情数据按需加载：列表仅返回 4 张预览，进入详情后拉全量并增量渲染
  const [detailLoading, setDetailLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(DETAIL_PAGE_SIZE);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [fullViewMode, setFullViewMode] = useState(false);
  // 收藏夹数据与「收藏」弹窗目标分组（收藏粒度为整个 Post/图片组）
  const [collections, setCollections] = useState([]);
  const [pickerGroup, setPickerGroup] = useState(null);
  // 打包下载进度（null=未开始）；编辑信息弹窗目标分组
  const [zipProgress, setZipProgress] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);

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

  // 收藏夹数据（items 为 postId 集合），一次请求即可推导图片组的已收藏状态
  const fetchCollections = useCallback(async () => {
    try {
      const res = await browseApi.getCollections({ page: 1, limit: 100 });
      setCollections(res.data.data || []);
    } catch {
      // 收藏夹加载失败不阻塞浏览主流程
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // 已收藏 Post 集合（心形点亮依据，与 NovelBrowser 同口径）
  const favoritedGroupIds = new Set(
    collections.flatMap((c) => (c.items || []).map(String))
  );

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

  // 首次加载及已应用筛选变化时回到第 1 页拉取（翻页由 handlePaginationChange 单独触发）；
  // 挂载时若 URL 带 page，则首刷落在该页
  useEffect(() => {
    const page = initialPageRef.current;
    initialPageRef.current = 1;
    fetchImageGroups(page);
  }, [fetchImageGroups]);

  // 已提交筛选/页码 → URL（replace，不产生历史垃圾；参数可分享、可刷新恢复）
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('tab', 'images');
    const keyword = (appliedFilters.keyword || '').trim();
    if (keyword) params.set('q', keyword);
    if (appliedFilters.taskId) params.set('task', appliedFilters.taskId);
    if (appliedFilters.dateRange && appliedFilters.dateRange.length === 2) {
      params.set('start', appliedFilters.dateRange[0].format('YYYY-MM-DD'));
      params.set('end', appliedFilters.dateRange[1].format('YYYY-MM-DD'));
    }
    if (pagination.current > 1) params.set('page', String(pagination.current));
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters, pagination.current]);

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
    // ID 查询：允许下拉选任务或直接粘贴存储路径中的 24 位 ID，非法形态不发请求
    const taskId = (filters.taskId || '').trim();
    if (taskId && !OBJECT_ID_RE.test(taskId)) {
      message.warning('ID 格式无效：请粘贴图片存储路径中的 24 位 ID，或从下拉列表选择任务');
      return;
    }
    setAppliedFilters({ ...filters, taskId });
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

  // 图片组一键打包下载：并发拉取（并发池 5，避免一次性打爆静态服务）→ 零依赖 STORE zip → a[download]
  const handleDownloadZip = async (group) => {
    const images = group.allImages || [];
    if (!images.length) {
      message.warning('该分组暂无可下载的图片');
      return;
    }
    setZipProgress({ done: 0, failed: 0, total: images.length });
    const files = new Array(images.length);
    let cursor = 0;
    let done = 0;
    let failed = 0;

    const worker = async () => {
      while (cursor < images.length) {
        const index = cursor;
        cursor += 1;
        const image = images[index];
        try {
          const res = await fetch(image.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          files[index] = {
            name: (image.url || '').split('/').pop() || `image_${index + 1}.jpg`,
            data: new Uint8Array(await res.arrayBuffer()),
          };
        } catch {
          failed += 1;
          // 失败图片占位为 null，最后统一剔除（保留序号不影响其余文件）
          files[index] = null;
        }
        done += 1;
        setZipProgress({ done, failed, total: images.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, images.length) }, worker));

    const validFiles = files.filter(Boolean);
    if (!validFiles.length) {
      setZipProgress(null);
      message.error('所有图片均下载失败，请稍后重试');
      return;
    }
    try {
      const blob = await createZipBlob(validFiles);
      const safeTitle = (group.title || 'image-group').replace(/[\\/:*?"<>|]+/g, '_');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeTitle}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success(
        `已打包下载 ${validFiles.length} 张图片${failed > 0 ? `（${failed} 张失败已跳过）` : ''}`
      );
    } catch (error) {
      console.error('打包下载失败:', error);
      message.error('打包下载失败');
    } finally {
      setZipProgress(null);
    }
  };

  // PostEditModal 保存成功后同步列表与详情中的标题/标签/可见性
  const handlePostSaved = (updated) => {
    setImageGroups((prev) => prev.map((g) => (g._id === updated._id ? { ...g, ...updated } : g)));
    setSelectedGroup((prev) => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
    setEditingGroup(null);
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
    modal.confirm({
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
    modal.confirm({
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
        <Spin size='large' tip='加载中...'>
          <div style={{ minHeight: 120 }} />
        </Spin>
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
              {/* 可下拉选任务，也可直接粘贴图片存储路径中的 ID（/public/images/uploads/<ID>/，即任务 ID） */}
              <AutoComplete
                style={{ width: '100%' }}
                value={filters.taskId || ''}
                onChange={handleTaskFilter}
                onSelect={handleTaskFilter}
                options={tasks.map((task) => ({
                  value: task._id,
                  label: `${task.name}（${task._id}）`,
                }))}
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.trim().toLowerCase())
                }
              >
                <Input
                  placeholder='选择任务或输入存储 ID 查询'
                  onPressEnter={handleSearch}
                  allowClear
                />
              </AutoComplete>
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
                    {(group.tags || []).length > 0 ||
                    (group.visibility && group.visibility !== 'private') ? (
                      <div className='group-badges'>
                        {group.visibility && group.visibility !== 'private' && (
                          <VisibilityTag visibility={group.visibility} />
                        )}
                        {(group.tags || []).slice(0, 3).map((tag) => (
                          <Tag key={tag} style={{ marginInlineEnd: 0 }}>
                            {tag}
                          </Tag>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className='preview-images'>
                    {group.previewImages.slice(0, 4).map((image, index) => (
                      <div key={index} className='preview-image-wrapper'>
                        <Image
                          src={image.url}
                          alt={`预览 ${index + 1}`}
                          preview={false}
                          fallback={IMAGE_FALLBACK}
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
                      <Tooltip title='编辑标题/可见性/标签'>
                        <Button
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingGroup(group);
                          }}
                        />
                      </Tooltip>
                      <Tooltip title={favoritedGroupIds.has(String(group._id)) ? '已收藏，点击管理' : '收藏'}>
                        <Button
                          icon={
                            favoritedGroupIds.has(String(group._id)) ? (
                              <HeartFilled style={{ color: '#eb2f96' }} />
                            ) : (
                              <HeartOutlined />
                            )
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setPickerGroup(group);
                          }}
                        />
                      </Tooltip>
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
          <div className='selected-group-header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <Title level={4} style={{ marginBottom: 4 }}>{selectedGroup.title}</Title>
              <Text type='secondary'>
                作者: {selectedGroup.author || '未知'} |
                共 {selectedGroup.totalImages} 张图片 |
                {dayjs(selectedGroup.createdAt).format('YYYY-MM-DD HH:mm')}
              </Text>
              {((selectedGroup.tags || []).length > 0 ||
                (selectedGroup.visibility && selectedGroup.visibility !== 'private')) && (
                <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selectedGroup.visibility && selectedGroup.visibility !== 'private' && (
                    <VisibilityTag visibility={selectedGroup.visibility} />
                  )}
                  {(selectedGroup.tags || []).map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
              )}
            </div>
            <Space wrap>
              <Button
                type='primary'
                icon={<FileZipOutlined />}
                loading={!!zipProgress}
                disabled={detailLoading || !selectedGroup.allImages?.length}
                onClick={() => handleDownloadZip(selectedGroup)}
              >
                {zipProgress
                  ? `打包中 ${zipProgress.done}/${zipProgress.total}${zipProgress.failed ? ` · 失败${zipProgress.failed}` : ''}`
                  : '打包下载'}
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() => setEditingGroup(selectedGroup)}
              >
                编辑信息
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDeletePost(selectedGroup._id, selectedGroup.title)}
              >
                删除整个网页
              </Button>
            </Space>
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
                        fallback={IMAGE_FALLBACK}
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
        open={!!previewImage}
        footer={null}
        onCancel={() => {
          setPreviewImage(null);
          setFullViewMode(false);
        }}
        width='90%'
        centered
        styles={{
          body: {
            padding: 0,
            background: '#000',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh'
          }
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
            key={previewImage}
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
            onError={(e) => {
              // 加载失败时替换为统一占位图；data URI 不会再次失败，标记位仅作保险避免循环
              if (!e.currentTarget.dataset.fallbackApplied) {
                e.currentTarget.dataset.fallbackApplied = '1';
                e.currentTarget.src = IMAGE_FALLBACK;
              }
            }}
            onClick={() => !fullViewMode && setFullViewMode(true)}
          />
        </div>
      </Modal>

      {/* 收藏到收藏夹弹窗（图片/小说浏览共用，收藏粒度为整个图片组 Post） */}
      <CollectionPickerModal
        open={!!pickerGroup}
        post={pickerGroup}
        collections={collections}
        onClose={() => setPickerGroup(null)}
        onChanged={fetchCollections}
      />

      {/* 编辑标题/可见性/标签（PUT /api/posts/:id，仅资源所有者可改） */}
      <PostEditModal
        open={!!editingGroup}
        post={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSaved={handlePostSaved}
      />
    </div>
  );
};

export default ImageBrowser;
