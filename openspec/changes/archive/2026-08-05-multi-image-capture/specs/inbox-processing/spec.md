## MODIFIED Requirements

### Requirement: Responsive capture entry points

系统 SHALL 在桌面和 390px 移动视口提供同一套采集能力：全局"采集"入口支持文字、链接与图片采集；项目内"添加资料"入口复用同一采集箱并预选该项目。三种方式的提交动作统一为"开始提取"：文字 / 链接提交即入队，图片在客户端选齐（最多 3 张、可移除）后由用户点击"开始提取"一次性提交；提交中 MUST 阻止重复提交；明确失败 MUST 保留用户输入与已选图片。

#### Scenario: Capture from the global entry
- **WHEN** 桌面或移动用户从全局导航进入采集箱并提交文字、链接或图片
- **THEN** 界面保存成功后展示处理时间线，处理中可离开页面

#### Scenario: Capture with a preselected project
- **WHEN** 用户从项目页的"添加资料"入口进入采集箱
- **THEN** 采集表单预选该项目，Source 归属于该项目，且不出现第二套采集数据

#### Scenario: Start extraction for text or link
- **WHEN** 用户填写文字或链接后点击"开始提取"
- **THEN** 系统保存 Source 并立即入队处理，按钮文案与行为与其他采集方式一致

#### Scenario: Start extraction for a multi-image capture
- **WHEN** 用户已选择 1-3 张图片后点击"开始提取"
- **THEN** 系统一次性上传整批并创建 OCR 阶段任务，成功后展示处理时间线

#### Scenario: Prevent duplicate capture submission
- **WHEN** 一个采集请求仍在处理中
- **THEN** 界面显示提交中状态并阻止重复提交

#### Scenario: Preserve capture input after a known failure
- **WHEN** 采集请求明确失败（如校验错误或网络失败）
- **THEN** 界面保留已输入的内容、链接、图片文件与项目选择，显示可执行的错误提示，并允许修正后重试
