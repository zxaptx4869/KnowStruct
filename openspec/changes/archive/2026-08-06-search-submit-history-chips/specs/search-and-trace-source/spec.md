## ADDED Requirements

### Requirement: Search is triggered by explicit submit

搜索页 SHALL 仅在用户显式提交时发起搜索：点击"搜索"按钮、在输入框按回车（且输入法不在组合状态）、或点击最近搜索标签。输入内容变化 MUST 不自动发起请求。带 `?q=` 打开页面 SHALL 自动执行一次搜索。搜索结果展示后用户修改输入框但未提交时 SHALL 保留上一次结果与 URL 关键词；输入框清空时 SHALL 回到空态。空关键词提交 SHALL 显示提示且不发起请求。

#### Scenario: Search only on explicit submit
- **WHEN** 用户输入关键词但未点击搜索按钮、未按回车
- **THEN** 页面不发起任何搜索请求，也不进入加载态

#### Scenario: Submit with the search button
- **WHEN** 用户点击"搜索"按钮且输入框非空
- **THEN** 页面以当前输入发起搜索，并在成功后按规则记录历史

#### Scenario: Submit with the Enter key
- **WHEN** 用户在输入框按回车且输入法不在组合状态
- **THEN** 页面以当前输入发起搜索

#### Scenario: Ignore Enter during IME composition
- **WHEN** 输入法组合进行中用户在输入框按回车
- **THEN** 页面不发起搜索请求，该回车不改变搜索状态

#### Scenario: Restore a search from the URL
- **WHEN** 用户打开带 `?q=关键词` 的搜索页
- **THEN** 页面自动执行一次该关键词的搜索

#### Scenario: Keep previous results while editing
- **WHEN** 搜索结果已展示且用户修改输入框但未提交
- **THEN** 页面保留上一次结果与 URL 关键词，不发起新请求

#### Scenario: Reset to idle when clearing the input
- **WHEN** 用户将输入框清空
- **THEN** 页面回到空态（引导或最近搜索），不再展示旧结果

#### Scenario: Hint on empty submit
- **WHEN** 输入框为空或仅含空白时用户点击搜索或按回车
- **THEN** 页面显示"请输入搜索关键词"类提示，不发起任何请求
