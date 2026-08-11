"""key_params / risk_points 的共享规范化与校验规则。"""

from __future__ import annotations

MAX_KEY_PARAMS = 20
MAX_KEY_PARAM_NAME = 50
MAX_KEY_PARAM_VALUE = 500
MAX_RISK_POINTS = 10
MAX_RISK_POINT_LENGTH = 200


def normalize_key_params(value: object) -> dict[str, str] | None:
    """把 AI/用户提交的关键参数规范化为 dict[str, str]；非法结构抛 ValueError。"""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("关键参数必须是键值对对象")  # noqa: TRY004 - Pydantic 校验器惯例
    cleaned: dict[str, str] = {}
    for raw_key, raw_value in value.items():
        key = str(raw_key).strip()
        if isinstance(raw_value, (str, int, float)):
            item = str(raw_value).strip()
        else:
            raise ValueError("关键参数的值必须是文本")  # noqa: TRY004 - Pydantic 校验器惯例
        if not key or not item:
            continue
        if len(key) > MAX_KEY_PARAM_NAME:
            raise ValueError(f"参数名不能超过 {MAX_KEY_PARAM_NAME} 字符")
        if len(item) > MAX_KEY_PARAM_VALUE:
            raise ValueError(f"参数值不能超过 {MAX_KEY_PARAM_VALUE} 字符")
        cleaned[key] = item
    if len(cleaned) > MAX_KEY_PARAMS:
        raise ValueError(f"关键参数最多 {MAX_KEY_PARAMS} 项")
    return cleaned or None


def normalize_risk_points(value: object) -> list[str] | None:
    """把 AI/用户提交的避坑要点规范化为 list[str]；超限抛 ValueError。"""
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("避坑要点必须是列表")  # noqa: TRY004 - Pydantic 校验器惯例
    cleaned: list[str] = []
    for raw_item in value:
        if not isinstance(raw_item, str):
            raise ValueError("避坑要点必须是文本")  # noqa: TRY004 - Pydantic 校验器惯例
        item = raw_item.strip()
        if not item:
            continue
        if len(item) > MAX_RISK_POINT_LENGTH:
            raise ValueError(f"每条避坑要点不能超过 {MAX_RISK_POINT_LENGTH} 字符")
        cleaned.append(item)
    if len(cleaned) > MAX_RISK_POINTS:
        raise ValueError(f"避坑要点最多 {MAX_RISK_POINTS} 条")
    return cleaned or None
