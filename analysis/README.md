# 分析工具目录

本目录包含用于数据分析和页面分析的Python脚本。

## 🔍 工具列表

### analyze_section_page.py
用于分析论坛版块页面的结构和内容。

**功能：**
- 解析版块页面HTML结构
- 提取帖子列表和链接
- 分析页面布局和选择器
- 诊断爬虫问题

**用法：**
```bash
python analysis/analyze_section_page.py [URL]
```

**示例：**
```bash
python analysis/analyze_section_page.py "https://example.com/forum/section"
```

### analyze_section_page2.py
版本2的版块页面分析工具，可能包含改进的功能。

**功能：**
- 改进的页面解析
- 更详细的分析报告
- 选择器验证

**用法：**
```bash
python analysis/analyze_section_page2.py [URL]
```

## 📊 分析输出

这些工具通常会输出：
- 页面结构概览
- 识别到的选择器和元素
- 可提取的数据
- 潜在的问题和建议

## 🛠️ 依赖

这些脚本通常需要：
- Python 3.x
- BeautifulSoup4 / requests 等爬虫库

确保已安装：
```bash
pip install -r crawler/requirements.txt
```

## 💡 使用场景

在以下情况使用这些工具：
- 调试爬虫无法正确提取内容
- 论坛网站改版后需要更新选择器
- 验证新的爬虫规则是否正确
- 分析网站HTML结构
