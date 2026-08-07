## Why

AI 发现的"已解决/忽略"当前会永久隐藏问题，即使知识库数据未修复（例如确认重复后未合并记录）。下次扫描因去重逻辑跳过同配对，问题不再浮现，Review 失去"体检"真实性。本修订让已处理但数据未修复的问题在下次扫描时重新出现。

## What Changes

- 扫描去重逻辑区分三种状态：已确认且未处理的配对跳过（本就在待处理）；已解决/忽略的配对清除处理记录、重新出现在待处理列表（无需再次确认）；已拒绝的配对维持现状（重新生成为候选）。
- 行为前提不变：用户真正修复数据（合并/删除其中一条记录）后，发现随记录级联消失，下次扫描自然不再出现。
- 无数据模型变更、无迁移、无前端改动（重新浮现直接复用待处理列表展示）。

## Capabilities

### New Capabilities

### Modified Capabilities
- `review`: 修订"Confirm AI candidate findings"需求——重复候选跳过限定为已确认未处理；新增"已处理问题在数据未修复时重新浮现"场景。

## Impact

- 后端：`app/services/review_scan.py` 去重分支检查并清除处理记录；`backend/tests/test_review_scan_api.py` 新增重新浮现测试。
- 主规格：实现后更新 `openspec/specs/review/spec.md`。
