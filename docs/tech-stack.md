# KnowStruct 技术选型方案

## 总体架构

```
React SPA (移动端优先)  →  FastAPI REST API  →  MySQL
                              ↓
                         AI Provider 层
                        /       |        \
                   DeepSeek   豆包    本地 OCR
```

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + TypeScript + Vite | SPA，移动端优先响应式 |
| 移动 UI | TDesign Mobile React | 腾讯出品，国内移动端适配好 |
| 样式 | Tailwind CSS 4 | 原子化样式，响应式方便 |
| 状态管理 | Zustand + TanStack Query | 客户端状态 + 服务端缓存 |
| 路由 | React Router v7 | SPA 路由 |
| 后端 | Python 3.12+ + FastAPI | 异步高性能，AI 生态好 |
| ORM | SQLAlchemy 2.0 (async) + Alembic | 异步支持、迁移管理 |
| 数据校验 | Pydantic v2 | 与 FastAPI 深度集成 |
| 数据库 | MySQL 8.0+ | 阿里云 RDS 兼容，部署简单 |
| 文件存储 | 阿里云 OSS | 图片、附件 |
| 反向代理 | Nginx | 生产环境 |
| 包管理 | npm (前端) + uv/pip (后端) | |

---

## 1. 前端

同前，略。

---

## 2. 后端 (Python FastAPI)

### 项目结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 配置管理
│   ├── api/
│   │   ├── deps.py          # 依赖注入（DB session, current user）
│   │   ├── projects.py      # 项目 CRUD
│   │   ├── nodes.py         # 节点 CRUD + 树操作
│   │   ├── entries.py       # 记录 CRUD
│   │   ├── inbox.py         # 采集箱
│   │   ├── attachments.py   # 附件上传
│   │   ├── ai.py            # AI 能力接口
│   │   ├── reviews.py       # Review
│   │   ├── budgets.py       # 预算
│   │   ├── search.py        # 搜索
│   │   └── decisions.py     # 决策
│   ├── models/              # SQLAlchemy 模型
│   ├── schemas/             # Pydantic 请求/响应模型
│   ├── services/            # 业务逻辑
│   ├── ai/                  # AI Provider 抽象层
│   │   ├── base.py          # 抽象接口
│   │   ├── deepseek.py      # DeepSeek Provider
│   │   ├── doubao.py        # 豆包 Provider
│   │   └── local_ocr.py     # 本地 OCR 兜底
│   └── utils/
│       ├── tree.py          # 物化路径工具（纯字符串，MySQL 兼容）
│       └── storage.py       # OSS 文件存储
├── alembic/                 # 数据库迁移
├── tests/
├── pyproject.toml
└── .env
```

---

## 3. 数据库

### MySQL 8.0+ + 物化路径 (Materialized Path)

知识目录是核心，树形查询频繁。使用 **物化路径** 存储：普通 VARCHAR 字段，用 `.` 分隔层级。

```sql
CREATE TABLE nodes (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    parent_id CHAR(36),
    path VARCHAR(1000) NOT NULL,   -- 如 "furniture.appliances.fridge"
    title VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0,
    node_type VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nodes_path (path),
    INDEX idx_nodes_project (project_id)
);
```

**物化路径查询方式（MySQL）：**

- 子树查询：`WHERE path LIKE 'furniture.appliances%'`
- 直接子节点：`WHERE path REGEXP '^furniture\\.appliances\\.[^.]+$'`
- 祖先查询：`WHERE path = 'furniture' OR path = 'furniture.appliances'`（由应用层拆分路径前缀）
- 预算汇总：子节点花费按路径前缀 GROUP BY

对于个人项目的节点规模（通常 < 1000 个节点），这种方案完全够用。

### 核心表关系

```
projects
  ├── nodes (path 树形结构)
  │     ├── entries
  │     │     └── entry_sources
  │     ├── budgets
  │     ├── expenses
  │     └── decisions
  ├── sources
  ├── attachments
  ├── ai_extractions
  ├── reviews
  └── tasks
```

---

## 4. AI Provider 抽象层

统一 `AIProvider` 接口（提取候选 / OCR / 目录 / 审查等），实现可替换：

- `deepseek.py`：DeepSeek（OpenAI 兼容 SDK），文本候选提取。
- `doubao.py`：豆包视觉（火山方舟，OpenAI 兼容接口，默认 `https://ark.cn-beijing.volces.com/api/v3`），图片 OCR + 文本候选提取。
- `demo.py`：确定性本地验收 Provider（`AI_PROVIDER=demo`），OCR 返回固定演示文本。
- 本地 OCR 兜底：系统检测到 tesseract 二进制时，在 AI OCR 失败或返回空文本后自动回退。
- OCR 送审前生成压缩副本：最长边 >2048px 等比缩小、原格式 quality 80 重编码，降低按 token 计费的图片输入成本；原图保留用于预览与存档。

Provider 解析按 Workspace 进行：用户可在"我的"页配置 Provider / API Key（Fernet 加密入库、掩码回显、可更新删除），未配置时回退部署环境变量（`DEEPSEEK_*` / `DOUBAO_*`）。AI 输出始终为待确认候选，不直接写入正式记录。

---

## 5. 文件存储

### P0：本地目录（鉴权访问）

P0 图片附件落在 `backend/data/attachments/{workspace_id}/{source_id}/`，一条图片采集最多 3 张，元数据存 `source_attachments` 子表，通过鉴权端点 `/api/inbox/sources/{source_id}/attachments/{attachment_id}` 访问（校验 Workspace 归属），不挂公开静态目录。存储层保留 `AttachmentStorage` 抽象，OSS 接入位不变。

### 目标：阿里云 OSS

```
attachments/
├── images/{yyyy}/{mm}/{uuid}.{ext}
├── screenshots/{yyyy}/{mm}/{uuid}.{ext}
└── exports/{yyyy}/{mm}/{uuid}.{ext}
```

- 上传时生成 presigned URL 给前端直传
- 后端只存储文件路径和元信息

---

## 6. 部署方案

### 目标环境：阿里云 ECS + RDS (MySQL)

```
Nginx (SSL 终止, 静态资源)
  ├── /api/*  →  FastAPI (uvicorn, 多 worker)
  ├── /assets/*  →  静态文件 / CDN
  └── /*  →  React SPA index.html
```

- 数据库：阿里云 RDS MySQL 8.0
- 文件存储：阿里云 OSS
- 后端部署：ECS 上 systemd 管理 uvicorn 进程
- 前端部署：Nginx 直接 serve 静态文件，或挂 CDN
- 登录接口：Nginx 对 `/api/auth/login` 配置请求限流，作为应用内单实例限流之外的入口保护
- 会话安全：生产环境仅通过 HTTPS 下发 Secure、HttpOnly、SameSite=Lax Cookie，并限制可信 Origin

---

## 7. 变更记录

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-07-05 | PostgreSQL → MySQL | 阿里云 RDS MySQL 更便宜、运维更简单 |
| 2026-07-05 | 移除 Docker | 不需要，直接部署到 ECS |
| 2026-07-05 | 移除 Redis | 当前阶段不需要缓存，后续按需加 |
| 2026-08-05 | 实现采集箱与 AI 提取（`capture-text-to-entry`） | 新增 sources / processing_tasks / extractions / entries / entry_sources 表；MySQL 建表作为队列（乐观领取 + 进程内 worker）；`ai/deepseek.py`（OpenAI 兼容 SDK）与可选 `AI_PROVIDER=demo` 本地验收 Provider |
| 2026-08-05 | 图片 OCR 与用户级 AI 配置（`upload-image-and-ocr`） | sources 增加 image 类型与附件列；任务阶段扩展 `ocr → ai_extraction`（失败从失败步骤重试）；`ai/doubao.py` 豆包视觉 OCR + tesseract 兜底；`ai_provider_configs` 表加密保存用户 API Key，运行时按 Workspace 解析 |
| 2026-08-05 | 一条多图采集与统一开始提取（`multi-image-capture`） | 附件拆为 `source_attachments` 子表（一条最多 3 张）；图片改为客户端攒选后点"开始提取"一次性提交；OCR 循环合并"图 N"正文；送审前压缩到 2048px；文字 / 链接 / 图片按钮统一为"开始提取" |
