"""暂停闸门纯逻辑（无第三方依赖，可被 pytest 直接覆盖）。

爬虫在帖子/分页等安全边界调用 ``wait_while_paused``：
- 任务状态为 ``paused`` 时阻塞（轮询，不发起任何抓取请求），恢复后继续；
- 状态以外部存储（MongoDB crawlertasks 文档）为事实来源，执行节点与 API 节点分离时同样生效；
- 读取异常按"无法判定"处理：入口处放行（避免数据库抖动冻死爬虫），
  等待期间视为仍需等待（下一轮询周期复查）。

``read_state`` 为注入的状态读取函数，返回 ``(exists, status)``：
- ``exists=False`` 任务已删除；
- ``status`` 为任务状态字符串；读取异常时调用方返回 ``(True, None)``。
"""
import time

# 默认轮询间隔（秒）
DEFAULT_POLL_INTERVAL = 3


def wait_while_paused(
    read_state,
    poll_interval=DEFAULT_POLL_INTERVAL,
    sleep=time.sleep,
    on_pause=None,
    on_resume=None,
):
    """状态为 paused 时阻塞等待，返回是否经历过暂停。

    - 入口非 paused（含读取异常/任务不存在）：立即返回 ``False``，不触发回调；
    - 入口 paused：调用一次 ``on_pause`` 后轮询；状态变为非 paused 或任务消失时
      调用一次 ``on_resume`` 并返回 ``True``。
    """
    exists, status = read_state()
    if not exists or status != 'paused':
        return False

    if on_pause is not None:
        on_pause()

    while True:
        sleep(poll_interval)
        exists, status = read_state()
        if not exists:
            # 任务被删除：不再等待（爬虫外层随后自然结束）
            if on_resume is not None:
                on_resume()
            return True
        if status is None:
            # 读取异常：保持等待，下个周期复查
            continue
        if status != 'paused':
            if on_resume is not None:
                on_resume()
            return True
