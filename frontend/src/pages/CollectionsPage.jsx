import { useState, useEffect, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  List,
  Button,
  Empty,
  Spin,
  Modal,
  Form,
  Input,
  Popconfirm,
  message,
  Typography,
  Tag,
  Tooltip,
  Image,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  FolderOutlined,
  BookOutlined,
  PictureOutlined,
  FileTextOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { browseApi } from '../services/api';
import VisibilityTag from '../utils/postMeta';
import './CollectionsPage.css';

const { Title, Text, Paragraph } = Typography;

const POST_TYPE_META = {
  image: { label: '图片组', icon: <PictureOutlined /> },
  novel: { label: '小说', icon: <BookOutlined /> },
  text: { label: '帖子', icon: <FileTextOutlined /> },
};

const CollectionsPage = () => {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const fetchCollections = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await browseApi.getCollections({ page: 1, limit: 100 });
      setCollections(res.data.data || []);
    } catch (error) {
      console.error('获取收藏夹失败:', error);
      message.error('获取收藏夹失败');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const fetchDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await browseApi.getCollection(id);
      setDetail(res.data.data);
    } catch (error) {
      console.error('获取收藏夹详情失败:', error);
      message.error('获取收藏夹详情失败');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      const res = await browseApi.createCollection({
        name: values.name.trim(),
        description: values.description?.trim() || '',
      });
      message.success('收藏夹已创建');
      setCreateOpen(false);
      createForm.resetFields();
      await fetchCollections();
      // 新建后直接选中
      const newId = res.data?.data?._id;
      if (newId) setSelectedId(newId);
    } catch (error) {
      if (error?.errorFields) return;
      console.error('创建收藏夹失败:', error);
      message.error(error.response?.data?.message || '创建收藏夹失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCollection = async (id) => {
    try {
      await browseApi.deleteCollection(id);
      message.success('收藏夹已删除');
      if (selectedId === id) setSelectedId(null);
      fetchCollections();
    } catch (error) {
      console.error('删除收藏夹失败:', error);
      message.error(error.response?.data?.message || '删除收藏夹失败');
    }
  };

  const handleRemoveItem = async (postId) => {
    setRemovingId(postId);
    try {
      await browseApi.removeFromCollection(selectedId, postId);
      message.success('已从收藏夹移除');
      // 详情本地剔除（items 已 populate，直接过滤），同时刷新列表上的 itemCount
      setDetail((prev) =>
        prev ? { ...prev, items: (prev.items || []).filter((it) => it._id !== postId) } : prev
      );
      fetchCollections();
    } catch (error) {
      console.error('移除条目失败:', error);
      message.error(error.response?.data?.message || '移除失败');
    } finally {
      setRemovingId(null);
    }
  };

  const goBrowse = (postType) => {
    navigate(`/browse?tab=${postType === 'novel' ? 'novels' : 'images'}`);
  };

  return (
    <div className='collections-page'>
      <Row gutter={16}>
        {/* 左：收藏夹列表 */}
        <Col xs={24} md={7} lg={6}>
          <Card
            className='collections-list-card'
            title={
              <div className='collections-list-title'>
                <FolderOutlined />
                <span>我的收藏夹</span>
              </div>
            }
            extra={
              <Tooltip title='新建收藏夹'>
                <Button
                  type='text'
                  size='small'
                  icon={<PlusOutlined />}
                  onClick={() => setCreateOpen(true)}
                />
              </Tooltip>
            }
            styles={{ body: { padding: listLoading ? 24 : 0 } }}
          >
            {listLoading ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Spin />
              </div>
            ) : collections.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description='还没有收藏夹'
                style={{ margin: '16px 0' }}
              >
                <Button type='primary' icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新建收藏夹
                </Button>
              </Empty>
            ) : (
              <List
                dataSource={collections}
                renderItem={(item) => (
                  <List.Item
                    className={`collection-list-item${selectedId === item._id ? ' active' : ''}`}
                    onClick={() => setSelectedId(item._id)}
                    actions={[
                      <Popconfirm
                        key='delete'
                        title='删除收藏夹'
                        description='收藏夹内条目不会被删除，确定删除该收藏夹？'
                        okText='删除'
                        cancelText='取消'
                        okButtonProps={{ danger: true }}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDeleteCollection(item._id);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                      >
                        <Button
                          type='text'
                          size='small'
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<FolderOutlined className='collection-folder-icon' />}
                      title={
                        <span className='collection-item-name'>
                          {item.name}
                          {item.isPublic && <Tag color='blue' style={{ marginInlineStart: 6 }}>公开</Tag>}
                        </span>
                      }
                      description={
                        <Text type='secondary' style={{ fontSize: 12 }}>
                          {item.itemCount ?? (item.items || []).length} 个条目
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* 右：选中收藏夹的条目 */}
        <Col xs={24} md={17} lg={18}>
          <Card className='collection-detail-card'>
            {!selectedId ? (
              <Empty
                description='选择左侧收藏夹查看条目'
                style={{ margin: '60px 0' }}
              />
            ) : detailLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <Spin tip='加载中...' />
              </div>
            ) : !detail ? null : (detail.items || []).length === 0 ? (
              <Empty description={`「${detail.name}」还是空的`} style={{ margin: '60px 0' }}>
                <Button type='primary' onClick={() => navigate('/browse')}>
                  去浏览内容
                </Button>
              </Empty>
            ) : (
              <>
                <div className='collection-detail-header'>
                  <div>
                    <Title level={5} style={{ marginBottom: 4 }}>{detail.name}</Title>
                    <Text type='secondary' style={{ fontSize: 12 }}>
                      {detail.description || '暂无描述'} ·{' '}
                      {(detail.items || []).length} 个条目
                    </Text>
                  </div>
                </div>
                <List
                  itemLayout='vertical'
                  dataSource={detail.items || []}
                  rowKey={(item) => item._id}
                  renderItem={(item) => {
                    const typeMeta = POST_TYPE_META[item.postType] || POST_TYPE_META.text;
                    const cover = item.media?.[0]?.url;
                    return (
                      <List.Item
                        className='collection-entry'
                        actions={[
                          item.postType === 'image' || item.postType === 'novel' ? (
                            <Button
                              key='open'
                              type='link'
                              size='small'
                              onClick={() => goBrowse(item.postType)}
                            >
                              去浏览中查看
                            </Button>
                          ) : null,
                          <Popconfirm
                            key='remove'
                            title='从收藏夹移除'
                            description='仅移除收藏关系，不会删除原始内容。'
                            okText='移除'
                            cancelText='取消'
                            okButtonProps={{ danger: true }}
                            onConfirm={() => handleRemoveItem(item._id)}
                          >
                            <Button
                              type='link'
                              size='small'
                              danger
                              icon={<MinusCircleOutlined />}
                              loading={removingId === item._id}
                            >
                              移除
                            </Button>
                          </Popconfirm>,
                        ].filter(Boolean)}
                      >
                        <List.Item.Meta
                          avatar={
                            cover ? (
                              <Image
                                src={cover}
                                width={72}
                                height={72}
                                preview={false}
                                className='collection-entry-cover'
                              />
                            ) : (
                              <div className='collection-entry-icon'>{typeMeta.icon}</div>
                            )
                          }
                          title={
                            <div className='collection-entry-title'>
                              <span>{item.title || '未命名'}</span>
                              <Tag icon={typeMeta.icon} style={{ marginInlineStart: 8 }}>
                                {typeMeta.label}
                              </Tag>
                              {item.visibility && item.visibility !== 'private' && (
                                <VisibilityTag visibility={item.visibility} />
                              )}
                            </div>
                          }
                          description={
                            <div>
                              <Text type='secondary' style={{ fontSize: 12 }}>
                                {item.author ? `作者：${item.author} · ` : ''}
                                发布于 {dayjs(item.createdAt).format('YYYY-MM-DD')}
                              </Text>
                              {item.postType === 'novel' && item.content && (
                                <Paragraph
                                  type='secondary'
                                  ellipsis={{ rows: 2 }}
                                  style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}
                                >
                                  {item.content.slice(0, 160)}
                                </Paragraph>
                              )}
                            </div>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              </>
            )}
          </Card>
        </Col>
      </Row>

      {/* 新建收藏夹 */}
      <Modal
        title='新建收藏夹'
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText='创建'
        cancelText='取消'
        destroyOnHidden
      >
        <Form form={createForm} layout='vertical' style={{ marginTop: 16 }}>
          <Form.Item
            name='name'
            label='名称'
            rules={[
              { required: true, message: '请输入收藏夹名称' },
              { max: 50, message: '名称最长 50 个字符' },
            ]}
          >
            <Input placeholder='例如：优质长文 / 参考素材' maxLength={50} showCount />
          </Form.Item>
          <Form.Item name='description' label='描述'>
            <Input.TextArea rows={3} maxLength={200} showCount placeholder='可选' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CollectionsPage;
