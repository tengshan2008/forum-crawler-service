import React, { useState } from 'react';
import { Layout, Menu, Card, Empty } from 'antd';
import {
  DashboardOutlined,
  SettingOutlined,
  UserOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import AdminDashboard from './AdminDashboard';
import AdminConfigPanel from './AdminConfigPanel';
import AdminUserManagement from './AdminUserManagement';
import './AdminPage.css';

const { Sider, Content } = Layout;

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: 'config',
      icon: <SettingOutlined />,
      label: '系统配置',
    },
    {
      key: 'users',
      icon: <UserOutlined />,
      label: '用户管理',
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminDashboard />;
      case 'config':
        return <AdminConfigPanel />;
      case 'users':
        return <AdminUserManagement />;
      default:
        return <Empty description="请选择一个功能" />;
    }
  };

  return (
    <Layout className="admin-page">
      <Sider
        theme="light"
        width={200}
        style={{
          minHeight: 'calc(100vh - 64px)',
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <Menu
          defaultSelectedKeys={['dashboard']}
          mode="inline"
          items={menuItems}
          onSelect={(e) => setActiveTab(e.key)}
          style={{ border: 'none' }}
        />
      </Sider>

      <Layout>
        <Content>{renderContent()}</Content>
      </Layout>
    </Layout>
  );
};

export default AdminPage;
