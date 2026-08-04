const pageDefinitions = {
  login: {
    label: '登录页',
    states: [
      ['default', '默认'],
      ['error', '表单错误'],
      ['loading', '登录中'],
    ],
  },
  projects: {
    label: '项目列表',
    states: [
      ['list', '正常项目列表'],
      ['empty', '无项目'],
      ['error', '加载失败'],
      ['create', '创建项目弹窗'],
      ['edit', '编辑项目弹窗'],
      ['delete', '删除确认'],
    ],
  },
  workspace: {
    label: '项目与知识目录',
    states: [
      ['overview', '项目概览'],
      ['settings', '项目设置'],
      ['selected', '多层目录 / 选中节点'],
      ['empty-directory', '空目录'],
      ['empty-node', '空节点'],
      ['menu', '节点操作菜单'],
      ['node-create', '创建节点弹窗'],
      ['node-edit', '编辑节点弹窗'],
      ['node-move', '移动节点弹窗'],
      ['node-delete', '删除子树确认'],
      ['drag-ready', '拖拽前'],
      ['dragging', '拖拽中'],
      ['drop-root', '根目录投放'],
      ['drop-after', '同级位置投放'],
      ['drag-done', '拖拽完成'],
      ['load-error', '加载失败'],
      ['move-error', '移动失败'],
    ],
  },
  spec: {
    label: '轻量 UI 规范',
    states: [['default', '组件总览']],
  },
}

const viewportDefinitions = {
  1440: { label: '桌面宽屏', size: '1440 x 900' },
  1280: { label: '桌面紧凑', size: '1280 x 800' },
  390: { label: '移动端', size: '390 x 844' },
}

const prototypeState = {
  page: 'projects',
  pageState: 'list',
  viewport: '1440',
  focus: false,
  path: [],
}

const projects = [
  { name: '新房装修', goal: '施工与采购阶段，重点整理家电参数和安装条件', status: '进行中', tone: 'green', nodes: 28, updated: '今天 21:14' },
  { name: '日本旅行', goal: '东京、京都 8 日行程与预订信息', status: '规划中', tone: 'blue', nodes: 14, updated: '昨天 18:32' },
  { name: '家庭健康档案', goal: '整理体检结果与日常健康记录', status: '已暂停', tone: 'amber', nodes: 9, updated: '7 月 28 日' },
]

const demoTree = [
  { name: '硬装施工', description: '水电、墙面与地面', children: [
    { name: '水电', description: '点位与管线', children: [
      { name: '强弱电点位', description: '开关插座与网线点位' },
    ]},
    { name: '墙面与地面', description: '墙地面材料与工艺' },
  ]},
  { name: '家具家电', description: '大家电、家具', children: [
    { name: '大家电', description: '冰箱、洗衣机、空调', children: [
      { name: '冰箱', description: '整理冰箱尺寸、散热方式、安装条件和候选型号。', children: [
        { name: '安装条件', description: '尺寸、散热和插座位置' },
        { name: '候选型号', description: '按容量和开门方式整理' },
      ]},
      { name: '洗衣机', description: '尺寸、进出水条件与候选型号' },
      { name: '空调', description: '匹数、安装位置与候选型号' },
    ]},
    { name: '家具', description: '床、柜、桌椅等' },
  ]},
  { name: '预算与采购', description: '预算、采购记录' },
  { name: '施工验收', description: '验收标准和问题记录' },
]

function nodeAtPath(path) {
  let list = demoTree
  let node = null
  for (const name of path) {
    node = list.find(item => item.name === name) || null
    if (!node) return null
    list = node.children || []
  }
  return node
}

function childrenOf(path) {
  const node = nodeAtPath(path)
  if (node && node.children) return node.children
  return path.length ? [] : demoTree
}

const icon = (name, size = 18) => `<i class="icon" data-lucide="${name}" style="width:${size}px;height:${size}px" aria-hidden="true"></i>`

function navItem(label, iconName, active, extra = '') {
  return `<button type="button" class="nav-item ${active ? 'active' : ''}" data-page="${label === '项目' ? 'projects' : ''}">${icon(iconName)}<span class="nav-label">${label}</span>${extra}</button>`
}

function globalSidebar(active = 'projects') {
  return `
    <aside class="global-sidebar">
      <div class="brand-lockup"><span class="brand-mark">KS</span><span>KnowStruct</span></div>
      <nav class="global-nav" aria-label="全局导航">
        ${navItem('项目', 'folder-kanban', active === 'projects')}
        ${navItem('采集', 'inbox', false)}
        ${navItem('搜索', 'search', false)}
        ${navItem('Review', 'shield-check', false, '<span class="p1-label">P1</span>')}
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-account">
        <div class="account-line">${icon('circle-user-round')}<span>demo_user</span></div>
        <button type="button" class="nav-item">${icon('log-out')}<span>退出登录</span></button>
      </div>
    </aside>`
}

function mobileHeader() {
  return `<header class="mobile-app-header"><div class="brand-lockup"><span class="brand-mark">KS</span><span>KnowStruct</span></div></header>`
}

function mobileBottom(active = 'projects') {
  const item = (label, iconName, activeItem, p1 = false) => `<button type="button" class="mobile-tab ${activeItem ? 'active' : ''}" ${label === '项目' ? 'data-page="projects"' : ''}><span class="icon">${icon(iconName, 20)}${p1 ? '<span class="p1-dot">P1</span>' : ''}</span><span>${label}</span></button>`
  return `<nav class="mobile-bottom-nav" aria-label="移动端导航">${item('项目', 'folder-kanban', active === 'projects')}${item('采集', 'inbox', false)}${item('搜索', 'search', false)}${item('Review', 'shield-check', false, true)}${item('我的', 'circle-user-round', false)}</nav>`
}

function appShell(content, active = 'projects') {
  return `<div class="app-layout">${globalSidebar(active)}<section class="app-main">${mobileHeader()}${content}</section>${mobileBottom(active)}</div>`
}

function pageHeading(title, actionLabel = '创建项目') {
  return `<header class="page-toolbar"><h1>${title}</h1><button type="button" class="button primary small" data-state="create">${icon('plus', 15)}${actionLabel}</button></header>`
}

function projectRows() {
  return projects.map((project, index) => `
    <tr data-page="workspace" data-state="${index === 0 ? 'overview' : 'selected'}">
      <td><div class="project-name"><strong>${project.name}</strong><span>${project.goal}</span></div></td>
      <td><span class="status ${project.tone}">${project.status}</span></td>
      <td>${project.nodes} 个</td>
      <td>${project.updated}</td>
      <td><div class="row-actions"><button type="button" class="icon-button" aria-label="管理 ${project.name}" data-state="${index === 0 ? 'edit' : 'list'}">${icon('ellipsis')}</button></div></td>
    </tr>`).join('')
}

function mobileProjects() {
  return `<div class="mobile-project-list">${projects.map((project, index) => `
    <article class="mobile-project-card" data-page="workspace" data-state="${index === 0 ? 'overview' : 'selected'}">
      <div class="mobile-project-head"><strong>${project.name}</strong><span class="status ${project.tone}">${project.status}</span><button type="button" class="icon-button" aria-label="管理 ${project.name}" data-state="${index === 0 ? 'edit' : 'list'}">${icon('ellipsis')}</button></div>
      <p>${project.goal}</p>
      <div class="mobile-project-meta"><span>${project.nodes} 个目录节点</span><span>更新于 ${project.updated}</span></div>
    </article>`).join('')}</div>`
}

function emptyState() {
  return `<section class="state-panel"><div class="state-content"><span class="state-icon">${icon('folder-kanban', 24)}</span><h2>还没有项目</h2><p>先建立一个知识主题，或从全局采集箱保存临时资料。点击右上角「创建项目」开始。</p></div></section>`
}

function errorState(title = '项目加载失败', detail = '请检查连接后重试，当前状态不代表工作区为空。') {
  return `<section class="state-panel" role="alert"><div class="state-content"><span class="state-icon error">${icon('triangle-alert', 23)}</span><h2>${title}</h2><p>${detail}</p><button type="button" class="button">${icon('refresh-cw', 15)}重试</button></div></section>`
}

function projectDialog(editing = false, settings = false) {
  return `<div class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-label="${settings ? '项目设置' : editing ? '编辑项目' : '创建项目'}">
    <header class="dialog-header"><div><h2>${settings ? '项目设置' : editing ? '编辑项目' : '创建项目'}</h2></div><button type="button" class="icon-button" data-close aria-label="关闭">${icon('x')}</button></header>
    <div class="dialog-body"><form class="form-stack">
      <label class="field"><span class="field-label">项目名称 <span class="field-hint">必填</span></span><input value="${editing ? '新房装修' : ''}" placeholder="例如：新房装修" /></label>
      <label class="field"><span class="field-label">项目目标与背景 <span class="field-hint">选填，最多 500 字</span></span><textarea placeholder="描述希望沉淀的知识以及背景上下文，例如：施工与采购阶段…">${editing ? '施工与采购阶段，重点整理家电参数和安装条件。2026 年住宅装修，当前进入硬装施工阶段。' : ''}</textarea></label>
      <label class="field"><span class="field-label">状态</span><select><option ${editing ? '' : 'selected'}>规划中</option><option ${editing ? 'selected' : ''}>进行中</option><option>已暂停</option><option>已完成</option></select></label>
      <div class="dialog-actions"><button type="button" class="button" data-close>取消</button><button type="button" class="button primary">${settings || editing ? '保存更改' : '创建项目'}</button></div>
    </form></div>
  </section></div>`
}

function deleteProjectDialog() {
  return `<div class="dialog-backdrop"><section class="dialog small-dialog" role="dialog" aria-modal="true" aria-label="删除项目">
    <header class="dialog-header"><div class="danger-heading">${icon('trash-2')}<h2>删除“新房装修”项目？</h2></div><button type="button" class="icon-button" data-close aria-label="关闭">${icon('x')}</button></header>
    <div class="dialog-body"><p class="dialog-description">项目和其知识目录将被永久删除，当前版本无法恢复。</p><div class="danger-note"><strong>此操作会删除 28 个目录节点</strong><span>若项目存在受保护的正式记录或来源引用，系统将阻止删除。</span></div><div class="dialog-actions"><button type="button" class="button" data-close>取消</button><button type="button" class="button danger">删除项目</button></div></div>
  </section></div>`
}

function renderProjects() {
  const state = prototypeState.pageState
  let body = ''
  if (state === 'empty') body = emptyState()
  else if (state === 'error') body = errorState()
  else body = `<div class="project-table-wrap"><table class="project-table"><thead><tr><th>项目</th><th>状态</th><th>目录节点</th><th>最近更新</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>${projectRows()}</tbody></table></div>${mobileProjects()}`
  const overlay = state === 'create' ? projectDialog(false) : state === 'edit' ? projectDialog(true) : state === 'delete' ? deleteProjectDialog() : ''
  return appShell(`<main class="page-frame">${pageHeading('项目')}${body}</main>${overlay}`)
}

function treeRow({ name, level = 0, folder = true, open = false, selected = false, id = '', dragClass = '' }) {
  return `<div class="tree-row ${selected ? 'selected' : ''} ${dragClass}" style="padding-left:${5 + level * 17}px" data-node="${id || name}">
    <button type="button" class="tree-grip" aria-label="拖动 ${name}">${icon('grip-vertical', 14)}</button>
    <button type="button" class="tree-toggle" aria-label="${open ? '折叠' : '展开'}">${folder ? icon(open ? 'chevron-down' : 'chevron-right', 14) : ''}</button>
    <button type="button" class="tree-label">${icon(open ? 'folder-open' : 'folder', 15)}<span>${name}</span></button>
    <button type="button" class="icon-button" aria-label="管理 ${name}" data-state="menu">${icon('ellipsis', 15)}</button>
  </div>`
}

function directoryTree(state) {
  const dragReady = ['drag-ready', 'dragging', 'drop-root', 'drop-after'].includes(state)
  const rootOver = state === 'drop-root'
  const fridgeDrop = state === 'drop-after'
  return `<div class="root-drop ${dragReady ? 'ready' : ''} ${rootOver ? 'over' : ''}">${icon('folder-root', 15)}<span>${rootOver ? '释放后移到项目根目录末尾' : dragReady ? '拖到这里成为一级目录' : '项目根目录'}</span></div>
    <div class="tree" role="tree">
      ${treeRow({ name: '硬装施工', open: true, id: 'construction' })}
      ${treeRow({ name: '水电', level: 1, open: true, id: 'electric' })}
      ${treeRow({ name: '强弱电点位', level: 2, folder: false, id: 'power' })}
      ${treeRow({ name: '墙面与地面', level: 1, id: 'wall' })}
      ${treeRow({ name: '家具家电', open: true, id: 'furniture' })}
      ${treeRow({ name: '大家电', level: 1, open: true, id: 'appliance' })}
      ${treeRow({ name: '冰箱', level: 2, folder: false, selected: ['selected','empty-node','menu','node-edit','node-move','node-delete','move-error','drag-done'].includes(state), id: 'fridge', dragClass: fridgeDrop ? 'drop-after' : '' })}
      ${treeRow({ name: '洗衣机', level: 2, folder: false, id: 'washer', dragClass: ['dragging','drop-root','drop-after'].includes(state) ? 'dragging' : '' })}
      ${treeRow({ name: '空调', level: 2, folder: false, id: 'ac' })}
      ${treeRow({ name: '家具', level: 1, id: 'home-furniture' })}
      ${treeRow({ name: '预算与采购', id: 'budget' })}
      ${treeRow({ name: '施工验收', id: 'check' })}
    </div>`
}

function projectTopbar() {
  return `<header class="project-topbar"><button type="button" class="icon-button desktop-back" data-page="projects" data-state="list" aria-label="返回项目列表">${icon('arrow-left')}</button><div class="project-heading"><span class="status green">进行中</span><h1>新房装修</h1><span class="count">28 个目录节点</span></div><div class="project-actions"><button type="button" class="icon-button" data-state="settings" aria-label="项目设置">${icon('settings-2', 16)}</button><button type="button" class="icon-button danger-icon" data-state="delete" aria-label="删除项目">${icon('trash-2', 16)}</button></div></header>`
}

function selectedContent(emptyNode = false) {
  return `<nav class="breadcrumbs" aria-label="节点路径"><button>新房装修</button><span>${icon('chevron-right', 12)}<button>家具家电</button></span><span>${icon('chevron-right', 12)}<button>大家电</button></span><span>${icon('chevron-right', 12)}<button>冰箱</button></span></nav>
    <section class="node-header"><div class="node-copy"><h2>冰箱</h2><p>整理冰箱尺寸、散热方式、安装条件和候选型号。</p></div><div class="node-actions"><button type="button" class="button" data-state="node-edit">编辑节点</button><button type="button" class="button primary" data-state="node-create">${icon('plus', 15)}创建子节点</button></div></section>
    <section class="children"><header class="section-head"><h3>子节点</h3><span>${emptyNode ? 0 : 2} 个</span></header>${emptyNode ? `<div class="inline-empty">${icon('folder', 21)}<div><strong>还没有子节点</strong><span>手动创建节点，不会自动采用 AI 目录。</span></div></div>` : `<div class="child-list"><button class="child-row">${icon('folder', 17)}<span><strong>安装条件</strong><small>尺寸、散热和插座位置</small></span>${icon('chevron-right', 16)}</button><button class="child-row">${icon('folder', 17)}<span><strong>候选型号</strong><small>按容量和开门方式整理</small></span>${icon('chevron-right', 16)}</button></div>`}</section>`
}

function overviewContent() {
  return `<nav class="breadcrumbs"><button>项目</button><span>${icon('chevron-right', 12)}<button>新房装修</button></span></nav><section class="overview"><h2>新房装修</h2><p>施工与采购阶段，重点整理家电参数和安装条件。</p><div class="overview-metrics"><div class="metric"><strong>28</strong><span>目录节点</span></div><div class="metric"><strong>3</strong><span>一级目录</span></div><div class="metric"><strong>今天 21:14</strong><span>最近更新</span></div></div></section>`
}

function mobileDirectory(state, emptyDirectory = false, emptyNode = false) {
  const path = prototypeState.path
  const inProject = path.length > 0
  const current = nodeAtPath(path)
  const children = childrenOf(path)
  const isEmpty = emptyDirectory || emptyNode || children.length === 0
  const title = current ? current.name : '新房装修'
  const description = current ? current.description : '施工与采购阶段，重点整理家电参数和安装条件。'
  const plusAria = current ? '创建子节点' : '创建根节点'
  const childRows = children.map(child => `<button class="mobile-child" data-child="${child.name}">${icon('folder', 18)}<span><strong>${child.name}</strong><small>${child.description || ''}</small></span>${icon('chevron-right', 17)}</button>`).join('')
  const emptyMarkup = `<div class="mobile-empty-state"><div>${icon('folder', 24)}<strong>${emptyDirectory ? '知识目录为空' : '还没有子节点'}</strong><p>手动创建节点，不会自动采用 AI 目录。</p><button class="button primary" data-state="node-create">${emptyDirectory ? '创建第一个节点' : '创建子节点'}</button></div></div>`
  const nodeActions = inProject ? `<div class="mobile-node-actions"><button class="button small" data-state="node-edit">编辑节点</button><button type="button" class="icon-button" data-state="menu" aria-label="节点操作">${icon('ellipsis', 16)}</button></div>` : ''
  return `<main class="mobile-project-directory"><nav class="mobile-breadcrumb"><button class="mobile-back" data-back>${icon('arrow-left', 16)}${inProject ? '上一层' : '项目列表'}</button><span class="mobile-path">${['新房装修', ...path].join(' / ')}</span></nav><section class="mobile-node-header"><h2>${title}</h2>${description ? `<p>${description}</p>` : ''}${nodeActions}</section><section class="mobile-level"><header class="mobile-level-head"><div><h3>${current ? '子节点' : '根目录'}</h3><span>${isEmpty ? 0 : children.length} ${current ? '个子节点' : '个一级目录'}</span></div>${isEmpty ? '' : `<button type="button" class="icon-button" data-state="node-create" aria-label="${plusAria}">${icon('plus')}</button>`}</header>${isEmpty ? emptyMarkup : `<div class="mobile-child-list">${childRows}</div>`}</section></main>`
}

function nodeMenu() {
  return `<div class="menu tree-menu" role="menu"><button data-state="node-create">${icon('folder-plus', 15)}创建子节点</button><button data-state="node-edit">${icon('pencil', 15)}编辑节点</button><button data-state="node-move">${icon('move', 15)}移动到…</button><div class="menu-separator"></div><button class="danger-text" data-state="node-delete">${icon('trash-2', 15)}删除子树</button></div>`
}

function nodeDialog(editing = false, parentName = '大家电') {
  return `<div class="dialog-backdrop"><section class="dialog small-dialog" role="dialog" aria-modal="true" aria-label="${editing ? '编辑节点' : '创建节点'}"><header class="dialog-header"><div><h2>${editing ? '编辑节点' : '创建子节点'}</h2></div><button class="icon-button" data-close aria-label="关闭">${icon('x')}</button></header><div class="dialog-body"><p class="dialog-description">${editing ? '修改节点名称不会影响后代节点。' : `上级节点：${parentName}`}</p><form class="form-stack"><label class="field"><span class="field-label">节点名称 <span class="field-hint">必填</span></span><input value="${editing ? '冰箱' : ''}" placeholder="例如：冰箱" /></label><div class="dialog-actions"><button type="button" class="button" data-close>取消</button><button type="button" class="button primary">${editing ? '保存更改' : '创建节点'}</button></div></form></div></section></div>`
}

function moveDialog() {
  return `<div class="dialog-backdrop"><section class="dialog small-dialog" role="dialog" aria-modal="true" aria-label="移动节点"><header class="dialog-header"><div><h2>移动“冰箱”</h2></div><button class="icon-button" data-close aria-label="关闭">${icon('x')}</button></header><div class="dialog-body"><p class="dialog-description">选择新的上级节点。完整子树会一起移动，且最大深度不能超过 6 层。</p><div class="move-list"><button class="move-option">${icon('folder-root', 15)}项目根目录</button><button class="move-option">${icon('folder', 15)}硬装施工</button><button class="move-option">${icon('folder', 15)}家具家电</button><button class="move-option selected">${icon('folder-open', 15)}家具家电 / 大家电</button><button class="move-option">${icon('folder', 15)}预算与采购</button></div><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button primary">确认移动</button></div></div></section></div>`
}

function deleteNodeDialog() {
  return `<div class="dialog-backdrop"><section class="dialog small-dialog" role="dialog" aria-modal="true" aria-label="删除子树"><header class="dialog-header"><div class="danger-heading">${icon('trash-2')}<h2>删除“冰箱”子树？</h2></div><button class="icon-button" data-close aria-label="关闭">${icon('x')}</button></header><div class="dialog-body"><p class="dialog-description">将永久删除此节点及全部后代，当前版本无法恢复。</p><div class="danger-note"><strong>将删除 3 个节点</strong><span>冰箱、安装条件、候选型号</span></div><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button danger">删除 3 个节点</button></div></div></section></div>`
}

function renderWorkspace() {
  const state = prototypeState.pageState
  const emptyDirectory = state === 'empty-directory'
  const emptyNode = state === 'empty-node'
  const selected = !['overview','empty-directory','load-error','settings'].includes(state)
  const dragState = ['drag-ready','dragging','drop-root','drop-after'].includes(state)
  let desktopContent = selected ? selectedContent(emptyNode) : overviewContent()
  if (state === 'load-error') desktopContent = errorState('项目目录加载失败', '项目上下文已保留，当前结果不代表空目录。')
  const mobileDragNotice = dragState ? `<div class="workspace-alert mobile-drag-notice">${icon('info', 15)}移动端不提供拖拽，请从节点菜单使用“移动到…”操作。</div>` : ''
  const directory = emptyDirectory ? `<div class="tree-empty"><div>${icon('folder', 24)}<strong>知识目录为空</strong><p>手动创建节点，不会自动采用 AI 目录。</p><button class="button primary" data-state="node-create">创建第一个节点</button></div></div>` : directoryTree(state)
  const alert = state === 'move-error' ? `<div class="workspace-alert" role="alert">${icon('triangle-alert', 16)}节点移动失败，目录已按服务端结果重新加载。请检查目标层级后重试。</div>` : mobileDragNotice
  const menu = state === 'menu' ? nodeMenu() : ''
  const parentName = prototypeState.path.length ? prototypeState.path[prototypeState.path.length - 1] : '项目根目录'
  const overlay = state === 'settings' ? projectDialog(true, true) : state === 'node-create' ? nodeDialog(false, parentName) : state === 'node-edit' ? nodeDialog(true) : state === 'node-move' ? moveDialog() : state === 'node-delete' ? deleteNodeDialog() : ''
  const toast = state === 'drag-done' ? `<div class="success-toast">${icon('circle-check', 16)}“洗衣机”已移动到项目根目录</div>` : ''
  return appShell(`${projectTopbar()}${alert}<div class="workspace-grid"><aside class="directory-panel"><header class="directory-head"><div><strong>知识目录</strong></div><button class="icon-button" data-state="node-create" aria-label="创建根节点">${icon('plus')}</button></header>${directory}</aside><main class="workspace-content">${desktopContent}</main>${mobileDirectory(state, emptyDirectory, emptyNode)}</div>${menu}${overlay}${toast}`)
}

function renderLogin() {
  const state = prototypeState.pageState
  const error = state === 'error'
  const loading = state === 'loading'
  return `<main class="login-canvas"><section class="login-context"><div class="brand-lockup"><span class="brand-mark">KS</span><span>KnowStruct</span></div><div class="context-snapshot"><header><div><span class="eyebrow">最近维护</span><strong>新房装修</strong></div><span class="status green">进行中</span></header><div class="context-path">新房装修 / 家具家电 / 大家电</div><div class="context-node">${icon('folder-open', 22)}<div><strong>冰箱</strong><span>尺寸、散热、安装条件和候选型号</span></div></div><div class="context-list"><div>${icon('folder', 16)}<span>安装条件</span>${icon('chevron-right', 15)}</div><div>${icon('folder', 16)}<span>候选型号</span>${icon('chevron-right', 15)}</div></div></div><div class="context-structure"><span>项目</span><span>目录</span><span>正式记录</span></div></section><section class="login-area"><div class="login-panel"><div class="brand-lockup mobile-login-brand"><span class="brand-mark">KS</span><span>KnowStruct</span></div><header class="login-heading"><h1>登录 KnowStruct</h1><p>使用已有账号进入你的项目和知识目录。</p></header><form class="login-form"><label class="field"><span class="field-label">账号</span><input class="${error ? 'invalid' : ''}" placeholder="请输入账号" aria-invalid="${error}" /></label><label class="field"><span class="field-label">密码</span><span class="password-field"><input type="password" class="${error ? 'invalid' : ''}" placeholder="请输入密码" aria-invalid="${error}" /><button type="button" class="icon-button" aria-label="显示密码">${icon('eye', 17)}</button></span></label><label class="check-option"><input type="checkbox" />保持登录</label>${error ? `<div class="login-alert" role="alert">${icon('circle-alert', 15)}请输入账号和密码</div>` : ''}<button type="button" class="button primary login-submit" data-login-submit ${loading ? 'disabled' : ''}>${loading ? '<span class="spinner"></span>登录中' : '登录'}</button></form><p class="login-boundary">当前版本仅支持已有账号登录，不提供用户注册或找回密码。</p></div></section></main>`
}

function renderSpec() {
  return `<main class="spec-page"><header class="spec-header"><span class="eyebrow">UI foundations · Round 01</span><h1>轻量 UI 规范</h1><p>用于登录、项目列表和知识目录工作区的第一轮统一视觉基线。</p></header><div class="spec-layout">
    <section class="spec-section wide"><h2>色彩</h2><div class="swatches">${[
      ['#1D242C','主文字'],['#6B7682','辅助文字'],['#FFFFFF','主表面'],['#EEF1F4','页面背景'],['#2767D8','主要操作'],['#287A4B','成功'],['#8A5A11','警告'],['#B33A32','危险'],['#EAF1FD','选中背景'],['#D9DEE4','边框'],['#F1F3F5','次级表面'],['#FBFCFD','导航表面'],
    ].map(([color,label]) => `<div class="swatch"><div class="swatch-color" style="background:${color}"></div><strong>${label}</strong><span>${color}</span></div>`).join('')}</div></section>
    <section class="spec-section"><h2>字体层级</h2><div class="type-samples"><div class="type-row"><span>28 / 1.25 / 740</span><strong class="type-display">项目</strong></div><div class="type-row"><span>20 / 1.3 / 740</span><strong class="type-title">知识目录</strong></div><div class="type-row"><span>14 / 1.4 / 700</span><strong class="type-section">子节点</strong></div><div class="type-row"><span>12 / 1.65 / 500</span><strong class="type-body">整理冰箱尺寸与安装条件</strong></div><div class="type-row"><span>10 / 1.5 / 500</span><strong class="type-caption">今天 21:14 更新</strong></div></div></section>
    <section class="spec-section"><h2>间距与圆角</h2><div class="spacing-demo">${[4,8,12,16,24,32].map(value => `<div class="space-item"><div class="space-box" style="height:${value}px"></div><span>${value}</span></div>`).join('')}</div><p class="muted" style="font-size:10px;margin:14px 0 0">基础间距 4px；控件圆角 5-6px；容器与弹窗最大 8px。</p></section>
    <section class="spec-section wide"><h2>按钮与状态标签</h2><div class="component-row"><button class="button primary">${icon('plus',15)}主要操作</button><button class="button">${icon('settings-2',15)}次要操作</button><button class="button ghost">文字操作</button><button class="button danger">危险操作</button><button class="button primary" disabled>处理中</button><span class="status blue">规划中</span><span class="status green">进行中</span><span class="status amber">已暂停</span><span class="status gray">已完成</span><span class="status red">失败</span></div></section>
    <section class="spec-section wide"><h2>输入框</h2><div class="field-samples"><label class="field"><span class="field-label">默认</span><input placeholder="请输入项目名称" /></label><label class="field"><span class="field-label">聚焦</span><input style="border-color:var(--primary);box-shadow:var(--focus)" value="新房装修" /></label><label class="field"><span class="field-label">错误</span><input class="invalid" value="" placeholder="项目名称不能为空" /><span class="field-error">请输入项目名称</span></label></div></section>
    <section class="spec-section"><h2>菜单</h2><div class="menu mini-menu"><button>${icon('folder-plus',15)}创建子节点</button><button>${icon('pencil',15)}编辑节点</button><button>${icon('move',15)}移动到…</button><div class="menu-separator"></div><button class="danger-text">${icon('trash-2',15)}删除子树</button></div></section>
    <section class="spec-section"><h2>空状态与错误状态</h2><div class="state-samples"><div class="mini-state"><div>${icon('folder',22)}<strong>还没有项目</strong><span>先建立一个知识主题</span></div></div><div class="mini-state"><div style="color:var(--danger)">${icon('triangle-alert',22)}<strong>加载失败</strong><span>保留上下文并提供重试</span></div></div></div></section>
    <section class="spec-section wide"><h2>弹窗</h2><div class="component-row"><button class="button" data-page="projects" data-state="create">查看表单弹窗</button><button class="button danger" data-page="workspace" data-state="node-delete">查看危险确认</button><span class="muted" style="font-size:10px">桌面居中；390px 采用底部面板，操作区保持完整可见。</span></div></section>
  </div></main>`
}

function renderPrototype() {
  const root = document.querySelector('#prototype-root')
  const renderers = { login: renderLogin, projects: renderProjects, workspace: renderWorkspace, spec: renderSpec }
  root.innerHTML = `<div class="ks-app">${renderers[prototypeState.page]()}</div>`
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } })
}

function refreshStateOptions() {
  const stateSelect = document.querySelector('#state-select')
  stateSelect.innerHTML = pageDefinitions[prototypeState.page].states.map(([value, label]) => `<option value="${value}" ${value === prototypeState.pageState ? 'selected' : ''}>${label}</option>`).join('')
}

function syncWorkspacePath(state) {
  if (prototypeState.page !== 'workspace') return
  if (['overview', 'empty-directory', 'settings'].includes(state)) {
    prototypeState.path = []
  } else if (['selected', 'empty-node'].includes(state)) {
    prototypeState.path = ['家具家电', '大家电', '冰箱']
  }
}

function setPage(page, pageState) {
  if (!pageDefinitions[page]) return
  prototypeState.page = page
  const validStates = pageDefinitions[page].states.map(([value]) => value)
  prototypeState.pageState = validStates.includes(pageState) ? pageState : validStates[0]
  syncWorkspacePath(prototypeState.pageState)
  document.querySelector('#page-select').value = page
  refreshStateOptions()
  renderPrototype()
}

function setPageState(nextState) {
  const validStates = pageDefinitions[prototypeState.page].states.map(([value]) => value)
  if (!validStates.includes(nextState)) return
  prototypeState.pageState = nextState
  syncWorkspacePath(nextState)
  document.querySelector('#state-select').value = nextState
  renderPrototype()
}

function setViewport(viewport) {
  if (!viewportDefinitions[viewport]) return
  prototypeState.viewport = viewport
  document.querySelector('.viewport-shell').dataset.viewport = viewport
  document.querySelector('#viewport-name').textContent = viewportDefinitions[viewport].label
  document.querySelector('#viewport-size').textContent = viewportDefinitions[viewport].size
  document.querySelectorAll('[data-viewport]').forEach(button => button.classList.toggle('active', button.dataset.viewport === viewport))
  renderPrototype()
}

const pageSelect = document.querySelector('#page-select')
pageSelect.innerHTML = Object.entries(pageDefinitions).map(([value, definition]) => `<option value="${value}">${definition.label}</option>`).join('')
pageSelect.value = prototypeState.page
refreshStateOptions()

pageSelect.addEventListener('change', event => setPage(event.target.value))
document.querySelector('#state-select').addEventListener('change', event => setPageState(event.target.value))
document.querySelectorAll('[data-viewport]').forEach(button => button.addEventListener('click', () => setViewport(button.dataset.viewport)))

document.querySelector('#focus-toggle').addEventListener('click', () => {
  prototypeState.focus = !prototypeState.focus
  document.body.classList.toggle('focus-mode', prototypeState.focus)
})

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && prototypeState.focus) {
    prototypeState.focus = false
    document.body.classList.remove('focus-mode')
  }
})

document.querySelector('#prototype-root').addEventListener('click', event => {
  const target = event.target.closest('button, tr, article, [data-node]')
  if (!target) return
  if (target.dataset.back !== undefined) {
    if (prototypeState.page === 'workspace' && prototypeState.path.length > 0) {
      prototypeState.path.pop()
      renderPrototype()
    } else {
      setPage('projects', 'list')
    }
    return
  }
  if (target.dataset.child !== undefined) {
    if (prototypeState.page === 'workspace') {
      prototypeState.path.push(target.dataset.child)
      renderPrototype()
    }
    return
  }
  if (target.dataset.close !== undefined) {
    setPageState(prototypeState.page === 'projects' ? 'list' : 'selected')
    return
  }
  if (target.dataset.loginSubmit !== undefined) {
    setPageState('loading')
    return
  }
  if (target.dataset.page) {
    setPage(target.dataset.page, target.dataset.state)
    return
  }
  if (target.dataset.state) {
    setPageState(target.dataset.state)
    return
  }
  if (target.dataset.node) setPage('workspace', target.dataset.node === 'fridge' ? 'selected' : 'overview')
})

renderPrototype()
