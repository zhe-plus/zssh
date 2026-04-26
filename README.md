# zssh

一款面向 Windows 的远程终端与文件传输工具，基于 Tauri v2 + React 19 + TypeScript 构建，后端使用 Rust 管理本地配置与 PTY 进程。

![Tauri](https://img.shields.io/badge/Tauri-v2-FFC107?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square)
![Rust](https://img.shields.io/badge/Rust-2021-orange?style=flat-square)

---

## 功能特性

### 连接管理
- 会话管理：新建、编辑、删除、复制会话
- 分组管理：创建分组、拖拽排序分组和会话、跨分组移动主机
- 收藏功能：收藏常用会话，快速访问
- 拖拽交互：基于 @dnd-kit 的流畅拖拽体验（DragOverlay 幽灵元素）
- 配置持久化：本地 JSON 存储，重启后配置不丢失
- 凭据安全：密码/私钥口令使用 Windows DPAPI 加密存储
- 协议支持：SSH / Telnet / RLogin

### SSH 终端
- 实时终端：xterm.js v5 + PTY 驱动 ssh.exe
- 多标签会话：支持同时打开多个终端标签页
- 标签操作：切换、关闭、拖拽重排标签顺序
- 标签分屏：水平/垂直分屏，独立终端实例
- HostKey 提示：首次连接自动识别并保存
- 密码自动填充：支持记住密码一键连接
- 快速连接：临时连接无需保存配置
- 命令历史：支持上下键浏览历史命令
- 复制选中：`Ctrl+Shift+C` 复制终端选中文本

### 终端配置
- 10 套 UI 主题：dark、monokai、solarized-dark、dracula、nord、github-dark、one-dark、tokyo-night、material、cobalt
- 字体设置：可自定义字体、字号、行高
- 编码支持：UTF-8、GBK、GB2312
- 光标样式：块状、下划线、竖线三种
- 布局模式：标准 / 紧凑 / 超紧凑

### SFTP 文件传输
- 目录浏览：树形目录结构，支持刷新、返回上级
- 文件操作：新建文件夹、重命名、删除、移动
- 拖拽上传：从本地拖拽文件到远端面板上传
- 拖拽下载：从远端拖拽文件到本地下载
- 传输进度：实时显示上传/下载进度
- 目录同步：终端 `cd` 后可同步 SFTP 工作目录

### 分屏布局
- 终端 + SFTP 同屏：左右或上下分屏
- 可调节面板：基于 react-resizable-panels，拖拽调整分屏比例
- 多终端分屏：同一标签内水平/垂直分割多个终端

### 用户界面
- 深色主题：默认深色界面，10 套配色方案可选
- 自定义标题栏：无边框窗口 + 自绘标题栏（WindowControls）
- 国际化：简体中文 / 繁體中文 / English 三语切换
- 紧凑模式：三档布局密度可选，节省屏幕空间
- 快捷命令：预设常用 SSH 命令，一键发送到终端
- 命令面板：`Ctrl+Shift+P` 全局搜索命令面板
- Toast 通知：基于 sonner 的轻量提示系统

---

## 系统要求

### 运行环境
- Windows 10/11 x64
- Windows OpenSSH Client（系统自带或启用"OpenSSH Client"可选功能）

### 开发环境
- Node.js 18+（建议 20+）
- Rust toolchain 2021 edition（rustup / cargo / rustc）
- Visual Studio Build Tools（C++ 构建工具）
- npm 或 pnpm

---

## 快速开始

### 安装依赖

```bash
cd zssh
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 构建安装包

```bash
# 构建 NSIS 安装包
npm run tauri build -- --bundles nsis

# 构建 MSI 安装包
npm run tauri build -- --bundles msi

# 同时构建两种安装包（默认行为）
npm run tauri build
```

### 构建产物

安装包位于：
```
src-tauri/target/release/bundle/
├── nsis/zssh_0.1.0_x64-setup.exe    # NSIS 安装包（支持中英文界面选择）
└── msi/zssh_0.1.0_x64_en-US.msi     # MSI 安装包
```

---

## 技术架构

### 项目结构

```
zssh/
├── src/                              # 前端（React 19 + TypeScript）
│   ├── main.tsx                      # 入口文件
│   ├── App.tsx                       # 主应用组件
│   ├── App.css                       # 全局样式
│   ├── types.ts                      # TypeScript 类型定义
│   ├── api.ts                        # Tauri IPC 调用封装
│   │
│   ├── components/                   # UI 组件
│   │   ├── AppComponents.tsx         # 公共组件（工具栏、弹窗、命令面板）
│   │   ├── Sidebar.tsx               # 侧边栏（会话列表 + 拖拽排序）
│   │   ├── TabBar.tsx                # 标签栏
│   │   ├── TerminalView.tsx          # 终端视图（xterm.js 封装）
│   │   ├── SftpPanel.tsx             # SFTP 文件管理面板
│   │   ├── SessionEditor.tsx         # 会话编辑器（新建/编辑表单）
│   │   ├── SettingsModal.tsx         # 设置弹窗（6 个设置页）
│   │   ├── Modal.tsx                 # 通用模态对话框
│   │   └── WindowControls.tsx        # 自定义窗口控制按钮
│   │
│   ├── store/
│   │   └── appStore.ts              # Zustand 状态管理（全局状态 + API 操作）
│   │
│   ├── hooks/
│   │   └── useShortcuts.ts          # 键盘快捷键 Hook
│   │
│   ├── lib/                          # 工具库
│   │   ├── themes.ts                # UI 主题色彩定义（10 套主题）
│   │   ├── i18n.ts                  # 国际化（zh-CN / zh-TW / en-US）
│   │   ├── defaultShortcuts.ts      # 默认快捷键配置
│   │   ├── defaultCommonCommands.ts # 默认常用命令列表
│   │   ├── debug.ts                 # 调试日志工具
│   │   ├── cn.ts                    # className 合并工具
│   │   └── layout.ts               # 布局模式判断
│   │
│   ├── styles/                       # 额外样式资源
│   └── assets/                       # 静态资源
│
├── src-tauri/                        # 后端（Rust）
│   ├── src/
│   │   ├── main.rs                  # Tauri 应用入口
│   │   ├── lib.rs                   # 主库：Tauri 命令定义、IPC 处理
│   │   ├── config.rs                # 配置文件读写（JSON 持久化）
│   │   ├── store.rs                 # 数据存储层抽象
│   │   ├── state.rs                 # 应用运行状态管理
│   │   ├── pty.rs                   # PTY 进程管理（创建/写入/调整大小）
│   │   ├── ssh.rs                   # SSH 连接辅助函数
│   │   ├── sftp.rs                  # SFTP 文件传输辅助
│   │   └── dpapi.rs                 # Windows DPAPI 加密/解密
│   ├── bin/
│   │   └── zssh_func_test.rs        # Rust 单元测试
│   ├── Cargo.toml                   # Rust 依赖声明
│   ├── tauri.conf.json              # Tauri 配置（窗口/打包/安全）
│   └── build.rs                     # Tauri 构建脚本
│
└── public/                           # 静态资源
```

### 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 桌面框架 | Tauri | v2 | 跨平台桌面应用框架 |
| 前端框架 | React | 19.x | UI 框架 |
| 语言 | TypeScript | 5.8 | 类型安全 |
| 状态管理 | Zustand | 5.x | 轻量级全局状态 |
| 终端模拟 | xterm.js | 5.x | 终端渲染引擎 |
| 拖拽排序 | @dnd-kit | 6.x / 10.x | 可访问性优先的 DnD 库 |
| 分屏面板 | react-resizable-panels | 3.x | 可调节分屏布局 |
| 图标 | lucide-react | 0.542 | 现代图标库 |
| 通知 | sonner | 2.x | Toast 提示 |
| 样式方案 | Tailwind CSS | v4 | 原子化 CSS + CSS 变量主题 |
| 构建工具 | Vite | 6.x | 前端构建工具 |
| 后端语言 | Rust | 2021 edition | 系统编程语言 |
| PTY | portable-pty | 0.8 | 跨平台伪终端 |
| 加密 | Windows DPAPI | — | 凭据加密存储 |

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` | 新建连接（快速连接） |
| `Ctrl+N` | 新建会话标签 |
| `Ctrl+W` | 关闭当前标签 |
| `Ctrl+Tab` | 切换到下一个标签 |
| `Ctrl+Shift+Tab` | 切换到上一个标签 |
| `Ctrl+Shift+C` | 复制终端选中内容 |
| `Ctrl+Shift+P` | 打开命令面板 |

> 快捷键可在设置中自定义。

---

## 数据存储

| 数据类型 | 存储位置 |
|----------|----------|
| 会话配置 | `%LOCALAPPDATA%\com.zhee.zssh\sessions.json` |
| 分组配置 | `%LOCALAPPDATA%\com.zhee.zssh\groups.json` |
| 应用设置 | `%LOCALAPPDATA%\com.zhee.zssh\settings.json` |
| Known Hosts | `%LOCALAPPDATA%\com.zhee.zssh\known_hosts` |
| 应用日志 | `%LOCALAPPDATA%\com.zhee.zssh\logs\` |

> 凭据（密码/私钥口令）通过 Windows DPAPI 加密后存储在 sessions.json 中。

---

## 开发说明

### 添加新主题

编辑 `src/lib/themes.ts`，在 `themes` 对象中添加新的主题色彩映射：

```typescript
export const themes: Record<ThemeKey, ThemeColors> = {
  // ...现有主题
  "my-theme": {
    "--color-gray-950": "#...",
    "--color-gray-900": "#...",
    // ...完整 11 个 CSS 变量
  },
};
```

### 添加新语言

编辑 `src/lib/i18n.ts`：

1. 在 `Lang` 类型中添加语言代码
2. 创建对应的翻译字典（如 `ZH_TW`、`EN_US`）
3. 在 `t()` 函数的 switch 中注册新语言

### 添加新组件约定

- 组件放在 `src/components/` 目录
- 公共可复用组件提取到 `AppComponents.tsx`
- 使用 CSS 变量引用颜色（如 `var(--color-gray-800)`），确保主题切换正常
- 图标统一使用 `lucide-react`

### 新增 Tauri 命令

1. 在 `src-tauri/src/lib.rs` 中定义 Rust 命令函数
2. 在 `main.rs` 的 `invoke_handler` 中注册命令
3. 在 `src/api.ts` 中封装前端调用
4. 如需新依赖，添加到 `src-tauri/Cargo.toml`

---

## 许可证

MIT License

---

## 致谢

- [xterm.js](https://github.com/xtermjs/xterm.js) - 终端模拟器
- [Tauri](https://tauri.app/) - 轻量级桌面应用框架
- [Zustand](https://github.com/pmndrs/zustand) - 状态管理
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS 框架
- [@dnd-kit](https://dndkit.com/) - 可访问的拖拽排序
- [Lucide Icons](https://lucide.dev/) - 现代图标库
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) - 可调节面板布局
