# Web-Package - 网站封装APP平台

> 将任意网站快速封装为 Android APK 安装包，支持自定义应用名称、包名、图标、启动屏等，一键生成可安装的安卓应用。

---

## 目录

- [项目概述](#项目概述)
- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [环境要求](#环境要求)
- [安装指南](#安装指南)
- [配置说明](#配置说明)
- [使用示例](#使用示例)
- [API 接口文档](#api-接口文档)
- [数据库设计](#数据库设计)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 项目概述

Web-Package 是一个自部署的网站转 Android APP 平台。用户输入网站 URL 和应用配置信息，系统自动使用 Gradle + Android SDK 构建出可安装的 APK 文件。支持用户注册登录、构建记录管理、夹子分类、收藏备注等功能。

**适用场景**：
- 将企业官网、H5 应用、Web 工具快速封装为安卓应用
- 批量生成不同网站的 APK 安装包
- 内部团队使用的 Web 应用移动化部署

---

## 功能特性

### 核心功能
| 功能 | 说明 |
|------|------|
| 网站封装 | 输入 URL，自动生成 Android APK |
| 自定义配置 | 应用名称、包名、版本号、图标、启动屏 |
| 图标裁剪 | 上传图标后在线裁剪，确保尺寸适配 |
| 启动屏设置 | 自定义启动画面，防止应用启动黑屏 |
| 实时构建 | WebSocket 推送构建进度，实时查看状态 |
| 网址验证 | 提交前验证 URL 可达性，拦截内网地址 |

### 用户系统
| 功能 | 说明 |
|------|------|
| 注册/登录 | 支持中文用户名、手机号（必填）、密码 |
| JWT 认证 | Token 持久化到文件，服务重启不失效 |
| 每日配额 | 登录用户 20 次/天，游客 3 次/天 |
| 密码安全 | bcryptjs 哈希（cost=12），不存储明文 |

### 构建管理（我的构建）
| 功能 | 说明 |
|------|------|
| 夹子系统 | 全部 / 已删除 / 未分类 三个系统夹子 + 自定义夹子 |
| 收藏 | 标记常用构建，支持按收藏筛选 |
| 重命名 | 修改构建记录的显示名称 |
| 移动 | 将构建记录在夹子之间移动 |
| 备注 | 为构建记录添加备注（最多 500 字） |
| 软删除 | 删除 APK 但保留历史记录，自动归入"已删除"夹子 |
| 搜索 | 按应用名称、备注内容搜索 |
| 排序 | 按时间正序/倒序 |
| 状态筛选 | 按完成/失败/构建中/收藏筛选 |

### 存储与下载
| 角色 | 存储 | 下载 |
|------|------|------|
| 登录用户 | 永久保存 | 无限次下载 |
| 游客 | 24 小时临时存储 | 最多 5 次下载 |

### 界面交互
- Toast 提示系统（成功/失败/警告/信息 4 种类型）
- 按钮操作锁，防止重复点击
- 构建完成后自动刷新列表
- 响应式布局，适配不同屏幕
- 时间精确到分钟（`YYYY-MM-DD HH:mm`）

---

## 技术架构

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端框架 | Express 4.x | HTTP 服务与路由 |
| 数据库 | SQLite (better-sqlite3) | 单文件数据库，WAL 模式 |
| 认证 | JWT (HS256) + bcryptjs | 无状态认证，密码哈希 |
| 实时通信 | WebSocket (ws) | 构建进度推送 |
| 图片处理 | Sharp | 图标裁剪与缩放 |
| 前端 | 原生 HTML/CSS/JavaScript | 无框架依赖 |
| 模板引擎 | EJS | 错误页面渲染 |
| APK 构建 | Gradle + Android SDK | 模板替换 + 编译打包 |

---

## 环境要求

### 必需环境

| 软件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | >= 18 | 运行时环境 |
| npm | >= 9 | 包管理器 |
| Java JDK | 11 或 17 | Android 构建需要 |
| Android SDK | API 33+ | 包含 build-tools、platform-tools |
| Gradle | 8.0 | 项目内置 wrapper，无需单独安装 |

### 操作系统
- **Windows 10/11**（推荐，已充分测试）
- macOS / Linux 理论上可用，但需要调整路径配置

### 硬件建议
- 内存：至少 4 GB 可用（Gradle 构建占用较大）
- 磁盘：至少 2 GB 可用空间（Android SDK + 构建产物）

---

## 安装指南

### 第一步：克隆项目

```bash
git clone https://github.com/chairmanxiwei/app-fengzhaung.git
cd app-fengzhaung
```

### 第二步：安装 Node.js 依赖

```bash
npm install
```

> 如果 `better-sqlite3` 编译失败，请确保已安装 Python 3 和 C++ 编译工具链（Windows 下执行 `npm install --global windows-build-tools`）。

### 第三步：搭建 Android 构建环境

项目提供了自动搭建脚本，可一键下载 JDK 和 Android SDK：

```bash
node setup-android-env.js
```

该脚本会自动：
1. 下载 JDK 11（使用国内镜像加速）
2. 下载 Android SDK command-line tools
3. 安装必要的 SDK 组件（platform-tools、build-tools、platforms）
4. 配置到 `android-sdk/` 目录

**手动搭建**（如果自动脚本失败）：

1. 下载 [JDK 17](https://adoptium.net/) 并解压到 `android-sdk/jdk-17/`
2. 下载 [Android SDK Command-line Tools](https://developer.android.com/studio#command-line-tools-only) 并解压到 `android-sdk/android-sdk/`
3. 使用 sdkmanager 安装必要组件：
   ```bash
   sdkmanager "platform-tools" "build-tools;33.0.2" "platforms;android-33"
   ```

### 第四步：生成签名密钥

```bash
mkdir keystore
keytool -genkey -v -keystore keystore/release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias web2app
```

按提示输入密钥密码和相关信息，记住你设置的密码。

### 第五步：配置环境变量

复制并编辑环境变量文件：

```bash
# 编辑 .env.android，填入你的实际路径
```

`.env.android` 内容示例：

```ini
# JDK 路径（改为你的实际路径）
JAVA_HOME=D:/网站封装app/android-sdk/jdk-17
JDK_17_HOME=D:/网站封装app/android-sdk/jdk-17

# Android SDK 路径
ANDROID_HOME=D:/网站封装app/android-sdk/android-sdk

# 签名密钥配置
KEYSTORE_PATH=D:/网站封装app/keystore/release.jks
KEYSTORE_PASSWORD=你的密钥密码
KEY_ALIAS=web2app
KEY_PASSWORD=你的密钥密码
```

> **注意**：路径中的反斜杠 `\` 在某些情况下可能导致问题，建议使用正斜杠 `/`。

### 第六步：初始化数据库

数据库会在首次启动时**自动创建和初始化**，无需手动操作。SQLite 数据库文件位于 `data/webpackage.db`。

### 第七步：启动服务器

```bash
# 生产模式
node server.js

# 开发模式（自动重启）
npm run dev
```

启动成功后会看到：
```
Web-Package 服务器运行在 http://localhost:3000
WebSocket 服务路径: ws://localhost:3000/ws/:taskId
数据库: D:\网站封装app\data\webpackage.db
```

### 第八步：访问应用

浏览器打开 [http://localhost:3000](http://localhost:3000) 即可使用。

---

## 配置说明

### 服务器配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | 服务端口，可通过环境变量覆盖 |
| `JWT_SECRET` | 自动生成 | JWT 签名密钥，持久化到 `data/.jwt_secret` |

### 构建配额

| 配置项 | 值 | 位置 |
|--------|-----|------|
| 登录用户每日构建数 | 20 | `services/taskService.js` → `QUOTA_LOGGED_IN` |
| 游客每日构建数 | 3 | `services/taskService.js` → `QUOTA_GUEST` |
| 游客最大下载次数 | 5 | `services/taskService.js` → `DOWNLOAD_LIMIT_GUEST` |
| 登录用户下载次数 | 无限 | `services/taskService.js` → `DOWNLOAD_LIMIT_LOGGED = -1` |
| 游客数据过期时间 | 24 小时 | `services/cleanService.js` |

### APK 构建参数

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 最低 SDK 版本 | 21 | Android 5.0 |
| 目标 SDK 版本 | 33 | Android 13 |
| 构建工具版本 | 33.0.2 | build-tools |

### 文件大小限制

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 图标最大尺寸 | 5 MB | 超出会提示 |
| 启动屏最大尺寸 | 5 MB | 超出会提示 |

---

## 使用示例

### 1. 游客快速封装

无需注册，直接在首页输入信息：

1. 在「网站地址」栏输入 `https://www.example.com`
2. 在「应用名称」栏输入 `示例应用`
3. 点击「生成安装包」
4. 等待构建完成，点击「下载」

> 游客每天限 3 次构建，APK 保留 24 小时，最多下载 5 次。

### 2. 注册用户完整流程

1. 点击右上角「登录/注册」
2. 切换到「注册」标签，填写用户名、邮箱、手机号、密码
3. 注册成功后自动登录
4. 在首页填写网站地址、应用名称、包名
5. 可选：上传自定义图标（支持裁剪）、启动屏图片
6. 点击「生成安装包」
7. 构建完成后可在「我的构建」中管理

### 3. 构建记录管理

1. 点击右上角「我的构建」打开管理面板
2. 左侧夹子导航：
   - **全部**：查看所有构建记录
   - **已删除**：查看已删除的记录
   - **未分类**：查看未归类的记录
   - **自定义夹子**：点击「+ 新建夹子」创建
3. 对每条记录可执行：收藏、下载、重命名、移动、备注、删除
4. 使用顶部搜索框和筛选器快速定位

---

## API 接口文档

### 认证接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | 否 |
| POST | `/api/auth/login` | 用户登录 | 否 |
| GET | `/api/auth/me` | 获取当前用户信息 | 是 |

### 任务接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/generate` | 创建构建任务 | 可选 |
| GET | `/api/tasks` | 获取任务列表 | 是 |
| GET | `/api/tasks/:id` | 获取任务详情 | 是 |
| DELETE | `/api/tasks/:id` | 删除任务（软删除） | 是 |
| PUT | `/api/tasks/:id/rename` | 重命名 | 是 |
| PUT | `/api/tasks/:id/move` | 移动到夹子 | 是 |
| PUT | `/api/tasks/:id/favorite` | 切换收藏 | 是 |
| PUT | `/api/tasks/:id/note` | 更新备注 | 是 |
| GET | `/api/download/:token` | 下载 APK | 否（令牌验证） |
| GET | `/api/quota` | 查询配额 | 可选 |

### 分类接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/categories` | 获取分类列表 | 是 |
| POST | `/api/categories` | 创建分类 | 是 |
| PUT | `/api/categories/:id` | 更新分类 | 是 |
| DELETE | `/api/categories/:id` | 删除分类 | 是 |

### 其他接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/validate-url` | 验证网址 | 否 |
| GET | `/api/ws/:taskId` | WebSocket 构建进度 | 否 |

### 请求/响应示例

**注册**：
```json
POST /api/auth/register
{
  "username": "张三",
  "email": "zhangsan@example.com",
  "phone": "13800138000",
  "password": "MyPass123"
}

// 响应
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "id": "usr_xxx", "username": "张三", "email": "zhangsan@example.com" }
  }
}
```

**创建构建任务**：
```json
POST /api/generate
{
  "url": "https://www.example.com",
  "appName": "示例应用",
  "packageName": "com.example.app"
}

// 响应
{
  "success": true,
  "data": {
    "taskId": "task_xxx",
    "status": "QUEUED"
  }
}
```

**获取任务列表**：
```
GET /api/tasks?page=1&limit=20&show_deleted=1&order=desc

// 响应
{
  "success": true,
  "data": {
    "tasks": [...],
    "pagination": { "page": 1, "limit": 20, "total": 35, "totalPages": 2 }
  }
}
```

---

## 数据库设计

系统使用 SQLite 数据库，首次启动自动创建，文件位于 `data/webpackage.db`。

### 表结构

#### users - 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 用户ID（usr_ 前缀） |
| username | TEXT UNIQUE | 用户名（支持中文，2-20字符） |
| email | TEXT UNIQUE | 邮箱 |
| phone | TEXT UNIQUE | 手机号（必填） |
| password_hash | TEXT | bcrypt 哈希密码 |
| role | TEXT | 角色（默认 user） |
| status | TEXT | 状态（默认 active） |
| created_at | TEXT | 创建时间 |

#### tasks - 任务表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 任务ID（task_ 前缀） |
| user_id | TEXT FK | 所属用户 |
| category_id | TEXT FK | 所属夹子 |
| url | TEXT | 网站地址 |
| app_name | TEXT | 应用名称 |
| package_name | TEXT | 包名 |
| display_name | TEXT | 显示名称（重命名用） |
| icon_path | TEXT | 图标路径 |
| status | TEXT | 状态：QUEUED/BUILDING/COMPLETED/FAILED |
| progress | INTEGER | 进度 0-100 |
| apk_path | TEXT | APK 文件路径 |
| apk_size | INTEGER | APK 文件大小 |
| apk_deleted | INTEGER | 软删除标记（0/1） |
| download_count | INTEGER | 下载次数 |
| max_downloads | INTEGER | 最大下载次数（-1 无限） |
| is_favorite | INTEGER | 收藏标记（0/1） |
| note | TEXT | 备注（最多 500 字） |
| expires_at | TEXT | 过期时间（游客 24h） |
| created_at | TEXT | 创建时间 |

#### categories - 分类表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 分类ID（cat_ 前缀） |
| user_id | TEXT FK | 所属用户 |
| name | TEXT | 夹子名称 |
| sort_order | INTEGER | 排序序号 |

#### quota_usage - 配额使用表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 记录ID |
| user_id | TEXT FK | 用户ID |
| ip_address | TEXT | IP 地址（游客用） |
| task_id | TEXT FK | 关联任务 |
| used_at | TEXT | 使用时间 |

#### operation_logs - 操作日志表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 日志ID |
| user_id | TEXT | 用户ID |
| task_id | TEXT | 任务ID |
| action | TEXT | 操作类型 |
| detail | TEXT | 操作详情 |
| ip_address | TEXT | IP 地址 |
| created_at | TEXT | 操作时间 |

---

## 项目结构

```
├── server.js                  # 入口文件，Express 服务配置
├── build-apk.js               # APK 构建脚本（模板替换 + Gradle 编译）
├── prepare-build.js           # 构建准备脚本（测试用）
├── setup-android-env.js       # Android 环境自动搭建脚本
├── .env.android               # 环境变量配置（JDK/SDK/密钥路径）
├── package.json               # 项目依赖
│
├── android-template/           # Android 项目模板
│   ├── app/src/main/           # 主代码（MainActivity、资源文件）
│   ├── gradle/wrapper/         # Gradle Wrapper
│   └── build.gradle            # Gradle 构建配置
│
├── db/
│   └── database.js             # 数据库初始化、建表、连接管理
│
├── middleware/
│   └── auth.js                 # JWT 认证中间件 + Token 持久化
│
├── routes/
│   ├── auth.js                 # 认证路由（注册/登录/用户信息）
│   ├── tasks.js                # 任务路由（CRUD/收藏/备注/移动/下载）
│   └── categories.js           # 分类路由（增删改查）
│
├── services/
│   ├── authService.js          # 认证服务（注册/登录/密码验证）
│   ├── taskService.js          # 任务服务（配额/创建/查询/软删除）
│   ├── categoryService.js      # 分类服务（CRUD + 计数）
│   ├── cleanService.js         # 清理服务（过期数据/临时文件）
│   └── logService.js           # 日志服务（操作记录）
│
├── public/                     # 前端静态文件
│   ├── index.html              # 主页面
│   ├── favicon.svg             # 网站图标
│   ├── css/
│   │   └── style.css           # 全局样式
│   └── js/
│       ├── main.js             # 主逻辑（构建表单/进度/WebSocket）
│       └── auth.js             # 认证与构建管理面板
│
├── views/
│   └── index.ejs               # EJS 错误页面模板
│
├── data/                       # 运行时数据（自动创建，已 gitignore）
│   ├── webpackage.db           # SQLite 数据库
│   └── .jwt_secret             # JWT 密钥
│
├── uploads/                    # 上传文件（自动创建，已 gitignore）
├── output/                     # APK 输出（自动创建，已 gitignore）
├── keystore/                   # 签名密钥（需手动创建，已 gitignore）
└── docs/
    └── 用户安装包管理系统设计文档.md  # 详细设计文档
```

---

## 常见问题

### 1. `npm install` 失败，better-sqlite3 编译报错

**原因**：better-sqlite3 需要本地编译 C++ 代码。

**解决方案**：
```bash
# Windows：安装编译工具
npm install --global windows-build-tools

# 确保已安装 Python 3
python --version

# 重新安装
npm install
```

### 2. 构建失败：`JAVA_HOME is not set`

**原因**：未配置 Java 环境变量。

**解决方案**：
1. 确认 `.env.android` 中的 `JAVA_HOME` 路径正确
2. 路径中不要有中文或特殊字符
3. 如果路径包含中文，项目会自动创建 Junction 链接映射到 `d:\web2app-build`

### 3. 构建失败：`Android SDK not found`

**原因**：Android SDK 未安装或路径配置错误。

**解决方案**：
```bash
# 运行自动搭建脚本
node setup-android-env.js

# 或手动下载 SDK 后配置 .env.android 中的 ANDROID_HOME
```

### 4. 构建失败：aapt2 中文路径报错

**原因**：Android 构建工具（aapt2）不支持非 ASCII 路径。

**解决方案**：项目已内置 Junction 链接机制，自动将 `android-sdk` 映射到 `d:\web2app-sdk`。如果仍有问题，将项目移到纯英文路径下。

### 5. 登录后刷新页面变成未登录

**原因**：JWT 密钥在服务重启时重新生成，导致旧 Token 失效。

**解决方案**：已修复。JWT 密钥持久化到 `data/.jwt_secret` 文件，重启不会改变。如果仍有问题，删除 `data/.jwt_secret` 后重启（所有用户需重新登录）。

### 6. 游客构建的 APK 找不到了

**原因**：游客数据 24 小时后自动过期清理。

**解决方案**：注册登录后构建，登录用户数据永久保存。

### 7. 端口 3000 被占用

**解决方案**：
```bash
# 方式1：设置环境变量
set PORT=8080 && node server.js

# 方式2：查找并关闭占用进程
netstat -ano | findstr :3000
taskkill /PID <进程ID> /F
```

### 8. 如何修改每日构建配额

编辑 `services/taskService.js` 顶部的常量：

```javascript
const QUOTA_LOGGED_IN = 20;  // 登录用户每日构建数
const QUOTA_GUEST = 3;       // 游客每日构建数
```

修改后重启服务器生效。

### 9. 如何备份数据

只需备份 `data/` 目录：

```bash
# 停止服务器后复制
xcopy /E /I data data_backup

# 或导出 SQL
sqlite3 data/webpackage.db ".dump" > backup.sql
```

### 10. 如何在局域网内访问

默认只监听 localhost，如需局域网访问，修改 `server.js`：

```javascript
// 将
app.listen(PORT, () => { ... });
// 改为
app.listen(PORT, '0.0.0.0', () => { ... });
```

然后通过 `http://你的IP:3000` 访问。

---

## 许可证

MIT License
