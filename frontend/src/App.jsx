import React from 'react';
import { Layout, Menu, Button, ConfigProvider, Grid, Drawer, Tooltip, Result, theme as antdTheme } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { FileTextOutlined, PictureOutlined, SettingOutlined, LogoutOutlined, DashboardOutlined, TeamOutlined, MenuOutlined, BulbOutlined, BulbFilled } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import TaskList from './pages/TaskList';
import PostPreview from './pages/PostPreview';
import BrowsePage from './pages/BrowsePage';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import AdminConfigPanel from './pages/AdminConfigPanel';
import AdminUserManagement from './pages/AdminUserManagement';
import PrivateRoute from './components/PrivateRoute';
import { getCurrentUser, logout } from './services/authService';
import { useThemeMode } from './hooks/useThemeMode';
import './App.css';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

// 404 兜底页
const NotFound = () => (
  <Result
    status="404"
    title="404"
    subTitle="抱歉，您访问的页面不存在。"
    extra={<Button type="primary" onClick={() => window.history.back()}>返回上一页</Button>}
  />
);

// 侧边菜单（桌面 Sider 与移动 Drawer 共用，保证两处结构一致）
function useMenuItems() {
  const user = getCurrentUser();
  return [
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
    // 只有admin角色才显示系统管理菜单
    ...(user?.role === 'admin' ? [{
      key: 'admin',
      label: '系统管理',
      icon: <DashboardOutlined />,
      children: [
        {
          key: 'admin-dashboard',
          icon: <DashboardOutlined />,
          label: <Link to="/admin/dashboard">监控仪表板</Link>,
        },
        {
          key: 'admin-config',
          icon: <SettingOutlined />,
          label: <Link to="/admin/config">系统配置</Link>,
        },
        {
          key: 'admin-users',
          icon: <TeamOutlined />,
          label: <Link to="/admin/users">用户管理</Link>,
        },
      ],
    }] : []),
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: <Link to="/settings">个人设置</Link>,
    },
  ];
}

function LayoutContent({ themeMode, onToggleTheme }) {
  const screens = useBreakpoint();
  // md 以下（<768px）走移动布局：侧栏收进 Drawer，顶栏加汉堡
  const isMobile = !screens.md;
  const [collapsed, setCollapsed] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const menuItems = useMenuItems();

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
    if (path.startsWith('/admin')) return 'admin';
    if (path === '/settings') return 'settings';
    return 'tasks';
  };

  // 路由变化后收起移动 Drawer（避免导航完菜单仍展开）
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const siderMenu = (
    <Menu
      theme="dark"
      selectedKeys={[getSelectedKey()]}
      mode="inline"
      items={menuItems}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={220}
          styles={{ body: { padding: 0, background: '#001529' }, header: { display: 'none' } }}
          closable={false}
        >
          <div className="logo" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 'bold' }}>
            论坛爬虫
          </div>
          {siderMenu}
        </Drawer>
      ) : (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{
            background: 'var(--sider-bg)',
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
          {siderMenu}
        </Sider>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : collapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
        <Header style={{ background: 'var(--header-bg)', padding: isMobile ? '0 12px' : '0 24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {isMobile && (
              <MenuOutlined
                className="header-trigger"
                onClick={() => setDrawerOpen(true)}
                aria-label="打开菜单"
              />
            )}
            <h1 className="app-header-title" style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>论坛爬虫服务</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <Tooltip title={themeMode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}>
              <Button
                type="text"
                icon={themeMode === 'dark' ? <BulbFilled /> : <BulbOutlined />}
                onClick={onToggleTheme}
                aria-label="切换主题"
              />
            </Tooltip>
            <span className="header-username">{user?.username || user?.email}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </Header>

        <Content>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  // 主题状态在顶层持有：ConfigProvider algorithm 与顶栏切换按钮共享同一份 state
  const { mode, toggleMode } = useThemeMode();
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<PrivateRoute />}>
            <Route element={<LayoutContent themeMode={mode} onToggleTheme={toggleMode} />}>
              <Route path="/" element={<TaskList />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/preview/:taskId" element={<PostPreview />} />
              <Route path="/settings" element={<Settings />} />
              {/* 系统管理路由 */}
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/config" element={<AdminConfigPanel />} />
              <Route path="/admin/users" element={<AdminUserManagement />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

export default App;
