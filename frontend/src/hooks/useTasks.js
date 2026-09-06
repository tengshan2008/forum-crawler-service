import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { taskApi } from '../services/api';

// F2：任务列表的数据获取与操作下沉到 hook，页面组件只保留渲染职责
export function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [crawlTypeFilter, setCrawlTypeFilter] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await taskApi.getAll({
        page: pagination.current,
        limit: pagination.pageSize,
        crawlType: crawlTypeFilter,
      });
      setTasks(response.data.data);
      if (response.data.pagination.total !== pagination.total) {
        setPagination((prev) => ({
          ...prev,
          total: response.data.pagination.total,
        }));
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination, crawlTypeFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 通用任务操作封装：调用 API → 成功提示 → 刷新列表
  const runTaskAction = useCallback(async (actionFn, successText) => {
    try {
      await actionFn();
      message.success(successText);
      fetchTasks();
      return true;
    } catch (error) {
      console.error('Task action failed:', error);
      message.error(error.response?.data?.message || '操作失败');
      return false;
    }
  }, [fetchTasks]);

  const deleteTask = useCallback((id) => runTaskAction(() => taskApi.delete(id), '任务删除成功'), [runTaskAction]);
  const startTask = useCallback((id) => runTaskAction(() => taskApi.start(id), '任务已启动'), [runTaskAction]);
  const pauseTask = useCallback((id) => runTaskAction(() => taskApi.pause(id), '任务已暂停'), [runTaskAction]);
  // D4：取消排队中的任务（后端回退到 paused）
  const cancelTask = useCallback((id) => runTaskAction(() => taskApi.cancel(id), '任务已取消'), [runTaskAction]);
  // 失败任务重新启动
  const retryTask = useCallback((id) => runTaskAction(() => taskApi.start(id), '任务已重新启动'), [runTaskAction]);

  return {
    tasks,
    loading,
    pagination,
    setPagination,
    crawlTypeFilter,
    setCrawlTypeFilter,
    fetchTasks,
    deleteTask,
    startTask,
    pauseTask,
    cancelTask,
    retryTask,
  };
}

export default useTasks;
