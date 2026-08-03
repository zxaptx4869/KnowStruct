const screens = {
  desktop: [
    ["D00", "账号密码登录"],
    ["D01", "项目列表"],
    ["D02", "项目工作区与知识目录"],
    ["D03", "节点详情与正式记录"],
    ["D04", "采集箱和处理队列"],
    ["D05", "AI 提取确认"],
    ["D06", "搜索结果和来源追溯"],
    ["D07", "来源详情预览"],
    ["D08", "Review 冲突处理（P1）"],
    ["D09", "决策与预算位置（P1）"],
  ],
  mobile: [
    ["M00", "账号密码登录"],
    ["M01", "项目列表"],
    ["M02", "快速采集入口"],
    ["M03", "采集完成和处理状态"],
    ["M04", "待确认队列"],
    ["M05", "AI 提取逐条确认"],
    ["M06", "知识节点详情"],
    ["M07", "搜索和结果列表"],
    ["M08", "原始来源预览"],
  ],
};

const state = {
  view: "desktop",
  page: "D01",
  captureMode: "image",
  drawerOpen: false,
  stateOpen: false,
  toast: "",
  candidateDecisions: {},
  retried: false,
  searchTerm: "冰箱",
  loginError: "",
};

const root = document.getElementById("prototype-root");

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("page");
  const requestedView = params.get("view");
  const inferredView = requestedPage?.startsWith("M") ? "mobile" : "desktop";
  state.view = requestedView === "mobile" || requestedView === "desktop" ? requestedView : inferredView;
  const available = screens[state.view].map(([id]) => id);
  state.page = available.includes(requestedPage) ? requestedPage : available[0];
}

function pageTitle(id) {
  for (const group of Object.values(screens)) {
    const found = group.find(([screenId]) => screenId === id);
    if (found) return found[1];
  }
  return "低保真页面";
}

function setPage(page, mode = page.startsWith("M") ? "mobile" : "desktop") {
  state.page = page;
  state.view = mode;
  state.drawerOpen = false;
  const params = new URLSearchParams(window.location.search);
  params.set("view", mode);
  params.set("page", page);
  history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
  render();
}

function prototypeBar() {
  const options = screens[state.view]
    .map(([id, title]) => `<option value="${id}" ${state.page === id ? "selected" : ""}>${id} · ${title}</option>`)
    .join("");
  return `
    <header class="prototype-bar" aria-label="低保真原型工具栏">
      <div class="prototype-title">KnowStruct · 第一版低保真原型</div>
      <div class="mode-switch" aria-label="设备预览">
        <button data-view="desktop" class="${state.view === "desktop" ? "active" : ""}">桌面端</button>
        <button data-view="mobile" class="${state.view === "mobile" ? "active" : ""}">移动端</button>
      </div>
      <select class="screen-select" aria-label="选择原型页面" data-screen-select>${options}</select>
      <div class="prototype-actions">
        <button class="prototype-action" data-state-panel>状态面板</button>
      </div>
    </header>`;
}

function globalNav(active = "projects") {
  return `
    <aside class="global-nav">
      <div class="brand"><span class="brand-mark">KS</span><span>KnowStruct</span></div>
      <nav class="nav-list" aria-label="全局导航">
        <button class="nav-item ${active === "projects" ? "active" : ""}" data-nav="D01"><span class="nav-icon">▦</span>项目</button>
        <button class="nav-item ${active === "inbox" ? "active" : ""}" data-nav="D04"><span class="nav-icon">⇩</span>采集箱<span class="nav-count">8</span></button>
        <button class="nav-item ${active === "search" ? "active" : ""}" data-nav="D06"><span class="nav-icon">⌕</span>搜索</button>
        <button class="nav-item ${active === "review" ? "active" : ""}" data-nav="D08"><span class="nav-icon">◇</span>Review <span class="p1-tag">P1</span><span class="nav-count">5</span></button>
      </nav>
      <div class="nav-foot">
        <button class="nav-item" data-nav="D00"><span class="nav-icon">⇥</span>退出登录</button>
      </div>
    </aside>`;
}

function desktopTopbar(id, title, options = {}) {
  const crumbs = options.crumbs ? `<div class="crumbs">${options.crumbs}</div>` : "";
  const actions = options.actions || "";
  return `
    <header class="topbar">
      <span class="page-id">${id}</span>
      <h1>${title}</h1>
      ${crumbs}
      <div class="topbar-actions">${actions}</div>
    </header>`;
}

function desktopShell({ id, title, active, body, crumbs = "", actions = "" }) {
  return `
    <div class="desktop-app">
      ${globalNav(active)}
      <main class="desktop-main">
        ${desktopTopbar(id, title, { crumbs, actions })}
        ${body}
      </main>
    </div>`;
}

function projectTabs(active = "目录") {
  const tabs = [
    ["目录", "D02", ""],
    ["资料", "D04", ""],
    ["记录", "D03", ""],
    ["Review", "D08", "P1"],
    ["决策", "D09", "P1"],
    ["预算", "D09", "P1"],
  ];
  return `<nav class="project-tabs" aria-label="项目工作区导航">${tabs
    .map(
      ([label, target, phase]) => `
        <button class="project-tab ${active === label ? "active" : ""}" data-nav="${target}">
          ${label}${phase ? `<span class="p1-tag">${phase}</span>` : ""}
        </button>`,
    )
    .join("")}</nav>`;
}

function treePanel(active = "冰箱", variant = "tree") {
  if (variant === "filters") {
    return `
      <aside class="context-panel">
        <div class="context-head">
          <div class="context-title">搜索筛选</div>
          <div class="context-subtitle">结果会同时保留节点与来源路径</div>
        </div>
        <div class="filter-scroll">
          <div class="filter-group"><h3>项目</h3>
            <label class="check-row"><input type="checkbox" checked /> 新房装修 <span class="tree-meta">12</span></label>
            <label class="check-row"><input type="checkbox" /> 日本旅行 <span class="tree-meta">2</span></label>
          </div>
          <div class="filter-group"><h3>类型</h3>
            <label class="check-row"><input type="checkbox" checked /> 避坑</label>
            <label class="check-row"><input type="checkbox" checked /> 参数</label>
            <label class="check-row"><input type="checkbox" /> 商品</label>
            <label class="check-row"><input type="checkbox" /> 经验</label>
          </div>
          <div class="filter-group"><h3>状态</h3>
            <label class="check-row"><input type="checkbox" checked /> 已归档</label>
            <label class="check-row"><input type="checkbox" /> 有冲突</label>
          </div>
          <button class="btn small">清除筛选</button>
        </div>
      </aside>`;
  }

  return `
    <aside class="context-panel">
      <div class="context-head">
        <div class="context-title">新房装修 <span class="badge">进行中</span></div>
        <div class="context-subtitle">知识目录 · 28 个节点 · 47 条正式记录</div>
        <div class="context-tools">
          <input class="input" aria-label="筛选知识目录" placeholder="筛选目录" />
          <button class="btn icon-btn" title="新增目录节点">+</button>
        </div>
      </div>
      <div class="tree-scroll" role="tree">
        <button class="tree-row"><span class="tree-caret">▼</span><span>硬装施工</span><span class="tree-meta">12</span></button>
        <button class="tree-row level-1"><span class="tree-caret">▶</span><span>水电</span><span class="tree-meta">4</span></button>
        <button class="tree-row level-1"><span class="tree-caret">▶</span><span>墙面与地面</span><span class="tree-meta">8</span></button>
        <button class="tree-row"><span class="tree-caret">▼</span><span>家具家电</span><span class="tree-meta">19</span></button>
        <button class="tree-row level-1"><span class="tree-caret">▼</span><span>大家电</span><span class="tree-meta">11</span></button>
        <button class="tree-row level-2 ${active === "冰箱" ? "active" : ""}" data-nav="D03"><span class="tree-caret"></span><span>冰箱</span><span class="tree-meta">6</span></button>
        <button class="tree-row level-2"><span class="tree-caret"></span><span>洗衣机</span><span class="tree-meta">3</span></button>
        <button class="tree-row level-2"><span class="tree-caret"></span><span>空调</span><span class="tree-meta">2</span></button>
        <button class="tree-row level-1"><span class="tree-caret">▶</span><span>家具</span><span class="tree-meta">8</span></button>
        <button class="tree-row"><span class="tree-caret">▶</span><span>预算与采购</span><span class="tree-meta">9</span></button>
        <button class="tree-row"><span class="tree-caret">▶</span><span>施工验收</span><span class="tree-meta">7</span></button>
      </div>
      <div class="nav-foot"><button class="btn small" style="width:100%">管理目录结构</button></div>
    </aside>`;
}

function sourceDrawer() {
  if (!state.drawerOpen) return "";
  return `
    <div class="drawer-backdrop" data-close-drawer>
      <aside class="drawer" role="dialog" aria-label="来源预览" data-drawer-body>
        <div class="drawer-head">
          <span class="badge">Source</span><h2>零嵌冰箱安装避坑截图</h2>
          <button class="btn icon-btn small" data-close-drawer title="关闭">×</button>
        </div>
        <div class="drawer-body">
          <div class="source-preview">
            <div class="fake-shot">
              <div class="fake-shot-title">装修避坑｜零嵌冰箱怎么留尺寸</div>
              <p>不要只看“零嵌”两个字，先看清楚产品的散热方式。</p>
              <p class="highlight">底部散热型号左右通常只需少量安装余量，但顶部和背部仍需按安装图预留。</p>
              <p>普通两侧散热冰箱需要更大的侧边空间，不能照搬零嵌尺寸。</p>
            </div>
          </div>
          <div class="source-meta">
            <div><strong>来源类型：</strong>截图</div>
            <div><strong>采集时间：</strong>2026-08-02 21:14</div>
            <div><strong>处理结果：</strong>3 条候选，2 条已归档，1 条已拒绝</div>
          </div>
          <div style="margin-top:14px;display:flex;gap:8px">
            <button class="btn primary" data-nav="D07">打开来源详情</button>
            <button class="btn" data-close-drawer>返回记录</button>
          </div>
        </div>
      </aside>
    </div>`;
}

function d00() {
  return `
    <main class="login-screen desktop-login">
      <span class="page-id auth-page-id">D00</span>
      <section class="login-panel" aria-labelledby="desktop-login-title">
        <div class="login-brand"><span class="brand-mark">KS</span><span>KnowStruct</span></div>
        <div class="login-heading">
          <h1 id="desktop-login-title">登录 KnowStruct</h1>
          <p>使用已有账号进入你的项目和知识目录。</p>
        </div>
        <div class="login-form">
          <label class="login-field"><span>账号</span><input class="input" data-login-account autocomplete="username" placeholder="请输入账号" /></label>
          <label class="login-field"><span>密码</span><input class="input" data-login-password type="password" autocomplete="current-password" placeholder="请输入密码" /></label>
          <label class="remember-row"><input type="checkbox" /> <span>保持登录</span></label>
          ${state.loginError ? `<div class="login-error" role="alert">${state.loginError}</div>` : ""}
          <button class="btn primary login-submit" data-login-submit="desktop">登录</button>
        </div>
        <div class="login-boundary">当前版本仅支持已有账号登录。注册将在后续版本提供。</div>
      </section>
    </main>`;
}

function d01() {
  return desktopShell({
    id: "D01",
    title: "项目",
    active: "projects",
    actions: `<button class="btn">导入项目</button><button class="btn primary" data-toast="创建项目表单属于下一轮细化">+ 创建项目</button>`,
    body: `
      <div class="content-scroll page-pad">
        <div class="page-intro">
          <div><h2>我的项目</h2><p>每个项目独立维护知识目录、资料、正式记录和后续决策。</p></div>
        </div>
        <div class="summary-strip">
          <div class="summary-item"><div class="summary-label">进行中的项目</div><div class="summary-value">2</div><div class="summary-note">新房装修、日本旅行</div></div>
          <div class="summary-item"><div class="summary-label">待确认资料</div><div class="summary-value">8</div><div class="summary-note">其中 2 项处理失败</div></div>
          <div class="summary-item"><div class="summary-label">正式记录</div><div class="summary-value">61</div><div class="summary-note">全部可追溯来源</div></div>
          <div class="summary-item"><div class="summary-label">Review 问题</div><div class="summary-value">5</div><div class="summary-note">P1 方向入口</div></div>
        </div>
        <h3 class="section-heading">最近项目 <span class="count">3 个</span></h3>
        <table class="project-table">
          <thead><tr><th style="width:40%">项目</th><th style="width:16%">状态</th><th style="width:16%">目录</th><th style="width:16%">待确认</th><th>最近更新</th></tr></thead>
          <tbody>
            <tr class="click-row" data-nav="D02"><td><div class="primary-line">新房装修</div><div class="secondary-line">施工与采购阶段，重点整理家电参数和安装条件</div></td><td><span class="badge accent">进行中</span></td><td>28 个节点</td><td>6 份资料</td><td>今天 21:14</td></tr>
            <tr class="click-row"><td><div class="primary-line">日本旅行</div><div class="secondary-line">东京、京都 8 日行程与预订信息</div></td><td><span class="badge">规划中</span></td><td>14 个节点</td><td>2 份资料</td><td>昨天</td></tr>
            <tr class="click-row"><td><div class="primary-line">家庭健康记录</div><div class="secondary-line">检查报告、用药和复诊记录</div></td><td><span class="badge">已暂停</span></td><td>9 个节点</td><td>0 份资料</td><td>7 月 20 日</td></tr>
          </tbody>
        </table>
        <div class="empty-inline">
          <div class="empty-symbol">□</div>
          <div><h3>没有项目时</h3><p>仍可先从全局采集箱保存资料；生成正式记录前需要创建或选择项目。</p></div>
          <button class="btn" data-toast="空状态中的创建项目入口">创建第一个项目</button>
        </div>
      </div>`,
  });
}

function d02() {
  return desktopShell({
    id: "D02",
    title: "项目工作区",
    active: "projects",
    crumbs: "新房装修",
    actions: `<button class="btn" data-nav="D04">添加资料</button><button class="btn primary" data-toast="已打开新增目录节点入口">+ 新建节点</button>`,
    body: `
      ${projectTabs("目录")}
      <div class="workspace-grid">
        ${treePanel("")}
        <section class="workspace-content">
          <div class="node-header">
            <div class="node-path">项目概览 / 知识目录</div>
            <h2>新房装修</h2>
            <p>施工与采购阶段 · 28 个目录节点 · 47 条正式记录 · 6 份资料待确认</p>
          </div>
          <div class="page-pad">
            <div class="summary-strip">
              <div class="summary-item"><div class="summary-label">目录节点</div><div class="summary-value">28</div><div class="summary-note">3 级目录</div></div>
              <div class="summary-item"><div class="summary-label">正式记录</div><div class="summary-value">47</div><div class="summary-note">来自 31 份资料</div></div>
              <div class="summary-item"><div class="summary-label">待确认</div><div class="summary-value">6</div><div class="summary-note">含 1 个低置信度项</div></div>
              <div class="summary-item"><div class="summary-label">来源完整率</div><div class="summary-value">100%</div><div class="summary-note">47 / 47 可追溯</div></div>
            </div>
            <h3 class="section-heading">最近整理的节点</h3>
            <table class="data-table">
              <thead><tr><th>节点</th><th style="width:18%">正式记录</th><th style="width:20%">待确认资料</th><th style="width:18%">最近更新</th></tr></thead>
              <tbody>
                <tr class="click-row" data-nav="D03"><td><div class="data-title">家具家电 / 大家电 / 冰箱</div><div class="data-subtitle">尺寸、散热、候选型号与避坑经验</div></td><td>6 条</td><td><span class="badge accent">3 份</span></td><td>今天</td></tr>
                <tr><td><div class="data-title">硬装施工 / 水电</div><div class="data-subtitle">插座定位、回路与验收</div></td><td>4 条</td><td>1 份</td><td>昨天</td></tr>
                <tr><td><div class="data-title">预算与采购 / 主材</div><div class="data-subtitle">报价与采购节奏</div></td><td>5 条</td><td>0 份</td><td>7 月 31 日</td></tr>
              </tbody>
            </table>
            <div class="empty-inline">
              <div class="empty-symbol">＋</div>
              <div><h3>节点没有子节点和记录时</h3><p>可手动添加子节点或资料；AI 起草只能生成待确认目录建议。</p></div>
              <button class="btn">添加第一个节点</button>
            </div>
          </div>
        </section>
      </div>`,
  });
}

function recordRows() {
  return `
    <div class="record-row">
      <div class="record-type"><span class="badge danger">避坑</span></div>
      <div class="record-body"><h3>零嵌冰箱需要先确认散热方式，再决定柜体预留尺寸</h3><p>底部散热和两侧散热的预留要求不同，不能只按“零嵌”名称判断。</p><div class="record-condition">适用条件：嵌入橱柜安装；最终尺寸以具体型号安装图为准。</div></div>
      <button class="record-source" data-open-drawer><strong>Source · 截图</strong><br />零嵌冰箱安装避坑<br />2026-08-02</button>
    </div>
    <div class="record-row">
      <div class="record-type"><span class="badge">参数</span></div>
      <div class="record-body"><h3>当前冰箱位净宽 915mm，净高 1900mm，深度上限 700mm</h3><p>测量结果需要在橱柜复尺后再次确认，并保留插座位置。</p><div class="record-condition">适用条件：厨房方案 V3，未包含墙面完成面误差。</div></div>
      <button class="record-source" data-open-drawer><strong>Source · 文字</strong><br />橱柜复尺现场记录<br />2026-07-30</button>
    </div>
    <div class="record-row">
      <div class="record-type"><span class="badge">商品</span></div>
      <div class="record-body"><h3>候选型号 A：宽 908mm，底部散热，标称容量 501L</h3><p>尺寸初步匹配；需要核对开门角度、插座位置和售后安装要求。</p></div>
      <button class="record-source" data-open-drawer><strong>Source · 链接</strong><br />品牌官网商品页<br />2026-07-29</button>
    </div>`;
}

function d03() {
  return desktopShell({
    id: "D03",
    title: "节点详情与正式记录",
    active: "projects",
    crumbs: "新房装修 / 家具家电 / 大家电 / 冰箱",
    actions: `<button class="btn" data-nav="D04">查看相关资料</button><button class="btn primary" data-toast="已打开手动新增正式记录入口">+ 新建记录</button>`,
    body: `
      ${projectTabs("记录")}
      <div class="workspace-grid">
        ${treePanel("冰箱")}
        <section class="workspace-content">
          <div class="node-header">
            <div class="node-path">新房装修 / 家具家电 / 大家电</div>
            <h2>冰箱</h2>
            <p>6 条正式记录 · 关联 5 个原始来源 · 最近更新于今天 21:14</p>
            <div class="node-toolbar">
              <div class="segmented"><button class="active">全部 6</button><button>经验 2</button><button>参数 2</button><button>商品 1</button><button>避坑 1</button></div>
              <button class="btn small" style="margin-left:auto">排序：最近更新</button>
            </div>
          </div>
          <div class="record-list">${recordRows()}</div>
        </section>
      </div>
      ${sourceDrawer()}`,
  });
}

function inboxContext(active = "待确认") {
  return `
    <aside class="context-panel">
      <div class="context-head"><div class="context-title">处理队列</div><div class="context-subtitle">全局 Source 列表，可按项目过滤</div></div>
      <div class="queue-scroll">
        ${[
          ["全部资料", "12"],
          ["待处理", "1"],
          ["处理中", "2"],
          ["待确认", "6"],
          ["处理失败", "2"],
          ["已归档", "31"],
          ["未分配项目", "3"],
        ]
          .map(([label, count]) => `<button class="tree-row ${active === label ? "active" : ""}"><span>${label}</span><span class="tree-meta">${count}</span></button>`)
          .join("")}
      </div>
      <div class="nav-foot"><div class="object-note">Source 保存后独立存在；处理失败不会丢失原图、链接或文字。</div></div>
    </aside>`;
}

function d04() {
  return desktopShell({
    id: "D04",
    title: "采集箱和处理队列",
    active: "inbox",
    actions: `<button class="btn primary" data-toast="上传面板已就绪：截图、链接或文字">+ 添加资料</button>`,
    body: `
      <div class="workspace-grid">
        ${inboxContext("待确认")}
        <section class="workspace-content inbox-main">
          <div class="capture-drop">
            <div class="capture-icon">⇧</div>
            <div><h3>添加截图、链接或文字</h3><p>可先不选项目；生成正式记录前必须确认项目。</p></div>
            <button class="btn">粘贴链接</button><button class="btn primary">选择文件</button>
          </div>
          <div class="filter-row">
            <input class="input" placeholder="搜索来源标题或原文" />
            <select class="select"><option>全部项目</option><option>新房装修</option><option>未分配项目</option></select>
            <select class="select"><option>全部来源</option><option>截图</option><option>链接</option><option>文字</option></select>
            <button class="btn small" style="margin-left:auto">批量操作</button>
          </div>
          <table class="data-table">
            <thead><tr><th style="width:36%">原始来源</th><th style="width:17%">所属项目</th><th style="width:17%">处理状态</th><th style="width:14%">候选</th><th>操作</th></tr></thead>
            <tbody>
              <tr class="click-row" data-nav="D05"><td><div class="data-title">零嵌冰箱安装避坑截图</div><div class="data-subtitle">截图 · 今天 21:14 · Source #S-032</div></td><td>新房装修</td><td><span class="badge accent">待用户确认</span></td><td>3 条</td><td><button class="btn small primary" data-nav="D05">确认</button></td></tr>
              <tr><td><div class="data-title">厨房插座定位现场记录</div><div class="data-subtitle">文字 · 今天 20:42 · Source #S-031</div></td><td>新房装修</td><td><span class="badge">AI 提取中</span></td><td>--</td><td><button class="btn small" disabled>处理中</button></td></tr>
              <tr><td><div class="data-title">洗烘套装商品参数页</div><div class="data-subtitle">链接 · 今天 19:20 · Source #S-030</div></td><td>未分配</td><td><span class="badge">OCR 处理中</span></td><td>--</td><td><button class="btn small">查看状态</button></td></tr>
              <tr><td><div class="data-title">门店报价单 8 月版</div><div class="data-subtitle">截图 · 昨天 · Source #S-029</div></td><td>新房装修</td><td><span class="badge danger">处理失败</span></td><td>0 条</td><td><button class="btn small" data-retry>${state.retried ? "已重新处理" : "重试"}</button></td></tr>
            </tbody>
          </table>
          <div class="failure-box"><strong>失败状态示例：</strong>图片清晰度不足，OCR 未识别出有效文字。原始来源已保存，可更换图片或从失败步骤重试。</div>
        </section>
      </div>`,
  });
}

function candidateCard(index, options = {}) {
  const decision = state.candidateDecisions[index];
  const decided = decision ? "decided" : "";
  return `
    <article class="candidate ${decided}" data-candidate-card="${index}">
      <div class="candidate-head">
        <span class="candidate-index">${index}</span>
        <h3>${options.title}</h3>
        ${options.low ? `<span class="badge danger">低置信度 62%</span>` : `<span class="badge">置信度 ${options.confidence || "91%"}</span>`}
        ${decision ? `<span class="badge ${decision === "accepted" ? "success" : "danger"}" style="margin-left:auto">${decision === "accepted" ? "已接受" : "已拒绝"}</span>` : ""}
      </div>
      <div class="candidate-form">
        <div class="field"><label>记录类型</label><select class="select"><option>${options.type}</option><option>经验</option><option>参数</option><option>商品</option><option>避坑</option></select></div>
        <div class="field"><label>建议节点</label><select class="select"><option>家具家电 / 大家电 / 冰箱</option><option>暂不归档</option></select></div>
        <div class="field full"><label>候选内容</label><textarea class="textarea">${options.content}</textarea></div>
        <div class="field full"><label>适用条件</label><input class="input" value="${options.condition}" /></div>
      </div>
      <div class="candidate-actions"><button class="btn danger" data-candidate="${index}" data-decision="rejected">拒绝</button><button class="btn primary" data-candidate="${index}" data-decision="accepted">接受并生成正式记录</button></div>
    </article>`;
}

function d05() {
  const decidedCount = Object.keys(state.candidateDecisions).length;
  return desktopShell({
    id: "D05",
    title: "AI 提取确认",
    active: "inbox",
    crumbs: "零嵌冰箱安装避坑截图 · 3 条候选",
    actions: `<button class="btn" data-nav="D04">稍后处理</button><button class="btn primary" data-toast="只有已接受候选会生成 Entry">完成本资料</button>`,
    body: `
      <div class="confirm-layout">
        <aside class="source-pane">
          <div class="section-heading"><span class="badge">Source</span> 原始截图</div>
          <div class="source-preview"><div class="fake-shot"><div class="fake-shot-title">装修避坑｜零嵌冰箱怎么留尺寸</div><p>不要只看“零嵌”两个字，先看清楚产品的散热方式。</p><p class="highlight">底部散热型号左右通常只需少量安装余量，但顶部和背部仍需按安装图预留。</p><p>普通两侧散热冰箱需要更大的侧边空间。</p></div></div>
          <div class="source-meta"><div>Source #S-032 · 截图</div><div>项目：新房装修</div><div>OCR 已完成 · 文字覆盖率 94%</div></div>
          <button class="btn" style="margin-top:12px;width:100%" data-nav="D07">打开完整来源</button>
        </aside>
        <section class="confirm-main">
          <div class="object-note" style="margin-bottom:15px"><strong>Extraction 不是正式知识。</strong>请逐条检查类型、内容、适用条件和建议节点；接受后才生成 Entry。</div>
          <div class="progress-head"><strong>确认进度 ${decidedCount} / 3</strong><div class="progress-line"><span style="width:${(decidedCount / 3) * 100}%"></span></div><span class="badge">逐条确认</span></div>
          ${candidateCard(1, { title: "散热方式决定侧边预留", type: "避坑", content: "零嵌冰箱需要先确认散热方式，再决定柜体侧边预留尺寸。", condition: "嵌入橱柜安装；以具体型号安装图为准。", confidence: "94%" })}
          ${candidateCard(2, { title: "底部散热型号的安装余量", type: "参数", content: "底部散热型号左右通常只需少量安装余量，顶部和背部仍需预留空间。", condition: "仅适用于底部散热型号。", confidence: "88%" })}
          ${candidateCard(3, { title: "所有零嵌冰箱左右只留 4mm", type: "参数", content: "零嵌冰箱左右统一预留 4mm。", condition: "尚未提取到适用型号。", low: true })}
        </section>
      </div>`,
  });
}

function d06() {
  const noResults = state.searchTerm.trim() && !state.searchTerm.includes("冰箱");
  return desktopShell({
    id: "D06",
    title: "搜索结果和来源追溯",
    active: "search",
    actions: `<button class="btn">最近搜索</button>`,
    body: `
      <div class="workspace-grid">
        ${treePanel("", "filters")}
        <section class="workspace-content search-main">
          <div class="search-box"><input class="input" data-search-input value="${state.searchTerm}" placeholder="搜索正式记录和来源内容" /><button class="btn primary" data-search-submit>搜索</button></div>
          ${
            noResults
              ? `<div class="no-results"><h3>没有找到“${state.searchTerm}”</h3><p>当前筛选为：新房装修、参数/避坑、已归档</p><button class="btn" data-clear-search>清除筛选并重试</button></div>`
              : `<div class="section-heading">搜索“冰箱” <span class="count">14 个结果 · 正式记录优先</span></div>
                <article class="result-row"><div><div class="badge danger">避坑 · Entry</div><h3>零嵌冰箱需要先确认散热方式，再决定柜体预留尺寸</h3><p>命中：底部散热和两侧散热的预留要求不同，不能只按“零嵌”名称判断。</p><div class="result-path">新房装修 / 家具家电 / 大家电 / 冰箱 · 来源 1 个</div></div><div class="result-actions"><button class="btn small" data-open-drawer>来源</button><button class="btn small primary" data-nav="D03">回到节点</button></div></article>
                <article class="result-row"><div><div class="badge">参数 · Entry</div><h3>当前冰箱位净宽 915mm，净高 1900mm，深度上限 700mm</h3><p>命中：冰箱位复尺数据，需保留插座位置并考虑完成面误差。</p><div class="result-path">新房装修 / 家具家电 / 大家电 / 冰箱 · 来源 2 个</div></div><div class="result-actions"><button class="btn small" data-nav="D07">来源</button><button class="btn small primary" data-nav="D03">回到节点</button></div></article>
                <article class="result-row"><div><div class="badge">Source 命中</div><h3>品牌官网商品页：候选型号 A</h3><p>原文命中“冰箱”“底部散热”，关联 1 条正式记录。</p><div class="result-path">链接来源 · 当前可访问 · 2026-07-29</div></div><div class="result-actions"><button class="btn small primary" data-nav="D07">打开来源</button></div></article>`
          }
        </section>
      </div>
      ${sourceDrawer()}`,
  });
}

function d07() {
  return desktopShell({
    id: "D07",
    title: "来源详情预览",
    active: "inbox",
    crumbs: "Source #S-032 / 零嵌冰箱安装避坑截图",
    actions: `<button class="btn" data-nav="D03">返回关联记录</button><button class="btn primary" data-nav="D05">查看提取结果</button>`,
    body: `
      <div class="source-detail-layout">
        <section class="source-canvas">
          <article class="source-document">
            <div class="badge">原始截图模拟</div>
            <h2>装修避坑｜零嵌冰箱怎么留尺寸</h2>
            <p>不要只看“零嵌”两个字，先看清楚产品的散热方式。不同散热方式对柜体和墙面的预留要求不一样。</p>
            <div class="image-placeholder">原始截图图片区域 · 1080 × 1920</div>
            <p class="highlight">底部散热型号左右通常只需少量安装余量，但顶部和背部仍需按安装图预留。</p>
            <p>普通两侧散热冰箱需要更大的侧边空间，不能直接照搬零嵌型号的尺寸。下单前应向品牌确认安装图和开门角度。</p>
            <ul><li>先确认散热方式</li><li>再核对柜体净尺寸</li><li>保留插座和开门空间</li></ul>
          </article>
        </section>
        <aside class="meta-panel">
          <section class="meta-section"><h3>Source 信息</h3><div class="meta-pair"><span>来源类型</span><strong>截图</strong></div><div class="meta-pair"><span>所属项目</span><strong>新房装修</strong></div><div class="meta-pair"><span>采集时间</span><strong>2026-08-02 21:14</strong></div><div class="meta-pair"><span>原始文件</span><strong>IMG_8032.PNG</strong></div><div class="meta-pair"><span>可用状态</span><strong>原图可访问</strong></div></section>
          <section class="meta-section"><h3>处理时间线</h3><div class="timeline"><div class="timeline-step done"><strong>原始来源已保存</strong><br />21:14:08</div><div class="timeline-step done"><strong>OCR 已完成</strong><br />文字覆盖率 94%</div><div class="timeline-step done"><strong>AI 提取已完成</strong><br />生成 3 条候选</div><div class="timeline-step active"><strong>部分确认</strong><br />接受 2 · 拒绝 1</div></div></section>
          <section class="meta-section"><h3>关联正式记录</h3><button class="record-source" style="width:100%" data-nav="D03"><strong>Entry · 避坑</strong><br />散热方式决定侧边预留</button></section>
          <div class="failure-box"><strong>链接失效状态：</strong>如果网页链接不可访问，保留已保存的标题、正文快照和关联 Entry，并提供“重新访问”。</div>
        </aside>
      </div>`,
  });
}

function d08() {
  return desktopShell({
    id: "D08",
    title: "Review 冲突处理",
    active: "review",
    crumbs: "P1 方向稿 · 全局问题聚合",
    actions: `<span class="badge accent">P1 方向稿</span><button class="btn">筛选：全部项目</button>`,
    body: `
      <div class="review-layout">
        <aside class="finding-list">
          <div class="object-note" style="margin-bottom:10px">全局 Review 聚合所有项目；从项目内进入时自动带项目筛选。</div>
          <button class="finding-item active"><span class="badge danger">疑似冲突</span><h3>冰箱侧边预留尺寸不一致</h3><p>新房装修 · 2 条记录 · 2 个来源</p></button>
          <button class="finding-item"><span class="badge">缺少条件</span><h3>防水闭水时间没有说明季节</h3><p>新房装修 · 1 条记录</p></button>
          <button class="finding-item"><span class="badge">缺少来源</span><h3>插座高度记录无法追溯</h3><p>新房装修 · 1 条记录</p></button>
          <button class="finding-item"><span class="badge">疑似重复</span><h3>京都交通票说明重复</h3><p>日本旅行 · 2 条记录</p></button>
        </aside>
        <section class="review-main">
          <div class="page-intro"><div><h2>冰箱侧边预留尺寸不一致</h2><p>Review Finding #R-005 · AI 只提出解释和修改候选，不直接修改正式记录。</p></div></div>
          <div class="compare-grid">
            <article class="compare-column"><span class="badge">Entry A</span><h3>冰箱两侧各预留 10cm</h3><p>普通冰箱需要给两侧散热留出空间，避免紧贴柜体。</p><button class="record-source" style="width:100%" data-nav="D07"><strong>Source · 网页</strong><br />常规冰箱安装说明</button></article>
            <article class="compare-column"><span class="badge">Entry B</span><h3>零嵌冰箱两侧只需约 4mm</h3><p>底部散热零嵌型号可减少侧边安装余量。</p><button class="record-source" style="width:100%" data-nav="D07"><strong>Source · 截图</strong><br />零嵌冰箱安装避坑</button></article>
          </div>
          <div class="ai-suggestion"><h3>AI 建议（候选）</h3><p>这两条记录可能适用于不同散热方式，并非直接冲突。建议为 Entry A 增加“普通两侧散热型号”，为 Entry B 增加“底部散热零嵌型号，以安装图为准”的适用条件。</p></div>
          <div class="field" style="margin-top:16px"><label>人工确认后的适用条件</label><textarea class="textarea">普通两侧散热与底部散热零嵌型号需要分别记录预留要求，最终以具体型号安装图为准。</textarea></div>
          <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px"><button class="btn danger" data-toast="AI 建议已拒绝，正式记录未变化">拒绝建议</button><button class="btn primary" data-toast="进入正式记录编辑确认，尚未直接修改">接受建议并进入编辑</button></div>
        </section>
      </div>`,
  });
}

function d09() {
  return desktopShell({
    id: "D09",
    title: "决策与预算位置示意",
    active: "projects",
    crumbs: "新房装修 / P1 方向稿",
    actions: `<span class="badge accent">P1 方向稿</span>`,
    body: `
      ${projectTabs("决策")}
      <div class="workspace-grid">
        ${treePanel("冰箱")}
        <section class="workspace-content p1-board">
          <div class="direction-note">本页只确认 P1 在项目工作区中的位置、与节点和来源的关联，不展开完整决策比较或财务记账能力。</div>
          <section class="band-section">
            <div class="band-head"><span class="badge">Decision</span><h2>决策</h2><span class="section-actions badge accent">项目内入口</span></div>
            <div class="band-grid">
              <article class="flat-card"><h3>最终选择</h3><div class="flat-value">候选型号 A</div><p>尺寸匹配、底部散热、容量满足需求。</p></article>
              <article class="flat-card"><h3>决策依据</h3><div class="flat-value">6 条</div><p>关联 4 条正式记录和 3 个原始来源。</p></article>
              <article class="flat-card"><h3>决策状态</h3><div class="flat-value">待确认</div><p>下单前还需核对开门角度和安装图。</p></article>
            </div>
          </section>
          <section class="band-section">
            <div class="band-head"><span class="badge">Budget</span><h2>预算与花费</h2><span class="section-actions badge accent">项目内入口</span></div>
            <div class="band-grid">
              <article class="flat-card"><h3>冰箱预算</h3><div class="flat-value">¥12,000</div><p>预算挂在“冰箱”知识节点。</p></article>
              <article class="flat-card"><h3>候选报价</h3><div class="flat-value">¥10,899</div><p>关联门店报价来源，尚未形成实际花费。</p></article>
              <article class="flat-card"><h3>凭证</h3><div class="flat-value">0 份</div><p>下单后可关联订单截图和发票。</p></article>
            </div>
          </section>
        </section>
      </div>`,
  });
}

function mobileTopbar(id, title, back = "") {
  return `
    <header class="mobile-topbar">
      ${back ? `<button class="mobile-back" data-nav="${back}" aria-label="返回">‹</button>` : `<span class="brand-mark" style="width:26px;height:26px;font-size:10px">KS</span>`}
      <h1>${title}</h1><span class="page-id">${id}</span>
    </header>`;
}

function mobileBottom(active = "projects") {
  return `
    <nav class="mobile-bottom-nav" aria-label="移动端全局导航">
      <button class="mobile-tab ${active === "projects" ? "active" : ""}" data-nav="M01"><span class="mobile-tab-icon">▦</span><span>项目</span></button>
      <button class="mobile-tab capture ${active === "capture" ? "active" : ""}" data-nav="M02"><span class="mobile-tab-icon">＋</span><span>采集</span></button>
      <button class="mobile-tab ${active === "search" ? "active" : ""}" data-nav="M07"><span class="mobile-tab-icon">⌕</span><span>搜索</span></button>
      <button class="mobile-tab ${active === "review" ? "active" : ""}" data-toast="Review 为 P1 方向入口"><span class="mobile-tab-icon">◇</span><span>Review · P1</span></button>
      <button class="mobile-tab"><span class="mobile-tab-icon">○</span><span>我的</span></button>
    </nav>`;
}

function mobileShell({ id, title, body, active = "projects", back = "", showBottom = true, sourcePage = false }) {
  return `
    <div class="mobile-app">
      ${mobileTopbar(id, title, back)}
      <main class="mobile-scroll ${showBottom ? "with-tabs" : ""} ${sourcePage ? "mobile-source-page" : ""}">${body}</main>
      ${showBottom ? mobileBottom(active) : ""}
    </div>`;
}

function m00() {
  return `
    <main class="login-screen mobile-login">
      <span class="page-id auth-page-id">M00</span>
      <section class="login-panel" aria-labelledby="mobile-login-title">
        <div class="login-brand"><span class="brand-mark">KS</span><span>KnowStruct</span></div>
        <div class="login-heading">
          <h1 id="mobile-login-title">登录 KnowStruct</h1>
          <p>使用已有账号进入你的项目和知识目录。</p>
        </div>
        <div class="login-form">
          <label class="login-field"><span>账号</span><input class="input" data-login-account autocomplete="username" placeholder="请输入账号" /></label>
          <label class="login-field"><span>密码</span><input class="input" data-login-password type="password" autocomplete="current-password" placeholder="请输入密码" /></label>
          <label class="remember-row"><input type="checkbox" /> <span>保持登录</span></label>
          ${state.loginError ? `<div class="login-error" role="alert">${state.loginError}</div>` : ""}
          <button class="btn primary login-submit" data-login-submit="mobile">登录</button>
        </div>
        <div class="login-boundary">当前版本仅支持已有账号登录。注册将在后续版本提供。</div>
      </section>
    </main>`;
}

function m01() {
  return mobileShell({
    id: "M01",
    title: "项目",
    active: "projects",
    body: `
      <div class="mobile-heading"><h2>我的项目</h2><p>进入项目查看目录和正式记录；临时资料也可以先从“采集”保存。</p></div>
      <button class="mobile-project" style="width:100%;text-align:left" data-nav="M06"><div style="display:flex;align-items:center"><h3>新房装修</h3><span class="badge accent" style="margin-left:auto">进行中</span></div><p>施工与采购阶段，重点整理家电参数和安装条件。</p><div class="mobile-meta"><span>28 个节点</span><span>47 条记录</span><span>6 待确认</span></div></button>
      <button class="mobile-project" style="width:100%;text-align:left"><div style="display:flex;align-items:center"><h3>日本旅行</h3><span class="badge" style="margin-left:auto">规划中</span></div><p>东京、京都 8 日行程与预订信息。</p><div class="mobile-meta"><span>14 个节点</span><span>14 条记录</span><span>2 待确认</span></div></button>
      <button class="btn primary mobile-primary" data-toast="创建项目表单将在下一轮细化">+ 创建项目</button>
      <div class="empty-inline" style="min-height:92px;padding:12px;gap:10px"><div class="empty-symbol" style="width:40px;height:40px;flex-basis:40px">□</div><div><h3>没有项目</h3><p>仍可先采集，归档前再选择项目。</p></div></div>`,
  });
}

function captureBody() {
  if (state.captureMode === "link") {
    return `<div class="mobile-upload"><div class="mobile-upload-symbol">↗</div><h3>粘贴网页链接</h3><p>保存原始链接和标题；本原型不访问网络。</p><input class="input" style="margin-top:16px" placeholder="https://..." /></div>`;
  }
  if (state.captureMode === "text") {
    return `<div class="mobile-upload" style="align-items:stretch;text-align:left"><h3>快速记录文字</h3><p>先保存原文，再进入 AI 候选提取。</p><textarea class="textarea" style="min-height:125px;margin-top:14px" placeholder="输入或粘贴文字...">橱柜复尺：冰箱位净宽 915mm，净高 1900mm，插座在右后方。</textarea></div>`;
  }
  return `<div class="mobile-upload"><div class="mobile-upload-symbol">▧</div><h3>上传截图或图片</h3><p>支持相册选择或拍照；原图会先保存，再进入 OCR 和 AI 提取。</p><button class="btn" style="margin-top:15px">从相册选择</button></div>`;
}

function m02() {
  return mobileShell({
    id: "M02",
    title: "快速采集",
    active: "capture",
    body: `
      <div class="capture-modes">
        <button class="capture-mode ${state.captureMode === "image" ? "active" : ""}" data-capture-mode="image">截图</button>
        <button class="capture-mode ${state.captureMode === "link" ? "active" : ""}" data-capture-mode="link">链接</button>
        <button class="capture-mode ${state.captureMode === "text" ? "active" : ""}" data-capture-mode="text">文字</button>
      </div>
      ${captureBody()}
      <div class="form-block"><label>所属项目（可选）</label><select class="select"><option>暂不选择，保存到未分配</option><option>新房装修</option><option>日本旅行</option></select><div class="form-note">生成正式记录前必须确认项目；AI 不会替你最终决定归属。</div></div>
      <button class="btn primary mobile-primary" style="margin-top:16px" data-nav="M03">保存原始来源</button>`,
  });
}

function m03() {
  return mobileShell({
    id: "M03",
    title: "处理状态",
    active: "capture",
    back: "M02",
    body: `
      <div class="mobile-heading"><h2>原始来源已保存</h2><p>可以离开此页，处理会继续进行。失败时无需重新上传原图。</p></div>
      <section class="mobile-status-panel">
        <div class="mobile-status-head"><div class="file-thumb">截图</div><div><h3>零嵌冰箱安装避坑截图</h3><p>Source #S-032 · 未分配项目</p></div></div>
        <div class="timeline"><div class="timeline-step done"><strong>上传完成</strong><br />原始截图已保存</div><div class="timeline-step done"><strong>OCR 已完成</strong><br />识别到 428 个字符</div><div class="timeline-step active"><strong>AI 提取中</strong><br />正在生成候选记录...</div><div class="timeline-step"><strong>等待人工确认</strong><br />预计得到 2-4 条候选</div></div>
      </section>
      <div class="object-note" style="margin-top:13px">状态包括上传中、OCR 处理中、AI 提取中、待确认、成功和失败。失败项保留 Source，并可从失败步骤重试。</div>
      <button class="btn primary mobile-primary" style="margin-top:16px" data-nav="M04">查看待确认队列</button>`,
  });
}

function m04() {
  return mobileShell({
    id: "M04",
    title: "待确认队列",
    active: "capture",
    back: "M03",
    body: `
      <div class="mobile-filter-chips"><button class="chip active">待确认 6</button><button class="chip">处理中 2</button><button class="chip">失败 2</button><button class="chip">未分配 3</button></div>
      <button class="mobile-queue-item" data-nav="M05"><div class="file-thumb">截图</div><div><h3>零嵌冰箱安装避坑截图</h3><p>新房装修 · 3 条 AI 候选</p><div class="mobile-queue-status"><span class="status-dot accent"></span><strong>待用户确认</strong><span class="badge danger" style="margin-left:auto">1 条低置信度</span></div></div></button>
      <button class="mobile-queue-item"><div class="file-thumb">文字</div><div><h3>厨房插座定位现场记录</h3><p>新房装修 · 2 条 AI 候选</p><div class="mobile-queue-status"><span class="status-dot accent"></span><strong>待用户确认</strong></div></div></button>
      <button class="mobile-queue-item"><div class="file-thumb">链接</div><div><h3>洗烘套装商品参数页</h3><p>未分配项目 · 正在处理</p><div class="mobile-queue-status"><span class="status-dot"></span><strong>OCR 处理中</strong></div></div></button>
      <div class="failure-box"><strong>门店报价单处理失败：</strong>图片过暗，未识别到有效文字。<button class="btn small" data-retry style="margin-top:8px;width:100%">${state.retried ? "已提交重试" : "从 OCR 步骤重试"}</button></div>`,
  });
}

function m05() {
  const decision = state.candidateDecisions.mobile;
  return mobileShell({
    id: "M05",
    title: "逐条确认",
    active: "capture",
    back: "M04",
    showBottom: false,
    body: `
      <button class="mobile-source-link" data-nav="M08"><span class="badge">Source</span><span>零嵌冰箱安装避坑截图</span><span>查看 ›</span></button>
      <div class="mobile-candidate-count"><strong>候选 1 / 3</strong><div class="progress-line"><span style="width:33%"></span></div><span>${decision ? "已决定" : "待决定"}</span></div>
      <article class="mobile-candidate">
        <div class="mobile-candidate-head"><span class="candidate-index">1</span><h3>散热方式决定侧边预留</h3><span class="badge" style="margin-left:auto">94%</span></div>
        <div class="mobile-candidate-body">
          <div class="object-note" style="margin-bottom:12px">这是 AI 候选 Extraction；接受后才成为正式 Entry。</div>
          <div class="field"><label>所属项目（归档前必选）</label><select class="select"><option>新房装修</option><option>选择其他项目</option></select></div>
          <div class="field" style="margin-top:12px"><label>记录类型</label><select class="select"><option>避坑</option><option>经验</option><option>参数</option></select></div>
          <div class="field" style="margin-top:12px"><label>候选内容</label><textarea class="textarea">零嵌冰箱需要先确认散热方式，再决定柜体侧边预留尺寸。</textarea></div>
          <div class="field" style="margin-top:12px"><label>适用条件</label><textarea class="textarea">嵌入橱柜安装；以具体型号安装图为准。</textarea></div>
          <div class="field" style="margin-top:12px"><label>建议节点</label><select class="select"><option>家具家电 / 大家电 / 冰箱</option><option>选择其他节点</option></select></div>
          ${decision ? `<div class="object-note" style="margin-top:12px">${decision === "accepted" ? "已接受：将生成 1 条正式 Entry，并保留 Source 关联。" : "已拒绝：不会生成 Entry，原始 Source 仍保留。"}</div>` : ""}
          <div class="mobile-candidate-actions"><button class="btn danger" data-candidate="mobile" data-decision="rejected">拒绝</button><button class="btn primary" data-candidate="mobile" data-decision="accepted">接受</button></div>
        </div>
      </article>
      <button class="btn mobile-primary" style="margin-top:12px" data-toast="先逐条处理剩余 2 条候选">下一条候选</button>
      <button class="btn ghost mobile-primary" data-nav="M06">查看归档后的节点示例</button>`,
  });
}

function m06() {
  return mobileShell({
    id: "M06",
    title: "知识节点",
    active: "projects",
    back: "M01",
    body: `
      <div class="mobile-node-path">新房装修 / 家具家电 / 大家电</div>
      <h2 class="mobile-node-title">冰箱</h2><p class="mobile-node-note">6 条正式记录 · 5 个原始来源</p>
      <div class="mobile-filter-chips"><button class="chip active">全部 6</button><button class="chip">避坑 1</button><button class="chip">参数 2</button><button class="chip">商品 1</button></div>
      <article class="mobile-record"><span class="badge danger">避坑 · Entry</span><h3>零嵌冰箱需要先确认散热方式，再决定柜体预留尺寸</h3><p>适用条件：嵌入橱柜安装；最终尺寸以具体型号安装图为准。</p><div class="mobile-record-foot"><span>1 个关联 Source</span><button class="btn small" data-nav="M08">查看来源</button></div></article>
      <article class="mobile-record"><span class="badge">参数 · Entry</span><h3>当前冰箱位净宽 915mm，净高 1900mm</h3><p>橱柜复尺后需要再次确认，并保留插座位置。</p><div class="mobile-record-foot"><span>2 个关联 Source</span><button class="btn small" data-nav="M08">查看来源</button></div></article>
      <article class="mobile-record"><span class="badge">商品 · Entry</span><h3>候选型号 A：宽 908mm，底部散热</h3><p>尺寸初步匹配，需要核对开门角度。</p><div class="mobile-record-foot"><span>1 个关联 Source</span><button class="btn small" data-nav="M08">查看来源</button></div></article>`,
  });
}

function m07() {
  const noResults = state.searchTerm.trim() && !state.searchTerm.includes("冰箱");
  return mobileShell({
    id: "M07",
    title: "搜索",
    active: "search",
    body: `
      <div class="mobile-search"><input class="input" data-search-input value="${state.searchTerm}" placeholder="搜索正式记录和来源" /><button class="btn primary" data-search-submit>搜索</button></div>
      <div class="mobile-filter-chips"><button class="chip active">新房装修</button><button class="chip">节点</button><button class="chip">类型</button><button class="chip">状态</button></div>
      ${
        noResults
          ? `<div class="no-results"><h3>没有找到“${state.searchTerm}”</h3><p>尝试清除项目或类型筛选。</p><button class="btn" data-clear-search>清除筛选</button></div>`
          : `<div class="mobile-result-count">找到 14 个结果 · 正式记录优先</div>
            <article class="mobile-record"><span class="badge danger">避坑 · Entry</span><h3>零嵌冰箱需要先确认散热方式</h3><p>命中“冰箱”“散热方式”和“预留尺寸”。</p><div class="mobile-record-foot"><span>新房装修 / 大家电 / 冰箱</span><button class="btn small" data-nav="M06">打开</button></div></article>
            <article class="mobile-record"><span class="badge">参数 · Entry</span><h3>冰箱位净宽 915mm，净高 1900mm</h3><p>命中冰箱位复尺数据与插座位置。</p><div class="mobile-record-foot"><span>2 个来源</span><button class="btn small" data-nav="M08">来源</button></div></article>
            <article class="mobile-record"><span class="badge">Source 命中</span><h3>候选型号 A 品牌官网商品页</h3><p>原文命中“冰箱”“底部散热”。</p><div class="mobile-record-foot"><span>链接当前可访问</span><button class="btn small" data-nav="M08">打开</button></div></article>`
      }`,
  });
}

function m08() {
  return mobileShell({
    id: "M08",
    title: "原始来源",
    active: "projects",
    back: "M06",
    showBottom: false,
    sourcePage: true,
    body: `
      <article class="mobile-source-document">
        <span class="badge">Source · 截图</span><h2>装修避坑｜零嵌冰箱怎么留尺寸</h2>
        <p>不要只看“零嵌”两个字，先看清楚产品的散热方式。</p>
        <div class="image-placeholder" style="height:170px;margin:16px 0;display:grid;place-items:center;border:1px solid var(--line-strong);background:var(--surface-3);color:var(--muted);font-size:11px">原始截图区域</div>
        <p class="highlight">底部散热型号左右通常只需少量安装余量，但顶部和背部仍需按安装图预留。</p>
        <p>普通两侧散热冰箱需要更大的侧边空间，不能照搬零嵌尺寸。</p>
      </article>
      <section class="mobile-source-meta"><h3>来源与追溯</h3><div class="meta-pair"><span>所属项目</span><strong>新房装修</strong></div><div class="meta-pair"><span>采集时间</span><strong>2026-08-02 21:14</strong></div><div class="meta-pair"><span>关联记录</span><strong>2 条正式 Entry</strong></div><div class="meta-pair"><span>处理结果</span><strong>接受 2 · 拒绝 1</strong></div><div class="failure-box"><strong>链接失效示例：</strong>原链接无法访问时，保留已保存正文快照和关联记录，并允许重新访问。</div><button class="btn mobile-primary" style="margin-top:12px" data-nav="M06">返回知识节点</button></section>`,
  });
}

const pageRenderers = { D00: d00, D01: d01, D02: d02, D03: d03, D04: d04, D05: d05, D06: d06, D07: d07, D08: d08, D09: d09, M00: m00, M01: m01, M02: m02, M03: m03, M04: m04, M05: m05, M06: m06, M07: m07, M08: m08 };

function statePanel() {
  if (!state.stateOpen) return "";
  const items = [
    ["登录信息未填写", "账号或密码为空时保留在登录页，并在表单内显示必填提示。"],
    ["账号或密码错误", "显示统一错误文案，不暴露账号是否存在。"],
    ["登录中", "提交后暂时禁用登录按钮，避免重复提交。"],
    ["登录成功", "建立会话后进入项目列表；P0 不提供注册入口。"],
    ["首次使用 / 没有项目", "可创建项目，也可先全局采集；归档前必须选择项目。"],
    ["没有目录节点", "显示手动新增入口；AI 目录只能作为待确认建议。"],
    ["上传中", "显示文件名、进度与取消；完成后先保存 Source。"],
    ["OCR 处理中", "时间线标记当前步骤，用户可离开页面。"],
    ["AI 提取中", "明确正在生成 Extraction，不创建正式 Entry。"],
    ["处理失败 / 可重试", "保留 Source，从失败步骤重试，不重复上传。"],
    ["待用户确认", "显示候选数、置信度和进入逐条确认的入口。"],
    ["部分内容被拒绝", "显示接受、拒绝、未决定统计，只为接受项创建 Entry。"],
    ["没有搜索结果", "保留关键词与筛选，提供清除筛选，不生成 AI 答案。"],
    ["来源链接失效", "保留标题、正文快照和关联 Entry，提供重新访问。"],
  ];
  return `
    <div class="state-backdrop" data-close-state>
      <section class="state-modal" role="dialog" aria-label="关键页面状态" data-state-body>
        <header class="state-modal-head"><div><h2>关键状态覆盖</h2><div class="context-subtitle">这些状态同时记录在 interaction-flows.md</div></div><button class="btn icon-btn" data-close-state title="关闭">×</button></header>
        <div class="state-grid">${items.map(([title, description]) => `<article class="state-item"><h3>${title}</h3><p>${description}</p></article>`).join("")}</div>
      </section>
    </div>`;
}

function render() {
  const renderer = pageRenderers[state.page] || pageRenderers[state.view === "mobile" ? "M01" : "D01"];
  root.innerHTML = `${prototypeBar()}<div class="app-viewport">${renderer()}</div>${statePanel()}${state.toast ? `<div class="toast">${state.toast}</div>` : ""}`;
  document.title = `${state.page} ${pageTitle(state.page)} · KnowStruct 低保真原型`;
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2200);
}

root.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-nav], tr, [data-close-state], [data-close-drawer]");
  if (!target) return;

  if (target.dataset.view) {
    const nextView = target.dataset.view;
    const pairedPage = `${nextView === "mobile" ? "M" : "D"}${state.page.slice(1)}`;
    const availablePages = screens[nextView].map(([id]) => id);
    setPage(availablePages.includes(pairedPage) ? pairedPage : (nextView === "mobile" ? "M01" : "D01"), nextView);
    return;
  }

  if (target.dataset.nav) {
    setPage(target.dataset.nav);
    return;
  }

  if (target.dataset.loginSubmit) {
    const account = root.querySelector("[data-login-account]")?.value.trim() || "";
    const password = root.querySelector("[data-login-password]")?.value || "";
    if (!account || !password) {
      state.loginError = "请输入账号和密码";
      render();
      return;
    }
    if (account === "wrong" || password === "wrong") {
      state.loginError = "账号或密码错误，请重新输入";
      render();
      return;
    }
    state.loginError = "";
    const destination = target.dataset.loginSubmit === "mobile" ? "M01" : "D01";
    setPage(destination);
    showToast("登录成功");
    return;
  }

  if (target.dataset.statePanel !== undefined) {
    state.stateOpen = true;
    render();
    return;
  }

  if (target.dataset.closeState !== undefined && !event.target.closest("[data-state-body]")) {
    state.stateOpen = false;
    render();
    return;
  }

  if (target.dataset.closeState !== undefined) {
    state.stateOpen = false;
    render();
    return;
  }

  if (target.dataset.openDrawer !== undefined) {
    state.drawerOpen = true;
    render();
    return;
  }

  if (target.dataset.closeDrawer !== undefined) {
    state.drawerOpen = false;
    render();
    return;
  }

  if (target.dataset.captureMode) {
    state.captureMode = target.dataset.captureMode;
    render();
    return;
  }

  if (target.dataset.candidate) {
    state.candidateDecisions[target.dataset.candidate] = target.dataset.decision;
    showToast(target.dataset.decision === "accepted" ? "候选已接受：确认完成后生成正式 Entry" : "候选已拒绝：原始 Source 保持不变");
    return;
  }

  if (target.dataset.retry !== undefined) {
    state.retried = true;
    showToast("已从失败步骤重新处理，原始 Source 未重复创建");
    return;
  }

  if (target.dataset.searchSubmit !== undefined) {
    const input = root.querySelector("[data-search-input]");
    state.searchTerm = input?.value || "";
    render();
    return;
  }

  if (target.dataset.clearSearch !== undefined) {
    state.searchTerm = "冰箱";
    render();
    return;
  }

  if (target.dataset.toast) {
    showToast(target.dataset.toast);
  }
});

root.addEventListener("change", (event) => {
  if (event.target.matches("[data-screen-select]")) setPage(event.target.value, state.view);
});

window.addEventListener("popstate", () => {
  readUrl();
  render();
});

readUrl();
render();
