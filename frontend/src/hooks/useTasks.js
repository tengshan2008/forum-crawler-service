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
  // 表格排序状态（sortField/sortOrder 透传给后端 sort 参数）
  const [sort, setSort] = useState({ field: null, order: null });
  const [crawlTypeFilter, setCrawlTypeFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  // 任务名搜索词（仅在搜索/清空时提交，避免每次击键都请求）
  const [keyword, setKeyword] = useState('');
  // 统计概览（总数/运行中/失败/今日新增）
  const [stats, setStats] = useState({ total: 0, running: 0, failed: 0, todayCreated: 0 });
  // 批量选中的任务 ID
  const [selectedIds, setSelectedIds] = useState([]);

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
        sort: sort.field ? `${sort.order === 'descend' ? '-' : ''}${sort.field}` : undefined,
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
  }, [pagination, crawlTypeFilter, statusFilter, keyword, sort]);

  // 统计概览：随列表数据一起刷新（轮询时也同步）
  const fetchStats = useCallback(async () => {
    try {
      const response = await taskApi.getStats();
      setStats(response.data.data);
    } catch {
      // 静默失败，统计卡不阻塞主流程
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchStats();
  }, [fetchTasks, fetchStats]);

  // 存在活动任务时每 5s 静默轮询；全部进入终态后自动停止，避免无意义请求
  const hasActiveTask = tasks.some((t) => ACTIVE_STATUSES.includes(t.status));
  useEffect(() => {
    if (!hasActiveTask) return undefined;
    const timer = setInterval(() => {
      fetchTasks({ silent: true });
      fetchStats();
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [hasActiveTask, fetchTasks, fetchStats]);

  // 通用任务操作封装：调用 API → 成功提示 → 刷新列表与统计
  const runTaskAction = useCallback(async (actionFn, successText) => {
    try {
      await actionFn();
      message.success(successText);
      fetchTasks();
      fetchStats();
      return true;
    } catch (error) {
      console.error('Task action failed:', error);
      message.error(error.response?.data?.message || '操作失败');
      return false;
    }
  }, [fetchTasks, fetchStats]);

  const deleteTask = useCallback((id) => runTaskAction(() => taskApi.delete(id), '任务删除成功'), [runTaskAction]);
  // 批量删除：Promise.all 并发，部分失败仍继续并汇报
  const batchDelete = useCallback(async (ids) => {
    const results = await Promise.allSettled(ids.map((id) => taskApi.delete(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    if (succeeded > 0) message.success(`成功删除 ${succeeded} 个任务${failed > 0 ? `，${failed} 个失败` : ''}`);
    else message.error('批量删除失败');
    setSelectedIds([]);
    fetchTasks();
    fetchStats();
    return failed === 0;
  }, [fetchTasks, fetchStats]);
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
    stats,
    selectedIds,
    setSelectedIds,
    sort,
    setSort,
    fetchTasks,
    deleteTask,
    batchDelete,
    startTask,
    pauseTask,
    cancelTask,
    retryTask,
  };
}

export default useTasks;
