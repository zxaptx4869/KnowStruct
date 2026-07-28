"""物化路径 (Materialized Path) 工具函数

使用普通字符串字段存储树形路径（MySQL 兼容）。
路径格式: "root.child1.child2" (用 . 分隔)
查询子树用 LIKE 'path.%'，查询祖先用 IN 或逐个截取路径前缀。
"""


def path_to_labels(path: str) -> list[str]:
    """将路径字符串转为标签列表"""
    return path.split(".") if path else []


def labels_to_path(labels: list[str]) -> str:
    """将标签列表转为路径字符串"""
    return ".".join(labels)


def parent_path(path: str) -> str:
    """获取父路径"""
    parts = path.split(".")
    return ".".join(parts[:-1]) if len(parts) > 1 else ""


def depth(path: str) -> int:
    """获取路径深度（从 0 开始）"""
    return path.count(".") if path else 0


def is_ancestor(ancestor: str, descendant: str) -> bool:
    """判断 ancestor 是否是 descendant 的祖先"""
    return descendant.startswith(ancestor + ".")


def is_descendant_or_self(ancestor: str, descendant: str) -> bool:
    """判断 ancestor 是否是 descendant 的祖先或自身"""
    return descendant == ancestor or is_ancestor(ancestor, descendant)
