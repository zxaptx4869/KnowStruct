# KnowStruct 第一版低保真原型

本目录用于评审整体信息架构、页面布局和核心交互，不是正式产品实现。原型仅使用原生 HTML、CSS、JavaScript 和本地模拟数据，不请求 API、数据库、OCR 或 AI Provider。

## 打开方式

推荐在仓库根目录启动静态服务器：

```bash
python3 -m http.server 4173 --directory docs/prototypes/low-fi/prototype
```

然后访问：

```text
http://127.0.0.1:4173/
```

也可以直接打开 `prototype/index.html`。使用 HTTP 服务时，浏览器地址、导航和自动截图更稳定。

## 原型导航

- 顶部“桌面端 / 移动端”切换两种预览模式。
- 页面选择器可直达 D00-D09、M00-M08。
- 页面内的蓝色按钮、列表项、目录节点、来源入口均可点击。
- “状态面板”可查看空状态、上传中、OCR/AI 处理中、失败重试、部分拒绝、无结果和来源失效等状态。
- 原型会通过 URL 参数保存当前页面，例如 `?view=desktop&page=D05`。

登录为本地交互模拟：任意非空账号和密码可进入项目列表；账号或密码输入 `wrong` 可查看统一错误状态。原型不会发送或保存登录信息。

## 交付内容

- `information-architecture.md`：信息架构、对象边界、端侧职责与页面映射。
- `interaction-flows.md`：采集、确认、查询、搜索、Review 流程及状态矩阵。
- `review-decisions.md`：需要逐项确认的产品决定。
- `prototype/`：可点击低保真原型。
- `screenshots/desktop/`：D00-D09，1440 x 900 PNG。
- `screenshots/mobile/`：M00-M08，390 x 844 PNG。

## 原型边界

- P0 聚焦“采集 → 提取 → 人工确认 → 归档 → 查询/搜索 → 来源追溯”。
- P0 使用已有账号和密码登录；不提供注册、找回密码或第三方登录原型。
- Review 提供 P1 方向稿与导航位置；决策和预算仅保留方向稿与导航位置，功能已暂缓（2026-08-07 决定），原型不代表当前优先级。
- AI 只生成候选 Extraction，用户接受后才创建正式 Entry。
- P0 使用多级目录树，不包含知识图谱画布。
- 所有内容均为本地模拟数据，不代表已实现功能。
