"""lib/pause_gate 暂停闸门纯逻辑测试（仅依赖标准库，CI 无 requests/pymongo 也可运行）"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.pause_gate import wait_while_paused  # noqa: E402


def test_状态为running时立即放行且不等待不触发回调():
    sleeps = []
    events = []
    result = wait_while_paused(
        lambda: (True, 'running'),
        sleep=sleeps.append,
        on_pause=lambda: events.append('pause'),
        on_resume=lambda: events.append('resume'),
    )
    assert result is False
    assert sleeps == []
    assert events == []


def test_状态为pending时同样立即放行():
    result = wait_while_paused(lambda: (True, 'pending'))
    assert result is False


def test_paused后轮询到running才恢复_暂停与恢复回调各一次():
    states = [(True, 'paused'), (True, 'paused'), (True, 'running')]
    sleeps = []
    events = []

    result = wait_while_paused(
        lambda: states.pop(0),
        poll_interval=3,
        sleep=sleeps.append,
        on_pause=lambda: events.append('pause'),
        on_resume=lambda: events.append('resume'),
    )

    assert result is True
    assert sleeps == [3, 3]  # 恢复前轮询两次
    assert events == ['pause', 'resume']


def test_等待期间读取异常返回None时继续等待直到恢复():
    states = [(True, 'paused'), (True, None), (True, 'running')]
    sleeps = []
    result = wait_while_paused(lambda: states.pop(0), sleep=sleeps.append)
    assert result is True
    assert sleeps == [3, 3]


def test_入口读取异常None时放行_避免数据库抖动冻死爬虫():
    result = wait_while_paused(lambda: (True, None))
    assert result is False


def test_入口任务已删除时立即放行():
    result = wait_while_paused(lambda: (False, None))
    assert result is False


def test_等待期间任务被删除时结束等待并触发恢复回调():
    states = [(True, 'paused'), (False, None)]
    events = []
    result = wait_while_paused(
        lambda: states.pop(0),
        on_pause=lambda: events.append('pause'),
        on_resume=lambda: events.append('resume'),
    )
    assert result is True
    assert events == ['pause', 'resume']
