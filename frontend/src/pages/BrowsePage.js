import React, { useState } from 'react';
import { Tabs, Card, Space, Button } from 'antd';
import { PictureOutlined, FileTextOutlined, FilterOutlined } from '@ant-design/icons';
import ImageBrowser from '../components/ImageBrowser';
import NovelBrowser from '../components/NovelBrowser';
import './BrowsePage.css';

const BrowsePage = () => {
  const [activeTab, setActiveTab] = useState('images');

  const tabItems = [
    {
      key: 'images',
      label: (
        <span>
          <PictureOutlined />
          图片浏览
        </span>
      ),
      children: <ImageBrowser />,
    },
    {
      key: 'novels',
      label: (
        <span>
          <FileTextOutlined />
          小说浏览
        </span>
      ),
      children: <NovelBrowser />,
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
                type="text" 
                icon={<FilterOutlined />}
                size="large"
              >
                筛选
              </Button>
            </Space>
          }
        />
      </Card>
    </div>
  );
};

export default BrowsePage;
