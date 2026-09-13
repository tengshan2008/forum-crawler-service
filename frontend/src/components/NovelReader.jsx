import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button, Space, Slider, Radio, Tooltip, Pagination, Row, Col, Statistic } from 'antd';
import {
  DownloadOutlined,
  CopyOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { loadProgress, saveProgress, clearProgress } from '../utils/readerProgress';
import './NovelReader.css';

import { message } from '../utils/antdApp';
const NovelReader = ({ novel }) => {
  // 挂载时从 localStorage 恢复阅读进度与阅读设置（按小说 id 隔离）
  const saved = useMemo(() => loadProgress(novel._id), [novel._id]);
  const restoredRef = useRef(Boolean(saved && saved.page > 1));
  const [fontSize, setFontSize] = useState(saved?.fontSize || 16);
  const [theme, setTheme] = useState(saved?.theme || 'light'); // light or dark
  const [lineHeight, setLineHeight] = useState(saved?.lineHeight || 1.6);
  const [currentPage, setCurrentPage] = useState(saved?.page || 1);
  const [wordsPerPage] = useState(3000); // 每页3000字
  const contentRef = useRef(null);

  // 阅读进度/设置变化即写入（localStorage 写入廉价，无需防抖）
  useEffect(() => {
    saveProgress(novel._id, { page: currentPage, fontSize, lineHeight, theme });
  }, [novel._id, currentPage, fontSize, lineHeight, theme]);

  // 页码改变时滚动到顶部
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  const handleResetProgress = () => {
    clearProgress(novel._id);
    restoredRef.current = false;
    setCurrentPage(1);
    message.success('已清除续读记录');
  };

  const handleDownloadTxt = () => {
    const element = document.createElement('a');
    const file = new Blob(
      [
        `${novel.title}\n作者：${novel.author || '未知'}\n\n${novel.content}`,
      ],
      { type: 'text/plain' }
    );
    element.href = URL.createObjectURL(file);
    element.download = `${novel.title}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    message.success('下载成功');
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(novel.content);
    message.success('内容已复制到剪贴板');
  };

  // 计算分页数据（空内容至少 1 页，避免页码为 0）
  const paginatedContent = useMemo(() => {
    const content = novel.content || '';
    const totalPages = Math.max(1, Math.ceil(content.length / wordsPerPage));
    const startIndex = (currentPage - 1) * wordsPerPage;
    const endIndex = Math.min(startIndex + wordsPerPage, content.length);

    return {
      totalPages,
      startIndex,
      endIndex,
      currentText: content.substring(startIndex, endIndex),
    };
  }, [novel.content, wordsPerPage, currentPage]);

  // 恢复的页码若超出本书总页数（内容变更/旧记录），收敛到末页
  useEffect(() => {
    if (currentPage > paginatedContent.totalPages) {
      setCurrentPage(paginatedContent.totalPages);
    }
  }, [currentPage, paginatedContent.totalPages]);

  // 键盘左右方向键翻页（焦点在字号滑杆等表单控件上时不拦截，避免冲突）。
  // 必须放在 paginatedContent 声明之后：依赖数组在渲染期求值，前置会触发 TDZ
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPage((p) => Math.min(paginatedContent.totalPages, p + 1));
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [paginatedContent.totalPages]);

  const themeStyles = {
    light: {
      backgroundColor: '#fff',
      color: '#333',
    },
    dark: {
      backgroundColor: '#1f1f1f',
      color: '#e8e8e8',
    },
  };

  return (
    <div className='novel-reader'>
      {/* 工具栏 */}
      <div className='reader-toolbar' style={themeStyles[theme]}>
        <Space wrap>
          <span>字号：</span>
          <Slider
            style={{ width: '150px' }}
            min={12}
            max={28}
            value={fontSize}
            onChange={setFontSize}
            marks={{ 12: '小', 16: '中', 24: '大' }}
          />
        </Space>

        <Space wrap>
          <span>行距：</span>
          <Radio.Group
            value={lineHeight}
            onChange={(e) => setLineHeight(e.target.value)}
          >
            <Radio.Button value={1.4}>紧</Radio.Button>
            <Radio.Button value={1.6}>中</Radio.Button>
            <Radio.Button value={2}>宽</Radio.Button>
          </Radio.Group>
        </Space>

        <Space wrap>
          <span>主题：</span>
          <Radio.Group
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <Radio.Button value='light'>浅色</Radio.Button>
            <Radio.Button value='dark'>深色</Radio.Button>
          </Radio.Group>
        </Space>

        <Space wrap>
          <Tooltip title='下载为 TXT'>
            <Button
              type='text'
              size='small'
              icon={<DownloadOutlined />}
              onClick={handleDownloadTxt}
            />
          </Tooltip>
          <Tooltip title='复制内容'>
            <Button
              type='text'
              size='small'
              icon={<CopyOutlined />}
              onClick={handleCopyContent}
            />
          </Tooltip>
        </Space>

        <div className='reader-page-indicator'>
          <Statistic
            title='页码'
            value={currentPage}
            suffix={`/ ${paginatedContent.totalPages}`}
            style={{ fontSize: '12px' }}
          />
          {restoredRef.current && currentPage > 1 && (
            <Tooltip title='清除本机续读记录并回到第 1 页'>
              <Button
                type='text'
                size='small'
                icon={<HistoryOutlined />}
                onClick={handleResetProgress}
              >
                续读第 {currentPage} 页 · 清除
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div
        ref={contentRef}
        className='reader-content'
        style={{
          ...themeStyles[theme],
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          padding: '30px',
          maxWidth: '800px',
          margin: '0 auto',
          minHeight: 'calc(100vh - 250px)',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
        }}
      >
        {paginatedContent.currentText}
      </div>

      {/* 分页导航 */}
      <div className='reader-pagination' style={{ ...themeStyles[theme], padding: '20px', textAlign: 'center', borderTop: '1px solid #ddd' }}>
        <Row gutter={16} align='middle' justify='center'>
          <Col>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              上一页
            </Button>
          </Col>
          <Col>
            <Pagination
              current={currentPage}
              total={paginatedContent.totalPages}
              pageSize={1}
              onChange={setCurrentPage}
              showSizeChanger={false}
              simple
              style={{ display: 'inline-block' }}
            />
          </Col>
          <Col>
            <Button
              icon={<ArrowRightOutlined />}
              onClick={() => setCurrentPage(prev => Math.min(paginatedContent.totalPages, prev + 1))}
              disabled={currentPage === paginatedContent.totalPages}
            >
              下一页
            </Button>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default NovelReader;
