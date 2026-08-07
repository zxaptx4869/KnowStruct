## MODIFIED Requirements

### Requirement: Confirm AI candidate findings

AI 审查产出 SHALL 一律保存为候选发现（duplicate/conflict），用户 MUST 逐条确认或拒绝后才改变状态：确认后进入 Review 待处理列表，拒绝即丢弃。已确认且未处理的配对在后续扫描中 MUST 不重复生成候选；已拒绝的配对可再次生成候选；已确认但被标记已解决/忽略的配对，若后续扫描仍检测到同一问题（数据未修复），MUST 清除处理记录并让该问题重新出现在待处理列表。候选操作 MUST 幂等。

#### Scenario: Confirm a candidate finding
- **WHEN** 用户确认某条 AI 候选发现
- **THEN** 该发现状态变为 open，并出现在 Review 待处理列表

#### Scenario: Reject a candidate finding
- **WHEN** 用户拒绝某条 AI 候选发现
- **THEN** 该发现状态变为 rejected，不再出现在任何列表

#### Scenario: Skip confirmed unhandled pairs on re-scan
- **WHEN** 后续扫描再次发现同一配对，且原发现已确认但没有任何处理记录
- **THEN** 系统不重复生成候选，该问题继续保留在待处理列表

#### Scenario: Re-surface handled findings on re-scan
- **WHEN** 某问题曾被标记已解决或忽略，后续扫描仍检测到同一配对且相关记录未被修复
- **THEN** 系统清除该问题的处理记录，问题重新出现在待处理列表

#### Scenario: Regenerate after rejection
- **WHEN** 同一配对曾被拒绝，后续扫描再次发现
- **THEN** 系统可再次生成该候选

#### Scenario: Repeated decision is idempotent
- **WHEN** 用户对同一候选重复提交相同决定
- **THEN** 状态保持不变，不产生副作用
