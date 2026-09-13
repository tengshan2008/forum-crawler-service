// 主题感知的 message/modal 静态入口。
// 背景：antd v5 的静态 `message.xxx` / `Modal.confirm` 走独立 React 根，
// 不消费 ConfigProvider 的暗色算法，暗色模式下弹层始终白底（第二批遗留）。
// 正解是在组件内用 App.useApp()，但 hooks/services/工具函数不在组件树内。
// 方案：AntdAppBridge 在 <App> 内把 useApp() 实例注册到这里，模块导出 Proxy 转发；
// 桥接完成前（理论上仅首帧）回退 antd 静态方法，保证调用不丢失。
import { message as antdMessage, Modal as antdModal } from 'antd';

let appApi = null;

export function bindAppApi(api) {
  appApi = api;
}

// 通用转发：优先用 App 上下文实例（跟随主题/ConfigProvider），否则回退静态方法
function createProxy(scopeName, fallback) {
  return new Proxy(
    {},
    {
      get(target, prop) {
        const instance = appApi?.[scopeName];
        const fn = instance?.[prop] || fallback[prop];
        return typeof fn === 'function' ? fn.bind(instance || fallback) : undefined;
      },
    }
  );
}

export const message = createProxy('message', antdMessage);
export const modal = createProxy('modal', antdModal);

export default { message, modal };
