# workbuddy-openai-proxy — SillyTavern 的 WorkBuddy Gateway

把 WorkBuddy 账号能力封装成 OpenAI Compatible API 并**直接跑进 SillyTavern 进程内**的网关。手机(浏览器)打开酒馆就能完成:添加账号 → 手机号登录 → 看积分状态 → 选模型 → 聊天,全程**不需要额外启动第二个服务**。

```
手机浏览器 ──> SillyTavern (Termux/电脑,含本 Gateway)
                    │
                    ├─ /api/plugins/workbuddy-gateway/v1/*   OpenAI 兼容接口
                    ├─ /api/plugins/workbuddy-gateway/ui     账号管理页
                    └─ /api/plugins/workbuddy-gateway/api/*  账号管理 API
                              │
                              │ WorkBuddy CLI 协议(v2/chat/completions,SSE)
                              ↓
                    WorkBuddy 上游(国内 copilot.tencent.com / 国际 workbuddy.ai)
```

## 部署形态

| 形态 | 说明 | 适用 |
| --- | --- | --- |
| **Server Plugin(推荐)** | 单文件 `plugins/workbuddy-gateway.cjs`,随 ST 启动自动加载 | Termux 手机、任何 ST 部署 |
| UI Extension | 酒馆工具栏 WorkBuddy 按钮(iframe 管理面板) | 需要酒馆内入口时 |
| standalone | 独立 `npm run dev` 跑 3000 端口 | 调试 / 其它 OpenAI 客户端 |

## 安装

### 方式 A:Termux 上直接 git clone(推荐,免构建)

本仓库已提交**构建好的插件产物**(`dist/plugin/workbuddy-gateway.cjs`),
且 `package.json` 的 `main` 指向它——ST 的 plugin-loader 会优先读
`package.json` 的 `main` 字段,所以 git clone 后**无需 npm install、无需构建**。

```bash
# 在 SillyTavern 目录下
cd ~/SillyTavern

# 1. 开启 Server Plugins(见下方 config.yaml)
# 2. 克隆本仓库到 plugins 目录
mkdir -p plugins
git clone https://github.com/ABGanBei/workbuddy-openai-proxy.git plugins/workbuddy-openai-proxy

# 3. 照常启动 SillyTavern
./start.sh
```

启动日志出现即成功:

```
[workbuddy-gateway] ready — mounted at /api/plugins/workbuddy-gateway
```

> **两个目录都可以**:loader 对目录先查 `package.json` 的 `main`
> (本仓库已配好),所以克隆后不用再挪文件。如果你偏好单文件形式,也可以:
> `cp plugins/workbuddy-openai-proxy/dist/plugin/workbuddy-gateway.cjs plugins/`
> 后删除克隆目录(两者选其一即可,别同时放,否则 id 冲突)。

### 方式 B:电脑上构建后拷贝(开发/自定义改动用)

```bash
# 在本仓库目录
npm install
npm run build:plugin
# 产物:dist/plugin/workbuddy-gateway.cjs

# 拷到 Termux 上的 ST
scp dist/plugin/workbuddy-gateway.cjs <termux>:/data/data/com.termux/files/home/SillyTavern/plugins/
```

### config.yaml 配置

编辑 `<SillyTavern>/config.yaml`,确保 Server Plugins 已启用:

```yaml
# Server Plugins:本插件依赖,必须为 true
enableServerPlugins: true

# 可选:关闭启动时自动 git pull(避免每次启动拉取远端)
enableServerPluginsAutoUpdate: false
```

改完保存并重启 ST 才生效。

### UI Extension 安装(可选,酒馆内管理入口)

本仓库根目录就是符合 SillyTavern 第三方扩展规范的扩展
(`manifest.json` + `index.js`)。

1. 打开酒馆 → **扩展(Extension)**面板 → **Install extension**;
2. 粘贴仓库 URL:`https://github.com/ABGanBei/workbuddy-openai-proxy`;
3. 安装后工具栏出现 **WorkBuddy** 按钮(绿点=后端在线,红点=离线);
4. 点击按钮弹出管理面板(iframe 嵌后端 `/ui` 页)。

不装 UI Extension 也可直接用浏览器打开
`http://<手机访问酒馆的地址>/api/plugins/workbuddy-gateway/ui`
使用同一管理页(手机浏览器请用酒馆的局域网 IP,不是 127.0.0.1)。

### Termux 启动步骤(日常使用)

```bash
# 1. 打开 Termux
# 2. 启动 SillyTavern(照常,无需额外命令)
cd ~/SillyTavern
./start.sh

# 3. 手机浏览器打开酒馆(局域网 IP,例如)
#    http://192.168.x.x:8000

# 4. 其余全在网页完成:WorkBuddy 按钮 → 添加账号 → 手机号登录 → 选模型 → 聊天
```

插件数据(账号凭据)保存在 `<SillyTavern>/data/workbuddy-gateway/accounts.json`,
与代码目录分离,更新/删除插件不会丢账号。

## 使用流程(手机全流程)

1. **打开管理页**:酒馆工具栏 WorkBuddy 按钮,或 `/api/plugins/workbuddy-gateway/ui`。
2. **添加账号**:选区域(国内/国际)→「添加账号」→ 自动打开 WorkBuddy 官方登录页 → 手机号验证码登录 → 页面自动轮询拿 token 入库(最多 5 个账号)。
3. **看状态**:账号列表显示昵称、区域、主账号标记、积分、登录状态、失败计数;「测试」按钮实时探测可用性 + 刷新积分(只读,不耗积分)。
4. **配置酒馆**:API 选 **Chat Completion → Custom (OpenAI-compatible)**,
   Base URL 填 `http://127.0.0.1:8000/api/plugins/workbuddy-gateway/v1`,模型点「刷新」自动列出 WorkBuddy 真实模型。
5. **聊天**:开始对话。主账号额度不足/被限流/登录失效时自动切换到备用账号,你无感继续。

## 功能

### 账号管理
- OAuth 登录(官方手机号验证码流程,无桌面 App 依赖),登录成功后自动保存 token 到本地
  `data/workbuddy-gateway/accounts.json`(0600 权限,原子写,不保存明文密码);
- 自动恢复登录状态:token 过期前 5 分钟用 refresh token 静默刷新;
- 支持最多 5 个账号,主账号可切换,可删除;
- 凭据只存服务端,前端/管理页永远接触不到 token。

### 账号池调度
主账号优先;出现以下失败**自动切换备用账号**:
- 积分不足(`hard_credit`/402/14018)
- 账号级限流(429/6004)
- token 失效(`session_dead`/401)
- 上游 5xx / 网络错误

以下失败**不换号**(换号无意义):HTTP 400 请求非法、模型级限流(14003)、内容策略拒绝。

### 模型
- 直接显示 WorkBuddy 返回的**原始模型列表与原始 id**,不重新映射;
- `/v3/config` 拉取 + TTL 缓存;CN 失败回退旧目录;拉取失败用 `DEFAULT_MODEL` 兜底。

### OpenAI 兼容
- `GET /v1/models`、`POST /v1/chat/completions`(SSE 流式 + 非流式合成);
- 支持 system/user/assistant 历史、`developer`→`system` 自动转换、temperature、max_tokens;
- 错误全部 OpenAI 格式:`401`(登录失效)/ `402`(积分不足)/ `403`(内容策略)/ `404`(模型不存在)/ `429`(限流)/ `502`(上游失败)。

### 后续扩展预留
- **Tool calling**:上游原生支持,请求已透传 tools/tool_choice(字符串化);
- **Vision 图片输入**:上游按模型支持图片,content 数组透传;
- **Web Search**:管理页预留设置位,第二阶段实现。

## standalone 模式(可选)

```bash
npm install && npm run dev
# 管理页 http://localhost:3000/ui
# Base URL http://localhost:3000/v1
```

支持旧凭据桥接:设置了 `WORKBUDDY_TOKEN` 环境变量或本机有 WorkBuddy 桌面 App
登录文件时,会自动并入账号池作为第一个账号(含加密凭据解密)。

## 测试

```bash
npm run test:unit          # 账号存储 / 账号池 failover / 空池(不触网)
npm run build:plugin && npx tsx test/plugin-e2e.test.ts   # mock ST loader 端到端
npx tsx test/oauth-smoke.test.ts   # 实机冒烟:oauthStart 拿真实 state(不登录)
npm run test               # standalone 实机:models / 非流式 / 流式
```

## 项目结构

```
workbuddy-openai-proxy/
├─ src/
│  ├─ server.ts                  # standalone 入口
│  ├─ gateway.ts                 # store/client/pool/models 装配(两种模式共用)
│  ├─ plugin/plugin-entry.ts     # ST Server Plugin 入口(init/info/exit 契约)
│  ├─ openai/
│  │  ├─ routes.ts               # 全部路由(OpenAI + 账号管理 + /ui)
│  │  ├─ chatCompletion.ts       # 聊天:校验/映射/账号池/SSE/错误格式
│  │  ├─ stream.ts               # SSE 帧修复 / [DONE] 兜底 / 非流式合成
│  │  └─ ui.ts                   # 内嵌管理页(手机友好单文件 HTML)
│  ├─ workbuddy/
│  │  ├─ client.ts               # 上游 HTTP:chatStream/refresh/fetchModels/积分/签到/错误分类
│  │  ├─ oauth.ts                # OAuth 登录(oauthStart/oauthPoll,手机号验证码流程)
│  │  ├─ account-store.ts        # 多账号本地存储(≤5,原子写,0600)
│  │  ├─ account-pool.ts         # 账号池调度(主账号优先 + failover + 单飞刷新)
│  │  ├─ auth.ts                 # 旧凭据读取(桌面登录文件,standalone/桥接用)
│  │  ├─ at-rest.ts              # 加密凭据解密(AES-256-GCM + loggerGet)
│  │  ├─ models.ts               # 模型目录缓存
│  │  └─ legacy-bridge.ts        # 旧凭据 → 账号池桥接
│  ├─ config/config.ts
│  └─ utils/logger.ts
├─ extensions/workbuddy-gateway/ # UI Extension(manifest.json/index.js/panel.html)
├─ scripts/build-plugin.mjs      # esbuild 单文件打包
└─ test/
   ├─ unit.test.ts               # 单元测试
   ├─ plugin-e2e.test.ts         # mock ST loader 端到端
   ├─ oauth-smoke.test.ts        # OAuth 实机冒烟
   └─ openai-test.ts             # standalone 实机测试
```

## 兼容性

- Android Termux ✅(纯 Node 内置 + express;无原生依赖)
- SillyTavern 1.17.0(server plugin 机制 1.12.0+ 即支持)✅
- Node.js 18+/26 ✅

## 致谢

上游协议(OAuth 流程、请求头、SSE、错误码、积分口径、加密凭据)均移植自对
[dsh-connect-workbuddy](https://github.com/dingminhua/dsh-connect-workbuddy)(MIT,© 2026 LaoDing)
的源码分析,并经实机验证。
