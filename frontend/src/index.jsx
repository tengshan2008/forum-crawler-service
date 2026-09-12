import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
// ConfigProvider（locale + 亮/暗主题）内聚在 App 内，以便主题状态与切换按钮共享
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
