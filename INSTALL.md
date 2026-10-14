# 安装指南(PC / Android Termux)

本插件由两部分组成,都在同一个仓库里:

| 部分 | 作用 | 装在哪 |
| --- | --- | --- |
| **Server Plugin** | 后端:OpenAI 接口、账号登录、账号池切换 | `<SillyTavern>/plugins/` |
| **UI Extension** | 前端:酒馆工具栏按钮 + 管理面板(可选) | 酒馆扩展面板一键装 |

装完后,你只需启动一次 SillyTavern,其余全部在网页里完成。

---

## 0. 前置条件

| 项目 | 要求 |
| --- | --- |
| SillyTavern | 1.12.0+ 即可(已在 **1.17.0 HEAD** 实测) |
| Node.js | 18 以上(手机实测 **v26.2.0**) |
| git | 用于克隆插件;没有 git 可用文末的 zip 方式 |
| WorkBuddy 账号 | 手机号可登录的账号(国内版/国际版均可) |

**先确认 SillyTavern 能正常启动、能打开网页**,再装插件。

---

## 1. 安装 Server Plugin

> 手机和 PC 的步骤**完全一样**,只是 SillyTavern 目录路径不同。

### 1.1 找到 SillyTavern 目录并进入

```bash
# 手机(Android Termux)
cd ~/SillyTavern

# PC - Windows(按你的实际安装位置)
cd /d D:\SillyTavern

# PC - macOS / Linux
cd ~/SillyTavern
```

### 1.2 克隆插件到 plugins 目录

```bash
mkdir -p plugins
git clone https://github.com/ABGanBei/workbuddy-openai-proxy.git plugins/workbuddy-openai-proxy
```
**Windows PowerShell 用户：**上面的 `mkdir -p` 是类 Unix 命令。在 PowerShell 中请使用：

```powershell
New-Item -ItemType Directory -Force -Path plugins | Out-Null
git clone https://github.com/ABGanBei/workbuddy-openai-proxy.git .\plugins\workbuddy-openai-proxy
```

克隆完成后目录应该是:

```
SillyTavern/
└─ plugins/
   └─ workbuddy-openai-proxy/
      ├─ package.json          ← 指向构建好的插件入口
      ├─ dist/plugin/workbuddy-gateway.cjs   ← 插件本体(已随仓库提供)
      └─ ...
```

> **不需要** `npm install`,也**不需要**任何构建步骤——仓库里已经带了打包好的插件文件。

### 1.3 开启 Server Plugins

编辑 SillyTavern 目录下的 `config.yaml`,确保这一行是 `true`:

```yaml
enableServerPlugins: true
```

**命令行一键修改(手机 / macOS / Linux):**

```bash
sed -i 's/^[[:space:]]*#\?[[:space:]]*enableServerPlugins:.*/enableServerPlugins: true/' config.yaml
grep -q '^enableServerPlugins:' config.yaml || echo 'enableServerPlugins: true' >> config.yaml
grep -n enableServerPlugins config.yaml     # 确认输出 ...: true
```

**Windows 用记事本改:** 打开 `SillyTavern\config.yaml`,搜索 `enableServerPlugins`,把 `false` 改成 `true`,保存。

**可选**(推荐):关掉每次启动自动拉取插件更新,手机网络慢时启动更快

```yaml
enableServerPluginsAutoUpdate: false
```

### 1.4 重启 SillyTavern

```bash
# 手机 Termux / macOS / Linux
./start.sh

# PC - Windows
start.bat
```

看到下面这几行就是成功了(**记下那个 8001 端口,下一步要用**):

```
[internal-server] 内部 OpenAI 端点已启动: http://127.0.0.1:8001/v1(仅本机回环)
[workbuddy-gateway] ready — mounted at /api/plugins/workbuddy-gateway
[workbuddy-gateway] 管理页: http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui
[workbuddy-gateway] >>> 酒馆 API 设置里填这个 Base URL: http://127.0.0.1:8001/v1
1 server plugin(s) are currently loaded.
```

> 如果 8001 被其它程序占用,插件会自动改用 8002、8003……**以日志里打印的地址为准**。
> 想固定端口:启动 SillyTavern 前 `export WORKBUDDY_GATEWAY_PORT=9001`。

---

## 2. 登录 WorkBuddy 账号

### 2.1 打开管理页

| 你的使用方式 | 管理页地址 |
| --- | --- |
| 手机 Termux(浏览器在同一台手机) | `http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui` |
| PC 本机浏览器 | `http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui` |
| **ST 装在 PC,用手机浏览器远程访问** | `http://<PC的局域网IP>:8000/api/plugins/workbuddy-gateway/ui` |

> 第三种情况:PC 的 IP 用 `ipconfig`(Windows)或 `ip addr`(Linux/macOS)查,形如 `192.168.1.5`。
> 前提是 `config.yaml` 里 `listen: true`(默认监听所有网卡),且手机与 PC 在同一 WiFi。

打开后应该看到深色的「**WorkBuddy Gateway**」页面,顶部有「① 把这个地址填进酒馆的 API 设置」。

### 2.2 添加账号

1. 区域下拉:国内版选「国内版 (codebuddy.cn)」,国际版选「国际版 (workbuddy.ai)」
2. 点「**+ 添加账号**」
3. 会弹出/打开 WorkBuddy 官方登录页 → **手机号 + 验证码登录**
4. 登录成功后回到管理页,**不要关闭页面**,它每 3 秒自动检查一次,几秒内账号就会出现在「账号列表」

### 2.3 验证账号

点账号那行的「**测试**」按钮:

- 成功 → 弹出「账号可用。积分: xxx」,**积分显示出来就说明凭据完全有效**
- 失败 → 弹出具体错误(如 "登录失效"、"限流"),把错误发出来排查

> 最多可加 **5 个账号**;第一个自动成为「主账号」,可随时点其它账号的「设为主账号」切换。
> 主账号额度不足 / 被限流 / 登录失效时,插件会**自动切换**到其它账号,你聊天时无感知。

---

## 3. 安装 UI Extension(可选)

装了才有酒馆内的 WorkBuddy 按钮;不装也能用(直接访问第 2.1 步的管理页地址)。

1. 打开 SillyTavern → 点顶部 **🧩(扩展)** 图标
2. 面板顶部点「**Install extension**」
3. 粘贴仓库地址:

   ```
   https://github.com/ABGanBei/workbuddy-openai-proxy
   ```

4. 「分支或标签名」留空,点「**只给我安装**」(多人共用同一台 ST 则选「给所有人安装」)
5. 安装完**刷新整个酒馆页面**
6. 顶部工具栏出现「**WorkBuddy**」项 —— 前面小圆点:
   - 🟢 绿色 = 后端在线,点击展开管理面板
   - 🔴 红色 = 后端没起来(检查第 1 步的日志)

---

## 4. 配置酒馆 API(关键一步)

打开酒馆 → 点顶部 **🔌(API 连接)** 图标 → 按下面填:

| 字段 | 填什么 |
| --- | --- |
| API | **聊天补全**(Chat Completion) |
| 聊天补全来源 | **自定义(兼容 OpenAI)** |
| **自定义端点(基础 URL)** | `http://127.0.0.1:8001/v1` ← **用日志里那行地址** |
| 自定义 API 密钥 | 随便填 `sk-x`(本插件不校验;若原来存了别的密钥,直接改掉更省心) |
| 输入模型名 | `glm-5.3`(或点下面的「可用模型」选) |
| 流式传输 | 打开(打字机效果) |

填完点「**可用模型**」右侧的刷新(**⟳**)按钮 → 应该列出 WorkBuddy 的真实模型:

```
glm-5.3   glm-5.3-flash   glm-5.2   glm-5.1   deepseek-v4-pro
deepseek-v4.1-flash   kimi-k3-1   kimi-k2.6   hy3   minimax-m3   ...
```

看到模型列表就说明**全链路打通了**。

> ### ⚠️ 端点为什么是 8001,不是 8000?
>
> 酒馆调用 AI 接口是**服务器端发起**的请求,而 SillyTavern 对 8000 端口上所有
> `/api/plugins/...` 的 POST 请求强制校验 CSRF(只有浏览器页面能拿到 token),
> 所以填 8000 会返回 **403 Forbidden**。
>
> 8001 是插件自己开的**仅本机回环**端点,专供酒馆后端调用,没有 CSRF 限制。
> 管理页(浏览器访问)才用 8000。

---

## 5. 验证

1. 回到聊天界面,选一个模型(建议先用 `glm-5.3-flash`,快且便宜)
2. 发一条消息
3. 回复**逐字出现**(打字机效果)= 流式正常

### 场景速查表(最容易搞混的两个地址)

| 你的部署 | 酒馆「自定义端点」填 | 管理页地址 |
| --- | --- | --- |
| ST 在手机上(Termux),手机浏览器用 | `http://127.0.0.1:8001/v1` | `http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui` |
| ST 在 PC 上,PC 浏览器用 | `http://127.0.0.1:8001/v1` | `http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui` |
| **ST 在 PC 上,手机浏览器远程用** | `http://127.0.0.1:8001/v1`(**不变**,因为请求由 PC 发出) | `http://<PC的IP>:8000/api/plugins/workbuddy-gateway/ui` |

一句话:**端点永远填 `127.0.0.1:8001`**(以日志为准);管理页要看你是从哪台设备打开浏览器。

---

## 常见问题

### 启动日志没有 `[workbuddy-gateway] ready`

1. `config.yaml` 里 `enableServerPlugins` 是不是 `true`?改完**必须重启** ST
2. 目录层级对不对?应该存在 `SillyTavern/plugins/workbuddy-openai-proxy/package.json`
3. 看日志里有没有 `Failed to load plugin from ...` 的报错,把报错发出来

### 管理页打不开(404)

同上,说明插件没加载。另外确认地址里 `/api/plugins/workbuddy-gateway/ui` 没写错。

### 点「添加账号」报 `Unexpected token '<'`

说明页面的 POST 被拦(返回了 HTML)。**强制刷新页面**再试(旧页面没有 CSRF 处理逻辑):
手机上长按刷新按钮 → 选「硬性重新加载」,或在地址栏手动重新输入地址打开。

### 「可用模型」刷新后是空的

1. 先在管理页确认**至少有一个账号,且「测试」通过**(没账号就没有模型列表)
2. 端点是 `http://127.0.0.1:8001/v1`,末尾要有 `/v1`
3. 看 Termux/PC 的日志有没有报错

### 聊天报 403 Forbidden

端点填成 8000 了。改成 `http://127.0.0.1:8001/v1`。

### 聊天报 401 / "登录已失效"

管理页点该账号的「测试」重新验证;若确实失效(如长期未用、在别处退出登录),
删掉该账号后重新「+ 添加账号」登录一次。

### `git clone` 提示输入用户名密码

说明仓库是 Private。到 GitHub 仓库页 → Settings → 最底部 Danger Zone →
Change repository visibility → **Change to public**,然后重新 clone。

### 想换内部端点端口

```bash
export WORKBUDDY_GATEWAY_PORT=9001
./start.sh
```

日志会打印新的地址,酒馆那边同步改。

---

## 更新插件

```bash
cd ~/SillyTavern/plugins/workbuddy-openai-proxy
git pull
# 重启 SillyTavern
```

> 如果 `config.yaml` 里是 `enableServerPluginsAutoUpdate: true`(默认),
> ST 每次启动会自动 `git pull`,无需手动更新。

## 卸载

```bash
rm -rf ~/SillyTavern/plugins/workbuddy-openai-proxy
```

账号数据在 `<SillyTavern>/data/workbuddy-gateway/accounts.json`,插件目录删掉不会丢账号;
要彻底清除凭据,把整个 `data/workbuddy-gateway/` 目录一并删除。

## 没有 git 的安装方式(备选)

PC 上没装 git 时,可以直接下载 zip:

1. 浏览器打开 `https://github.com/ABGanBei/workbuddy-openai-proxy/archive/refs/heads/main.zip`
2. 解压,把里面的文件夹重命名为 `workbuddy-openai-proxy`
3. 整个放进 `<SillyTavern>/plugins/` 下
4. 重启 SillyTavern

> zip 方式没有 git 元数据,ST 不会自动更新,升级时手动替换即可。
