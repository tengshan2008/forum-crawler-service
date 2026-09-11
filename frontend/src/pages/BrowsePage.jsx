import React, { useState } from 'react';
import { Tabs, Card, Space, Button } from 'antd';
import {
  PictureOutlined,
  FileTextOutlined,
  FilterOutlined,
  FilterFilled,
} from '@ant-design/icons';
import ImageBrowser from '../components/ImageBrowser';
import NovelBrowser from '../components/NovelBrowser';
import './BrowsePage.css';

const BrowsePage = () => {
  const [activeTab, setActiveTab] = useState('images');
  // 筛选栏可见性是页面级单一语义，props 下发给两个 Tab 的浏览组件
  const [filtersVisible, setFiltersVisible] = useState(true);

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
          onChange={setActiveTab}
          items={tabItems}
          size='large'
          tabBarGutter={32}
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
