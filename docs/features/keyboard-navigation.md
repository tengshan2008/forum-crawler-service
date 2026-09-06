# 图片预览键盘导航功能

## 概述

实现了图片预览时的键盘快捷键支持，提升用户体验。用户可以使用左右方向键快速切换图片，而无需点击按钮。

## 功能支持

### ImageBrowser 组件（图片浏览器）

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| ⬅️ 左键 | 上一张图片 | 切换到前一张图片 |
| ➡️ 右键 | 下一张图片 | 切换到后一张图片 |
| ESC | 关闭预览 | 关闭预览对话框 |

**位置**: `/workspaces/forum-crawler-service/frontend/src/components/ImageBrowser.js`

**用户界面提示**: 预览框顶部显示 "⬅️ / ➡️ 切换 | ESC 关闭"

### PostPreview 组件（文章预览）

PostPreview 使用 Ant Design 的 `Image.PreviewGroup` 组件，该组件已内置键盘快捷键支持：

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| ⬅️ 左键 | 上一张图片 | 切换到前一张图片 |
| ➡️ 右键 | 下一张图片 | 切换到后一张图片 |
| ESC | 关闭预览 | 关闭预览对话框 |

**位置**: `/workspaces/forum-crawler-service/frontend/src/pages/PostPreview.js`

**用户界面提示**: "💡 点击图片预览，按 ⬅️ / ➡️ 键切换，ESC 关闭"

## 实现细节

### ImageBrowser - 自定义键盘事件处理

```javascript
// 键盘事件处理 - 左右键切换图片
useEffect(() => {
  const handleKeyDown = (e) => {
    if (!previewImage || !selectedGroup) return;
    
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (previewIndex > 0) {
        handlePreviewNavigate(-1);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (previewIndex < selectedGroup.allImages.length - 1) {
        handlePreviewNavigate(1);
      }
    } else if (e.key === 'Escape') {
      // ESC 键关闭预览
      setPreviewImage(null);
      setFullViewMode(false);
    }
  };

  // 只在预览图片时添加事件监听
  if (previewImage) {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }
}, [previewImage, previewIndex, selectedGroup, handlePreviewNavigate]);
```

### 顶部信息栏增强

- 添加了键盘快捷键提示
- 使用 flexbox 布局改进信息展示
- 提示信息显示在右侧，包含 emoji 符号便于识别

## 使用场景

1. **批量浏览图片**: 用户可以快速浏览同一主题的多张图片
2. **快速导航**: 比使用鼠标点击导航按钮更高效
3. **移动设备友好**: 触摸屏设备也可以使用键盘（如蓝牙键盘）

## 浏览器兼容性

- ✅ Chrome/Edge (最新版本)
- ✅ Firefox (最新版本)
- ✅ Safari (最新版本)
- ✅ 移动浏览器（支持外接键盘）

## 注意事项

1. **事件防止冒泡**: 按键事件会自动阻止默认行为 (preventDefault)
2. **条件检查**: 只在预览图片时才添加事件监听器，避免不必要的性能消耗
3. **索引边界**: 在到达第一张或最后一张图片时，左键和右键会自动禁用

## 测试方法

### ImageBrowser 测试

1. 打开浏览器，导航到图片浏览器页面
2. 找到一个包含多张图片的分组
3. 点击任意图片打开预览框
4. 按左键 (←) 切换到前一张图片
5. 按右键 (→) 切换到后一张图片
6. 按 ESC 关闭预览框

### PostPreview 测试

1. 打开任务列表，选择一个任务
2. 点击预览查看文章详情
3. 找到媒体内容部分，点击任意图片
4. 使用左右方向键切换图片
5. 按 ESC 关闭预览

## 相关文件

- [ImageBrowser.js](../../frontend/src/components/ImageBrowser.js)
- [PostPreview.js](../../frontend/src/pages/PostPreview.js)
- [App.css](../../frontend/src/App.css)
