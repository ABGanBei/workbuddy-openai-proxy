# workbuddy-openai-proxy — SillyTavern 的 WorkBuddy Gateway

把 WorkBuddy 账号能力封装成 OpenAI Compatible API 并**直接跑进 SillyTavern 进程内**的网关。手机(浏览器)打开酒馆就能完成:添加账号 → 手机号登录 → 看积分状态 → 选模型 → 聊天,全程**不需要额外启动第二个服务**。

```
手机 / PC 浏览器 ──> SillyTavern(Termux 或 PC,含本 Gateway)
                          │
                          ├─ :8000/api/plugins/workbuddy-gateway/ui    账号管理页(浏览器访问)
                          ├─ :8000/api/plugins/workbuddy-gateway/api/* 账号管理 API(浏览器访问)
                          │
                          └─ :8001/v1/*   ← 内部回环端点:OpenAI 兼容接口
                                           (酒馆后端调用,无 CSRF 限制)
                                    │
                                    │ WorkBuddy CLI 协议(v2/chat/completions,SSE)
                                    ↓
                          WorkBuddy 上游(国内 copilot.tencent.com / 国际 workbuddy.ai)
```

> **为什么是两个端口**:SillyTavern 对 8000 上所有 `/api/plugins/...` 的 POST
> 强制校验 CSRF(仅浏览器能拿到 token),而酒馆调用 AI 接口是**服务器端**发起,
> 必然 403。因此插件自建一个**仅监听 127.0.0.1** 的内部端点(默认 8001)专供
> 酒馆后端调用;管理页仍走 8000 的 ST 路由。

## 部署形态

| 形态 | 说明 | 适用 |
| --- | --- | --- |
| **Server Plugin(推荐)** | 插件目录放进 `plugins/`,随 ST 启动自动加载 | Termux 手机、PC |
| UI Extension | 酒馆工具栏 WorkBuddy 按钮(iframe 管理面板) | 可选,想要酒馆内入口时 |
| standalone | 独立 `npm run dev` 跑 3000 端口 | 调试 / 其它 OpenAI 客户端 |

## 安装

👉 **完整安装步骤见 [INSTALL.md](INSTALL.md)**(PC 与 Android Termux 都适用)。

三步速览:

```bash
cd <你的 SillyTavern 目录>
mkdir -p plugins
git clone https://github.com/ABGanBei/workbuddy-openai-proxy.git plugins/workbuddy-openai-proxy
# 在 config.yaml 里设 enableServerPlugins: true,然后重启 SillyTavern
```

启动日志出现下面这行即成功(**记下打印的 Base URL,下一步要填进酒馆**):

```
[workbuddy-gateway] >>> 酒馆 API 设置里填这个 Base URL: http://127.0.0.1:8001/v1
```

### 配置酒馆 API

打开酒馆 → **API 连接** → 按下面填:

| 字段 | 值 |
| --- | --- |
| API | 聊天补全(Chat Completion) |
| 聊天补全来源 | 自定义(兼容 OpenAI) |
| **自定义端点(基础 URL)** | `http://127.0.0.1:8001/v1`(以日志为准) |
| 自定义 API 密钥 | 任意非空值(如 `sk-x`) |
| 模型 | 点「可用模型」刷新后选择(如 `glm-5.3`) |
| 流式传输 | 开启 |

### 登录 WorkBuddy 账号

浏览器打开管理页(装 UI Extension 后也可点酒馆工具栏的 WorkBuddy 按钮):

```
http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui
```

点「+ 添加账号」→ 选区域 → 官方登录页手机号验证码登录 → 账号自动入库(最多 5 个)。

## 使用流程

1. **打开管理页**:酒馆工具栏 WorkBuddy 按钮,或 `/api/plugins/workbuddy-gateway/ui`。
2. **添加账号**:选区域(国内/国际)→「添加账号」→ 自动打开 WorkBuddy 官方登录页 → 手机号验证码登录 → 页面自动轮询拿 token 入库(最多 5 个账号)。
3. **看状态**:账号列表显示昵称、区域、主账号标记、积分、登录状态、失败计数;「测试」按钮实时探测可用性 + 刷新积分(只读,不耗积分)。
4. **配置酒馆**:见上方「配置酒馆 API」表格。
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
├─ manifest.json                 # UI Extension 清单(仓库根 = 扩展根,GitHub 链接直接可装)
├─ index.js                      # UI Extension 前端(工具栏按钮 + 管理面板 iframe)
├─ dist/plugin/workbuddy-gateway.cjs  # 构建好的 Server Plugin(随仓库提供,免构建)
├─ src/
│  ├─ server.ts                  # standalone 入口
│  ├─ gateway.ts                 # store/client/pool/models 装配(两种模式共用)
│  ├─ plugin/
│  │  ├─ plugin-entry.ts         # ST Server Plugin 入口(init/info/exit 契约)
│  │  └─ internal-server.ts      # 内部回环 OpenAI 端点(绕开 ST 的 CSRF)
│  ├─ openai/
│  │  ├─ routes.ts               # 管理路由(账号 API + /ui,走 ST 路由)
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
├─ scripts/build-plugin.mjs      # esbuild 单文件打包
├─ INSTALL.md                    # 完整安装指南(PC / Termux)
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
