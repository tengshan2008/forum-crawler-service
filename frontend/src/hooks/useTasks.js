import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { taskApi } from '../services/api';

// 活动状态：执行中/排队中的任务需要定时刷新进度与状态
const ACTIVE_STATUSES = ['running', 'pending'];
const POLL_INTERVAL = 5000;

// F2：任务列表的数据获取与操作下沉到 hook，页面组件只保留渲染职责
export function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [crawlTypeFilter, setCrawlTypeFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  // 任务名搜索词（仅在搜索/清空时提交，避免每次击键都请求）
  const [keyword, setKeyword] = useState('');

  // silent=true 用于轮询：不触发整表 loading 遮罩与错误提示
  const fetchTasks = useCallback(async (options = {}) => {
    const { silent = false } = options;
    if (!silent) setLoading(true);
    try {
      const response = await taskApi.getAll({
        page: pagination.current,
        limit: pagination.pageSize,
        crawlType: crawlTypeFilter,
        status: statusFilter,
        keyword: keyword.trim() || undefined,
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
      if (!silent) message.error('获取任务列表失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [pagination, crawlTypeFilter, statusFilter, keyword]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 存在活动任务时每 5s 静默轮询；全部进入终态后自动停止，避免无意义请求
  const hasActiveTask = tasks.some((t) => ACTIVE_STATUSES.includes(t.status));
  useEffect(() => {
    if (!hasActiveTask) return undefined;
    const timer = setInterval(() => {
      fetchTasks({ silent: true });
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [hasActiveTask, fetchTasks]);

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
    statusFilter,
    setStatusFilter,
    keyword,
    setKeyword,
    fetchTasks,
    deleteTask,
    startTask,
    pauseTask,
    cancelTask,
    retryTask,
  };
}

export default useTasks;
