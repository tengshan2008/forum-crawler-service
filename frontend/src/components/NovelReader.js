import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Button,
  Space,
  Slider,
  Radio,
  Tooltip,
  message,
  Pagination,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  DownloadOutlined,
  CopyOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import './NovelReader.css';

const NovelReader = ({ novel }) => {
  const [fontSize, setFontSize] = useState(16);
  const [theme, setTheme] = useState('light'); // light or dark
  const [lineHeight, setLineHeight] = useState(1.6);
  const [currentPage, setCurrentPage] = useState(1);
  const [wordsPerPage] = useState(3000); // 每页3000字
  const contentRef = useRef(null);

  // 页码改变时滚动到顶部
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentPage]);

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

  // 计算分页数据
  const paginatedContent = useMemo(() => {
    const content = novel.content || '';
    const totalPages = Math.ceil(content.length / wordsPerPage);
    const startIndex = (currentPage - 1) * wordsPerPage;
    const endIndex = Math.min(startIndex + wordsPerPage, content.length);

    return {
      totalPages,
      startIndex,
      endIndex,
      currentText: content.substring(startIndex, endIndex),
    };
  }, [novel.content, wordsPerPage, currentPage]);

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

        <Statistic
          title='页码'
          value={currentPage}
          suffix={`/ ${paginatedContent.totalPages}`}
          style={{ fontSize: '12px' }}
        />
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
