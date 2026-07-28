# KnowStruct — 知识经验管理工具

将零散经验、截图、链接、商品信息和个人记录，通过 AI 辅助整理为结构化知识图谱，并支持持续补充、冲突审查和决策沉淀。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| 移动 UI | TDesign Mobile React |
| 后端 | Python 3.12 + FastAPI |
| 数据库 | MySQL 8.0+（阿里云 RDS） |
| AI | DeepSeek / 豆包 / PaddleOCR（可替换） |
| 部署 | 阿里云 ECS + Nginx |

## 项目结构

```
KnowStruct/
├── frontend/              # React 前端
│   ├── src/
│   │   ├── components/    # 通用组件
│   │   ├── pages/         # 页面
│   │   ├── hooks/         # 自定义 Hooks
│   │   └── lib/           # 工具库（API 客户端等）
│   └── package.json
├── backend/               # FastAPI 后端
│   ├── app/
│   │   ├── api/           # API 路由
│   │   ├── models/        # SQLAlchemy 数据模型
│   │   ├── schemas/       # Pydantic 请求/响应模型
│   │   ├── services/      # 业务逻辑
│   │   ├── ai/            # AI Provider 抽象层
│   │   └── utils/         # 工具函数
│   ├── tests/
│   ├── alembic/           # 数据库迁移
│   └── pyproject.toml
├── docs/                  # 文档
│   └── tech-stack.md
└── README.md
```

## 快速开始

### 前置要求

- Node.js 20+
- Python 3.12+
- MySQL 8.0+（本地开发可用 Homebrew 安装：`brew install mysql`）

### 1. 准备数据库

```sql
CREATE DATABASE knowstruct CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'knowstruct'@'localhost' IDENTIFIED BY 'knowstruct';
GRANT ALL PRIVILEGES ON knowstruct.* TO 'knowstruct'@'localhost';
```

### 2. 启动后端

```bash
cd backend

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install fastapi uvicorn sqlalchemy aiomysql alembic pydantic pydantic-settings python-jose httpx python-multipart

# 启动开发服务器
uvicorn app.main:app --reload --port 8000
```

### 3. 启动前端

```bash
cd frontend

npm install
npm run dev
```

访问 **http://localhost:5174**

## 路由

| 路径 | 页面 |
|------|------|
| `/` | 项目列表首页 |
| `/projects/:id` | 项目详情（知识目录树） |
| `/projects/:id/nodes/:nid` | 节点详情 |
| `/inbox` | 采集箱 |
| `/search` | 搜索 |
| `/review` | AI Review |

## 开发状态

- [x] 项目初始化
- [x] 前端骨架（路由 + 页面占位）
- [x] 后端骨架（FastAPI + AI 抽象层）
- [ ] 数据模型设计与数据库迁移
- [ ] API 接口实现
- [ ] AI Provider 接入
- [ ] 核心功能开发
