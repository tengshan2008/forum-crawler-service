import React from 'react';
import { Layout, Menu, Button } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Outlet } from 'react-router-dom';
import { FileTextOutlined, PictureOutlined, SettingOutlined, LogoutOutlined } from '@ant-design/icons';
import TaskList from './pages/TaskList';
import PostPreview from './pages/PostPreview';
import Login from './pages/Login';
import Register from './pages/Register';
import PrivateRoute from './components/PrivateRoute';
import { getCurrentUser, logout } from './services/authService';
import './App.css';

const { Header, Sider, Content } = Layout;

function LayoutContent() {
  const [collapsed, setCollapsed] = React.useState(false);
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

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
        <Header style={{ background: '#fff', padding: '0 24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>论坛爬虫服务</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span>{user?.username || user?.email}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </Header>

        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff' }}>
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
            <Route path="/preview/:taskId" element={<PostPreview />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
