# 功能：内容浏览支持删除图片或小说

## 概述
为内容浏览功能增加了删除图片和小说的能力，用户可以在浏览页面中删除不需要的图片或整个小说/网页。

## 实现内容

### 后端 API 更改

#### 1. 新增删除端点 (`backend/src/routes/browseRoutes.js`)
- `DELETE /api/browse/novels/:id` - 删除整个小说（Post）
- `DELETE /api/browse/posts/:id/images` - 删除单个图片
- `DELETE /api/browse/posts/:id/images/batch` - 批量删除多个图片

#### 2. 新增控制器方法 (`backend/src/controllers/browseController.js`)

##### `exports.deleteNovel(req, res, next)`
- 删除一个小说 Post 及其所有关联数据
- 清除缓存以保证数据一致性
- 返回被删除的 Post 信息

##### `exports.deleteImage(req, res, next)`
- 从 Post 的 media 数组中删除单个图片
- 如果删除后 Post 没有图片和内容，则删除整个 Post
- 支持部分删除和完全删除的灵活操作

##### `exports.deleteImages(req, res, next)`
- 批量删除多个图片
- 支持一次性删除多张图片以提高效率
- 如果删除后 Post 没有图片和内容，则删除整个 Post

### 前端 API 服务更改

#### `frontend/src/services/api.js`
新增 browseApi 方法：
```javascript
deleteNovel: (id) => api.delete(`/browse/novels/${id}`)
deleteImage: (postId, imageUrl) => api.delete(`/browse/posts/${postId}/images`, { data: { imageUrl } })
deleteImages: (postId, imageUrls) => api.delete(`/browse/posts/${postId}/images/batch`, { data: { imageUrls } })
```

### 前端 UI 组件更改

#### 1. `frontend/src/components/NovelBrowser.js`
- 导入 `DeleteOutlined` 图标
- 新增 `handleDelete(novel)` 方法，包含确认对话框
- 在小说卡片中添加删除按钮（红色，带危险标记）
- 删除成功后自动刷新列表

#### 2. `frontend/src/components/ImageBrowser.js`
- 导入 `DeleteOutlined` 图标
- 新增 `handleDeleteImage(postId, imageUrl)` 方法，删除单个图片
- 新增 `handleDeletePost(postId, title)` 方法，删除整个网页及其图片
- 在瀑布流图片卡片中添加删除按钮
- 在图片预览 Modal 顶部添加删除按钮
- 在网页分组卡片中添加删除按钮
- 在选中网页的 header 中添加"删除整个网页"按钮
- 删除成功后自动刷新列表

## 用户交互流程

### 删除小说
1. 在小说浏览页面，点击小说卡片右侧的删除按钮（红色）
2. 弹出确认对话框："确定要删除小说《标题》吗？此操作不可撤销。"
3. 确认删除后，API 调用删除端点
4. 删除成功，列表自动刷新

### 删除图片
1. **单个删除**：
   - 在瀑布流视图中点击图片卡片上的删除按钮，或
   - 在图片预览 Modal 中点击顶部的"删除图片"按钮
   - 确认删除
   - 图片删除成功后，预览关闭，列表刷新

2. **删除整个网页**：
   - 在网页分组卡片上点击删除按钮，或
   - 点击网页详情顶部的"删除整个网页"按钮
   - 确认删除
   - 整个网页及其所有图片删除成功后，返回网页列表并刷新

## 技术特性

### 数据一致性
- 删除图片时，如果 Post 没有图片和文本内容，自动删除整个 Post
- 删除操作后清除缓存，保证显示最新数据

### 错误处理
- 提供友好的错误提示
- 删除失败时显示错误信息，不刷新列表

### 用户确认
- 所有删除操作都需要用户确认
- 使用红色危险按钮表示删除操作
- 确认对话框明确提示操作不可撤销

### 数据库操作
- 使用原子操作确保数据一致性
- 支持级联删除（删除 Post 的同时删除相关图片）

## 测试验证

### API 测试（已验证）
✅ DELETE /api/browse/novels/{id} - 小说删除成功
✅ DELETE /api/browse/posts/{id}/images - 图片删除成功
✅ 删除后数据库状态正确更新

### 前端界面
- ✅ 小说浏览页面删除按钮显示正确
- ✅ 图片浏览页面删除按钮显示正确
- ✅ 确认对话框正常工作
- ✅ 删除成功后列表自动刷新

## 依赖包

所有功能都基于已有的依赖包：
- antd (UI 组件)
- axios (API 请求)
- react (前端框架)

## 向后兼容性

✅ 完全向后兼容，不影响现有功能
✅ 新增的 API 端点不与现有端点冲突
✅ 前端组件增强不影响现有样式

## 文件清单

### 修改的文件
1. `backend/src/routes/browseRoutes.js` - 添加新路由
2. `backend/src/controllers/browseController.js` - 添加新方法
3. `frontend/src/services/api.js` - 添加 API 客户端方法
4. `frontend/src/components/NovelBrowser.js` - 添加删除小说 UI
5. `frontend/src/components/ImageBrowser.js` - 添加删除图片 UI

### 新增文件
- 本文档 (FEATURE_DELETE_CONTENT.md)

## 使用示例

### cURL 示例

```bash
# 删除小说
curl -X DELETE "http://localhost:5000/api/browse/novels/695bd96eb42ceaaa0e5d6c10" \
  -H "Content-Type: application/json"

# 删除单个图片
curl -X DELETE "http://localhost:5000/api/browse/posts/6982096b82196d016f02e0ee/images" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"/public/images/uploads/6982090b81df0d457f25d988/8e3a16601cb610d6.gif"}'

# 批量删除图片
curl -X DELETE "http://localhost:5000/api/browse/posts/6982096b82196d016f02e0ee/images/batch" \
  -H "Content-Type: application/json" \
  -d '{"imageUrls":["/public/images/url1.jpg","/public/images/url2.jpg"]}'
```

## 后续改进建议

1. 添加软删除功能（标记删除而不是真正删除）
2. 添加恢复已删除内容的功能（基于软删除）
3. 添加删除历史日志
4. 批量删除操作的前端 UI
5. 权限控制（只允许内容所有者或管理员删除）
