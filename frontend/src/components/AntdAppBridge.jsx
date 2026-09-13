import { useEffect } from 'react';
import { App } from 'antd';
import { bindAppApi } from '../utils/antdApp';

// 在 antd <App> 上下文内取得主题感知的 message/modal/notification 实例，
// 注册到 antdApp 模块，供组件外（hooks/services/工具函数）与全部组件统一使用。
const AntdAppBridge = () => {
  const appApi = App.useApp();
  useEffect(() => {
    bindAppApi(appApi);
    return () => bindAppApi(null);
  }, [appApi]);
  return null;
};

export default AntdAppBridge;
