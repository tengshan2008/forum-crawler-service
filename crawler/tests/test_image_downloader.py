"""image_downloader.download_images（C3 并发下载）测试。

用 threading.Barrier 验证批量内真正并发：串行执行时 Barrier 必然超时。
"""
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import image_downloader  # noqa: E402


def test_download_images_结果顺序与输入一致(monkeypatch):
    monkeypatch.setattr(
        image_downloader, 'download_image',
        lambda url, task_id, max_retries=3: {'success': True, 'local_path': f'/p/{url}'},
    )

    urls = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']  # 跨两个批次
    results = image_downloader.download_images(urls, 't1')

    assert [r['local_path'] for r in results] == [f'/p/{u}' for u in urls]


def test_download_images_批量内真正并发(monkeypatch):
    # 同批 5 张图必须同时在线程中执行；若仍是串行，Barrier 会超时报错
    barrier = threading.Barrier(5, timeout=5)

    def fake_download(url, task_id, max_retries=3):
        barrier.wait()
        return {'success': True, 'local_path': url}

    monkeypatch.setattr(image_downloader, 'download_image', fake_download)

    results = image_downloader.download_images(['u0', 'u1', 'u2', 'u3', 'u4'], 't1')

    assert all(r['success'] for r in results)
    assert [r['local_path'] for r in results] == ['u0', 'u1', 'u2', 'u3', 'u4']


def test_download_images_下载失败结果也保持顺序(monkeypatch):
    def fake_download(url, task_id, max_retries=3):
        if url == 'bad':
            return {'success': False, 'local_path': None, 'error': 'timeout'}
        return {'success': True, 'local_path': f'/p/{url}'}

    monkeypatch.setattr(image_downloader, 'download_image', fake_download)

    results = image_downloader.download_images(['a', 'bad', 'c'], 't1')

    assert [r['success'] for r in results] == [True, False, True]


def test_download_images_空输入返回空列表():
    assert image_downloader.download_images([], 't1') == []
    assert image_downloader.download_images(None, 't1') == []
