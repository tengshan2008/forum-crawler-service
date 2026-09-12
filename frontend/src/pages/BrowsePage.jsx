import { useState } from 'react';
import { Tabs, Card, Space, Button } from 'antd';
import {
  PictureOutlined,
  FileTextOutlined,
  FilterOutlined,
  FilterFilled,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import ImageBrowser from '../components/ImageBrowser';
import NovelBrowser from '../components/NovelBrowser';
import './BrowsePage.css';

const BrowsePage = () => {
  // tab 写入 URL：/browse?tab=images|novels，刷新/分享后停留在原 Tab
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'novels' ? 'novels' : 'images';
  // 筛选栏可见性是页面级单一语义，props 下发给两个 Tab 的浏览组件
  const [filtersVisible, setFiltersVisible] = useState(true);

  const handleTabChange = (key) => {
    // 切 Tab 时清空上一个 Tab 的筛选参数（两个浏览器复用同名参数）
    setSearchParams({ tab: key });
  };

  const tabItems = [
    {
      key: 'images',
      label: (
        <span>
          <PictureOutlined />
          图片浏览
        </span>
      ),
      children: <ImageBrowser filtersVisible={filtersVisible} />,
    },
    {
      key: 'novels',
      label: (
        <span>
          <FileTextOutlined />
          小说浏览
        </span>
      ),
      children: <NovelBrowser filtersVisible={filtersVisible} />,
    },
  ];

  return (
    <div className='browse-page-wrapper'>
      <Card
        className='browse-card'
        style={{
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          size='large'
          tabBarGutter={32}
          // 非活动 Tab 直接卸载：其筛选/页码已持久化到 URL，重新挂载时从 URL 恢复，
          // 同时避免两个浏览器同时存活、互相重复请求
          destroyOnHidden
          tabBarExtraContent={
            <Space>
              <Button
                type={filtersVisible ? 'default' : 'primary'}
                icon={filtersVisible ? <FilterFilled /> : <FilterOutlined />}
                size='large'
                onClick={() => setFiltersVisible((v) => !v)}
              >
                {filtersVisible ? '收起筛选' : '展开筛选'}
              </Button>
            </Space>
          }
        />
      </Card>
    </div>
  );
};

export default BrowsePage;
