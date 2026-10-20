# 贡献指南

欢迎参与开发。本文件写给**协作者**:如何搭建环境、改代码、跑测试、提交。

## 项目概况

SillyTavern 的 WorkBuddy 网关,由两部分组成:

| 部分 | 入口 | 说明 |
| --- | --- | --- |
| **Server Plugin** | `src/plugin/plugin-entry.ts` | 后端:OpenAI 接口、OAuth 登录、账号存储、账号池调度 |
| **UI Extension** | `index.js` + `manifest.json`(仓库根) | 前端:酒馆工具栏按钮 + 管理面板 iframe |

架构要点(改代码前务必理解,详见 README 架构图):

- ST 对 `:8000/api/plugins/*` 的 **POST 一律校验 CSRF**(只有浏览器能拿 token),
  所以插件**另开一个仅监听 `127.0.0.1` 的内部端点**(默认 `:8001`)供酒馆后端调用:
  - `/api/plugins/workbuddy-gateway/*` → 管理页与账号 API(浏览器访问)
  - `:8001/v1/*` → OpenAI 兼容接口(酒馆后端访问,**无 CSRF**)
- 改动聊天/模型相关逻辑时,两条路径(`src/openai/routes.ts` 与
  `src/plugin/internal-server.ts`)都要照顾到。

## 环境准备

```bash
git clone https://github.com/ABGanBei/workbuddy-openai-proxy.git
cd workbuddy-openai-proxy
npm install
```

要求 Node.js ≥ 18(开发机实测 v26 / v24 均可)。

## 常用命令

```bash
npm run typecheck      # TypeScript 类型检查(提交前必跑)
npm run test:unit      # 单元测试:账号存储 / 账号池 failover(不触网,秒级)
npm run test:plugin    # 构建 + mock ST loader 端到端测试(13 项断言)
npm run build:plugin   # 打包 Server Plugin 单文件
npm run dev            # standalone 模式跑 3000 端口(调试用,需自备账号)
```

真实上游冒烟(会向 WorkBuddy 申请一次登录 state,**不会**真的登录):

```bash
npx tsx test/oauth-smoke.test.ts
```

## ⚠️ 最重要的约定:构建产物必须同步提交

仓库**提交了打包产物** `dist/plugin/workbuddy-gateway.cjs`,这样用户
`git clone` 后**免 npm install、免构建**直接可用。

因此:

> **只要你改了 `src/` 下的任何文件,提交前必须运行 `npm run build:plugin`,
> 并把更新后的 `dist/plugin/workbuddy-gateway.cjs` 一起提交。**

忘记同步会导致:用户 clone 到的是旧版本代码,而仓库源码看起来已经改了——
这类问题很难排查。CI 里有一步 `build-check` 专门拦这个(见
`.github/workflows/build-check.yml`),产物不同步会让 CI 变红。

```bash
npm run build:plugin
git add dist/plugin/workbuddy-gateway.cjs
```

## 代码约定

- **注释用中文**:本项目面向中文用户,关键逻辑要写清"为什么",而不只是"做了什么"。
  特别是踩过的坑(如 CSRF、上游强制 stream、加密凭据),把原因留在注释里。
- **依赖克制**:Server Plugin 打包时只外置 `express`(用 ST 自带的),
  其余必须能打进单文件。**不要引入需要原生编译的依赖**(Termux 上装不了)。
- **凭据安全**:token 只能存在 `<ST>/data/workbuddy-gateway/accounts.json`
  (原子写 + 0600)。**永远不要把 token 写进日志、返回给前端、或提交进仓库。**
  管理页只允许返回 `AccountStore.summaries()` 的脱敏摘要。
- **测试随改动更新**:新增失败分类、新路由、新调度规则时,同步补
  `test/unit.test.ts` 或 `test/plugin-e2e.test.ts` 的断言。

### 上游准入闸(会持续收紧,务必先读)

WorkBuddy 网关对 chat 请求有**多道互相独立**的准入校验,命中就返回
`400 / 11128`。已知的闸(时间线):

| 闸 | 要求 | 我们的实现位置 |
| --- | --- | --- |
| 一 | 会话**首条必须是 `system`**,`developer` 也不行 | `chatCompletion.ts` 的 `prepareChatBody()`(developer→system + 补位) |
| 二 | chat 请求必须带 **`X-Conversation-ID` / `X-Conversation-Request-ID` / `X-Conversation-Message-ID`**,三个齐、每次新生成、互不相同 | `client.ts` 的 `conversationHeaders()` |

排障要点(踩过的坑):

- **不要按 `displayTips` 去改 User-Agent**,那句"请从官方客户端重新发送"在每一道闸上都会出现;
  真要判断,看报文里的 `msg` 字面原因,并按"**做了什么/缺了什么**"二分,不要按文案分类。
- **闸是叠加的**,修好三件套不代表可以删掉 `ensureSystemHead()`(缺 system 仍然 400)。
- **三件套只能加在 chat 端点**。billing / refresh / 模型目录都不能带
  (`test/conversation-headers.test.ts` 有断言守着,泄漏会让计费侧行为异常)。
- **UUID 必须每请求新生成**。复用等于拿一个 id 冒充三次会话,破坏上游的会话关联。
- 改这类东西**必须留行为级测试**(mock fetch 断言真实请求头),不要用 grep 源码字符串——
  文本断言在实现调整后会给出虚假的安全感。

跑守卫:`npm run test:headers`。改坏了要能看到它变红(做过变异验证)。

### 不要提交的内容

已在 `.gitignore` 中排除,提交前留意 `git status`:

- `data/`(standalone 模式的真实账号凭据)
- `.env`(含 `WORKBUDDY_TOKEN` 等敏感配置)
- `node_modules/`

## 提交流程

1. 从 `main` 切分支:`git checkout -b fix/xxx`(直接推 `main` 也可以,但分支更好回滚)
2. 改代码 → `npm run typecheck` → `npm run test:unit` → `npm run test:plugin`
3. 改了 `src/` 就 `npm run build:plugin` 并提交产物
4. 写清 commit message(说明**问题**与**修法**,不只写"修复 bug")
5. 推送并发 PR(或直接推 main,取决于仓库权限)

## 本地测试 ST 集成

改插件入口 / 路由契约时,mock 测试(`npm run test:plugin`)能覆盖大部分场景。
要验证真实 SillyTavern 行为,需要一台装了 ST 的机器:

```bash
cd <SillyTavern 目录>
mkdir -p plugins
git clone <你的 fork 地址> plugins/workbuddy-openai-proxy
# config.yaml: enableServerPlugins: true
./start.sh
```

看日志出现 `[workbuddy-gateway] ready` 即加载成功;管理页
`http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui`(详见 [INSTALL.md](INSTALL.md))。

## 许可证

MIT。提交代码即表示同意以同一许可证分发。
上游协议实现参考 [dsh-connect-workbuddy](https://github.com/dingminhua/dsh-connect-workbuddy)(MIT),
移植处的文件头都保留了出处说明,**请勿删除这些署名**。
