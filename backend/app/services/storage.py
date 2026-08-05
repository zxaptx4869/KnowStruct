"""附件存储抽象与本地实现。"""

from __future__ import annotations

import asyncio
import mimetypes
import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from app.config import get_settings

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class AttachmentStorage(ABC):
    """附件存储抽象；P0 使用本地实现，OSS 接入位保留。"""

    @abstractmethod
    async def save(
        self,
        *,
        workspace_id: str,
        source_id: str,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> tuple[str, int]:
        """保存附件，返回 (object_key, size)。"""

    @abstractmethod
    async def read(
        self,
        *,
        workspace_id: str,
        source_id: str,
        object_key: str,
    ) -> bytes | None:
        """读取附件字节；不存在返回 None。"""

    @abstractmethod
    async def delete(
        self,
        *,
        workspace_id: str,
        source_id: str,
        object_key: str,
    ) -> None:
        """删除附件。"""


class LocalAttachmentStorage(AttachmentStorage):
    """本地目录存储：{STORAGE_DIR}/{workspace_id}/{source_id}/{uuid}{ext}。"""

    def __init__(self) -> None:
        self._root = Path(get_settings().STORAGE_DIR).resolve()

    def _path(
        self,
        *,
        workspace_id: str,
        source_id: str,
        object_key: str,
    ) -> Path:
        # object_key 由本服务生成；防御性拒绝路径穿越。
        safe_key = Path(object_key).name
        return self._root / workspace_id / source_id / safe_key

    async def save(
        self,
        *,
        workspace_id: str,
        source_id: str,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> tuple[str, int]:
        extension = _EXT_BY_MIME.get(content_type) or (
            mimetypes.guess_extension(content_type) or ".bin"
        )
        object_key = f"{uuid.uuid4().hex}{extension}"
        target = self._root / workspace_id / source_id / object_key

        def _write() -> None:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)

        await asyncio.to_thread(_write)
        return object_key, len(data)

    async def read(
        self,
        *,
        workspace_id: str,
        source_id: str,
        object_key: str,
    ) -> bytes | None:
        path = self._path(
            workspace_id=workspace_id,
            source_id=source_id,
            object_key=object_key,
        )
        if not path.is_file():
            return None
        return await asyncio.to_thread(path.read_bytes)

    async def delete(
        self,
        *,
        workspace_id: str,
        source_id: str,
        object_key: str,
    ) -> None:
        path = self._path(
            workspace_id=workspace_id,
            source_id=source_id,
            object_key=object_key,
        )

        def _remove() -> None:
            if path.is_file():
                path.unlink()
            parent = path.parent
            while parent != self._root and parent.is_dir():
                if any(parent.iterdir()):
                    break
                shutil.rmtree(parent, ignore_errors=True)
                parent = parent.parent

        await asyncio.to_thread(_remove)


_instance: AttachmentStorage | None = None


def get_attachment_storage() -> AttachmentStorage:
    global _instance
    if _instance is None:
        _instance = LocalAttachmentStorage()
    return _instance
