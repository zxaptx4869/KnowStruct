## Why

搜索页目前把「项目」和「节点」拆成两个独立下拉：要先选项目、再选节点，跨项目调整或
只想选项目时操作链路长、容易选错。Review 页的「审查范围」选择器把项目与节点合并为
树形单选（项目行 + 展开节点），交互更紧凑直观。搜索页应沿用同一交互，降低筛选成本。

## What Changes

- 将 Review 页的 ScopePicker 抽取为共享组件 `components/ScopePicker.tsx`，增加
  `placeholder` 与 `allowClear` 选项；Review 页行为保持不变。
- 搜索页筛选条由「项目 + 类型 + 节点」三个控件改为「范围 + 类型」两个控件：
  范围选择器支持「全部项目 / 项目 / 项目内节点」单选，展开项目后按树形选择节点，
  切换项目时清空已选节点，并提供一键回到「全部项目」。
- URL 参数与后端接口不变（`project` / `type` / `node`），触发语义、历史记录语义不变。

## Capabilities

### New Capabilities

（无，不引入新能力域）

### Modified Capabilities

- `search-and-trace-source`: 修改「Search page filter interaction」要求，
  将项目与节点筛选合并为范围选择器交互，保留 URL 持久化、立即重搜、清除筛选与移动端适配。

## Impact

- 前端：新增 `frontend/src/components/ScopePicker.tsx`（由 `review/ScopePicker.tsx` 迁移并泛化）；
  `frontend/src/pages/ReviewPage.tsx` 与 `SearchPage.tsx` 更新引用与接入；
  筛选条样式复用现有 `review-scope-*` CSS。
- 测试：SearchPage 测试改为范围选择器交互；ReviewPage 测试回归确认不受影响。
- 后端与数据模型：无改动、无迁移。
- 依赖的主规格：`openspec/specs/search-and-trace-source/spec.md`。

## Appetite

小切片，约半天（含测试与桌面/移动真实验收）。

## Non-Goals

- 不改后端筛选参数与校验语义。
- 不改变类型筛选控件、URL 参数命名、历史记录与触发语义。
- 不调整 Review 页现有的范围选择行为（仅迁移组件位置）。
