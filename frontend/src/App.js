import React from 'react';
import { Layout, Menu, Button } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { FileTextOutlined, PictureOutlined, SettingOutlined, LogoutOutlined } from '@ant-design/icons';
import TaskList from './pages/TaskList';
import PostPreview from './pages/PostPreview';
import BrowsePage from './pages/BrowsePage';
import Login from './pages/Login';
import Register from './pages/Register';
import PrivateRoute from './components/PrivateRoute';
import { getCurrentUser, logout } from './services/authService';
import './App.css';

const { Header, Sider, Content } = Layout;

function LayoutContent() {
  const [collapsed, setCollapsed] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // 根据路由路径确定选中的菜单项
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return 'tasks';
    if (path === '/browse') return 'browse';
    if (path === '/settings') return 'settings';
    return 'tasks';
  };

  const menuItems = [
    {
      key: 'tasks',
      icon: <FileTextOutlined />,
      label: <Link to="/">任务管理</Link>,
    },
    {
      key: 'browse',
      icon: <PictureOutlined />,
      label: <Link to="/browse">内容浏览</Link>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: <Link to="/settings">设置</Link>,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ 
          background: '#001529',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          overflow: 'auto',
          zIndex: 999
        }}
      >
        <div className="logo" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 'bold' }}>
          {!collapsed && '论坛爬虫'}
        </div>
        <Menu
          theme="dark"
          selectedKeys={[getSelectedKey()]}
          mode="inline"
          items={menuItems}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 200 }}>
        <Header style={{ background: '#fff', padding: '0 24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>论坛爬虫服务</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span>{user?.username || user?.email}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </Header>

        <Content style={{ margin: 0, padding: 0, background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<PrivateRoute />}>
          <Route element={<LayoutContent />}>
            <Route path="/" element={<TaskList />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/preview/:taskId" element={<PostPreview />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
