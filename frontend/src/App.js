import React from 'react';
import { Layout, Menu } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { FileTextOutlined, PictureOutlined, SettingOutlined } from '@ant-design/icons';
import TaskList from './pages/TaskList';
import PostPreview from './pages/PostPreview';
import './App.css';

const { Header, Sider, Content } = Layout;

function App() {
  const [collapsed, setCollapsed] = React.useState(false);

  const menuItems = [
    {
      key: 'tasks',
      icon: <FileTextOutlined />,
      label: <Link to="/">任务管理</Link>,
    },
    {
      key: 'preview',
      icon: <PictureOutlined />,
      label: <Link to="/preview">内容预览</Link>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: <Link to="/settings">设置</Link>,
    },
  ];

  return (
    <Router>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ background: '#001529' }}
        >
          <div className="logo" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 'bold' }}>
            {!collapsed && '论坛爬虫'}
          </div>
          <Menu
            theme="dark"
            defaultSelectedKeys={['tasks']}
            mode="inline"
            items={menuItems}
          />
        </Sider>

        <Layout>
          <Header style={{ background: '#fff', padding: '0 24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
            <h1 style={{ margin: 0, lineHeight: '64px', fontSize: 20 }}>论坛爬虫服务</h1>
          </Header>

          <Content style={{ margin: '24px 16px', padding: 24, background: '#fff' }}>
            <Routes>
              <Route path="/" element={<TaskList />} />
              <Route path="/preview/:taskId" element={<PostPreview />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Router>
  );
}

export default App;
