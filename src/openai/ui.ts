/**
 * 内嵌管理页(单文件 HTML,手机浏览器友好)。
 *
 * 功能:
 *   - 添加账号:选择区域(国内/国际)→ 打开 WorkBuddy 官方登录页 → 自动轮询 → 入库
 *   - 账号列表:昵称/域/积分/状态/主账号标记;设主账号、测试、删除
 *   - 顶部显示"酒馆 API 设置里该填什么"(内部回环端点的 Base URL)
 *
 * 关键实现细节:
 *   SillyTavern 对所有 POST 施加 CSRF 保护,页面必须先从 GET /csrf-token
 *   取 token,并在后续每个请求带 X-CSRF-Token 头,否则 403(HTML 响应会让
 *   JSON.parse 报 "Unexpected token '<'")。本页面的 api() 已统一处理。
 *
 * 与 UI Extension 的管理面板共享同一套 API。前端只拿摘要,永远接触不到 token。
 */
export function renderUiPage(basePath: string, internalBaseUrl?: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WorkBuddy Gateway 管理</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 16px 40px;
    font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #14161a; color: #e8eaf0;
    line-height: 1.5;
  }
  h1 { font-size: 1.25rem; margin: 16px 0 4px; }
  .sub { color: #8a93a3; font-size: .8rem; margin-bottom: 16px; word-break: break-all; }
  .card {
    background: #1d2128; border: 1px solid #2a303a; border-radius: 10px;
    padding: 12px 14px; margin-bottom: 12px;
  }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 6px 0; }
  .grow { flex: 1; min-width: 0; }
  button {
    background: #2b3442; color: #e8eaf0; border: 1px solid #3a4556;
    border-radius: 8px; padding: 8px 12px; font-size: .9rem; cursor: pointer;
  }
  button:active { background: #39455a; }
  button.primary { background: #3565c8; border-color: #3565c8; color: #fff; }
  button.danger { background: #7d2f35; border-color: #8d3940; }
  button:disabled { opacity: .45; cursor: default; }
  select {
    background: #2b3442; color: #e8eaf0; border: 1px solid #3a4556;
    border-radius: 8px; padding: 8px 10px; font-size: .9rem;
  }
  .badge {
    display: inline-block; padding: 1px 8px; border-radius: 999px;
    font-size: .75rem; background: #2b3442; color: #aeb8c6; margin-right: 4px;
  }
  .badge.ok { background: #1f4d33; color: #7fe0a8; }
  .badge.bad { background: #5b2227; color: #ff9da6; }
  .badge.primary { background: #274a8f; color: #a8c8ff; }
  .account-name { font-weight: 600; }
  .meta { color: #8a93a3; font-size: .8rem; }
  .status-line { color: #b9c2cf; font-size: .85rem; }
  #loginBox { border-left: 3px solid #3565c8; }
  .link { color: #7fb0ff; word-break: break-all; }
  a.link { text-decoration: none; }
  .url-box {
    background: #10131a; border: 1px solid #2a303a; border-radius: 8px;
    padding: 8px 10px; font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .82rem; color: #9fe0b8; word-break: break-all; user-select: all;
  }
  .hidden { display: none; }
  .cfg-table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; }
  .cfg-table td { padding: 6px 4px; vertical-align: top; border-bottom: 1px solid #232932; }
  .cfg-table tr:last-child td { border-bottom: none; }
  .cfg-key { color: #8a93a3; font-size: .82rem; width: 88px; white-space: nowrap; }
  .cfg-val { font-size: .85rem; }
  .copy-btn {
    padding: 4px 10px; font-size: .78rem; margin-left: 6px;
    background: #263041; border-color: #35435a;
  }
  .copy-btn.done { background: #1f4d33; border-color: #2a6b47; color: #9fe0b8; }
  code {
    background: #10131a; border: 1px solid #2a303a; border-radius: 5px;
    padding: 1px 6px; font-size: .82rem; color: #cfe3ff;
  }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #4a5568; border-top-color: #7fb0ff; border-radius: 50%; animation: spin 1s linear infinite; vertical-align: -2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<h1>WorkBuddy Gateway</h1>
<div class="sub" id="serviceInfo">正在加载…</div>

<div class="card" style="border-left:3px solid #1f4d33">
  <div class="status-line"><b>① 把下面这些填进酒馆的 API 设置</b><br>
    <span class="meta">酒馆页面 → 顶部 🔌 图标(API 连接)→ 按下表逐项填</span></div>
  <table class="cfg-table">
    <tr>
      <td class="cfg-key">API</td>
      <td class="cfg-val">聊天补全(Chat Completion)</td>
    </tr>
    <tr>
      <td class="cfg-key">聊天补全来源</td>
      <td class="cfg-val">自定义(兼容 OpenAI)</td>
    </tr>
    <tr>
      <td class="cfg-key">自定义端点<br>(基础 URL)</td>
      <td class="cfg-val">
        <span class="url-box" id="openaiBaseUrl">—</span>
        <button class="copy-btn" id="copyBaseUrl">复制</button>
      </td>
    </tr>
    <tr>
      <td class="cfg-key">自定义 API 密钥</td>
      <td class="cfg-val"><code id="apiKeyHint">sk-x</code>
        <button class="copy-btn" id="copyApiKey">复制</button>
        <span class="meta">本插件不校验,填任意非空值即可</span></td>
    </tr>
    <tr>
      <td class="cfg-key">模型</td>
      <td class="cfg-val">点「可用模型」右侧的 ⟳ 刷新按钮,从列表里选(如 <code>glm-5.3</code>)</td>
    </tr>
    <tr>
      <td class="cfg-key">流式传输</td>
      <td class="cfg-val">开启(打字机效果)</td>
    </tr>
  </table>
  <div class="meta" id="endpointNote"></div>
</div>

<div class="card" id="loginBox">
  <div class="status-line"><b>② 添加 WorkBuddy 账号</b></div>
  <div class="row">
    <select id="regionSelect">
      <option value="cn">国内版 (codebuddy.cn)</option>
      <option value="global">国际版 (workbuddy.ai)</option>
    </select>
    <button id="btnAdd" class="primary">+ 添加账号</button>
  </div>
  <div id="loginProgress" class="status-line hidden"></div>
</div>

<div class="card">
  <div class="row"><span class="account-name">账号列表</span><span class="grow"></span><span class="meta" id="accountCount"></span></div>
  <div id="accountList"><div class="status-line">暂无账号,点上方"添加账号"登录。</div></div>
</div>

<script>
(function () {
  var BASE = ${JSON.stringify(basePath)};
  var OPENAI_BASE = ${JSON.stringify(internalBaseUrl ?? '')};
  var accounts = [];
  var csrfToken = '';

  // SillyTavern 的 POST 必须带 X-CSRF-Token,否则 403(HTML)。
  function fetchCsrfToken() {
    return fetch('/csrf-token', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { csrfToken = (d && d.token) || ''; })
      .catch(function () { csrfToken = ''; });
  }

  function api(path, opts) {
    var options = Object.assign({}, opts);
    var headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    options.headers = headers;
    return fetch(BASE + path, options).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); }
        catch (e) {
          // 非 JSON:多半是 CSRF/白名单拦截的 HTML 页
          throw new Error('服务端返回非 JSON(' + res.status + ')。'
            + (res.status === 403 ? '可能是 CSRF 校验失败,请刷新本页重试。' : text.slice(0, 120)));
        }
        if (!res.ok) {
          var msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function el(id) { return document.getElementById(id); }

  function fmtMoney(n) { return n === undefined || n === null ? '—' : Number(n).toFixed(2); }

  function statusBadge(a) {
    var s = a.lastStatus;
    if (!s) return '<span class="badge">未测试</span>';
    var map = {
      ok: '<span class="badge ok">可用</span>',
      bad_credential: '<span class="badge bad">登录失效</span>',
      out_of_credits: '<span class="badge bad">积分不足</span>',
      rate_limited: '<span class="badge bad">限流</span>',
      unreachable: '<span class="badge bad">不可达</span>',
    };
    var until = s.untilMs && s.untilMs > Date.now()
      ? ' (冷却 ' + Math.ceil((s.untilMs - Date.now()) / 60000) + ' 分钟)' : '';
    return (map[s.kind] || '<span class="badge">未知</span>') + until;
  }

  function render() {
    el('accountCount').textContent = accounts.length + ' / 5';
    var box = el('accountList');
    if (accounts.length === 0) {
      box.innerHTML = '<div class="status-line">暂无账号,点上方"添加账号"登录。</div>';
      return;
    }
    box.innerHTML = accounts.map(function (a) {
      var name = a.nickname || a.uin || a.uid || a.id;
      var region = a.domain && (a.domain.indexOf('workbuddy.ai') !== -1 || a.domain.indexOf('codebuddy.ai') !== -1) ? '国际' : '国内';
      return '<div class="card" style="margin:8px 0">'
        + '<div class="row">'
        + '<span class="account-name">' + name + '</span>'
        + (a.primary ? '<span class="badge primary">主账号</span>' : '<button data-id="' + a.id + '" class="set-primary">设为主账号</button>')
        + '<span class="badge">' + region + '</span>'
        + statusBadge(a)
        + '<span class="grow"></span>'
        + '<button data-id="' + a.id + '" class="test">测试</button>'
        + '<button data-id="' + a.id + '" class="delete danger">删除</button>'
        + '</div>'
        + '<div class="meta">积分: ' + (a.credits !== undefined ? fmtMoney(a.credits.total) : '—')
        + (a.credits && a.credits.expiringSoon > 0 ? ' · 3天内过期 ' + fmtMoney(a.credits.expiringSoon) : '')
        + (a.expiringSoon ? ' · <span style="color:#ff9da6">token即将过期</span>' : '')
        + ' · 域: ' + (a.domain || '—') + '</div>'
        + (a.failCount > 0 ? '<div class="meta" style="color:#ff9da6">连续失败 ' + a.failCount + ' 次' + (a.lastStatus && a.lastStatus.detail ? ': ' + a.lastStatus.detail.slice(0, 120) : '') + '</div>' : '')
        + '</div>';
    }).join('');
    box.querySelectorAll('.set-primary').forEach(function (btn) {
      btn.onclick = function () { setPrimary(btn.getAttribute('data-id')); };
    });
    box.querySelectorAll('.test').forEach(function (btn) {
      btn.onclick = function () { testAccount(btn.getAttribute('data-id'), btn); };
    });
    box.querySelectorAll('.delete').forEach(function (btn) {
      btn.onclick = function () {
        if (confirm('确定删除该账号?凭据将从本机移除。')) removeAccount(btn.getAttribute('data-id'));
      };
    });
  }

  function refresh() {
    return api('/api/accounts').then(function (d) {
      accounts = d.accounts || [];
      render();
    }).catch(function (e) {
      el('accountList').innerHTML = '<div class="status-line" style="color:#ff9da6">加载失败: ' + e.message + '</div>';
    });
  }

  function setPrimary(id) {
    api('/api/accounts/' + id + '/primary', { method: 'POST' }).then(refresh).catch(function (e) { alert('失败: ' + e.message); });
  }

  function testAccount(id, btn) {
    btn.disabled = true; btn.textContent = '测试中…';
    api('/api/accounts/' + id + '/test', { method: 'POST' })
      .then(function (d) {
        alert(d.ok ? '账号可用。积分: ' + fmtMoney(d.credits && d.credits.total) : '失败');
      })
      .catch(function (e) { alert('失败: ' + e.message); })
      .finally(function () { btn.disabled = false; btn.textContent = '测试'; refresh(); });
  }

  function removeAccount(id) {
    api('/api/accounts/' + id, { method: 'DELETE' }).then(refresh).catch(function (e) { alert('删除失败: ' + e.message); });
  }

  el('btnAdd').onclick = function () {
    var region = el('regionSelect').value;
    var progress = el('loginProgress');
    el('btnAdd').disabled = true;
    progress.classList.remove('hidden');
    progress.innerHTML = '<span class="spinner"></span> 正在申请登录会话…';
    api('/api/accounts/login', { method: 'POST', body: JSON.stringify({ region: region }) })
      .then(function (d) {
        progress.innerHTML = '请在打开的新页面完成手机号验证码登录,完成后本页会自动刷新。'
          + '<br><a class="link" href="' + d.verificationUri + '" target="_blank" rel="noopener">点此打开 WorkBuddy 登录页</a>';
        window.open(d.verificationUri, '_blank', 'noopener');
        var poll = function () {
          api('/api/accounts/login/' + d.loginId + '?region=' + encodeURIComponent(region))
            .then(function (p) {
              if (p.done === false) { setTimeout(poll, 3000); return; }
              progress.innerHTML = '<span class="badge ok">登录成功</span>';
              el('btnAdd').disabled = false;
              refresh();
            })
            .catch(function (e) {
              progress.innerHTML = '<span style="color:#ff9da6">登录失败: ' + e.message + '</span>';
              el('btnAdd').disabled = false;
            });
        };
        setTimeout(poll, 2500);
      })
      .catch(function (e) {
        progress.innerHTML = '<span style="color:#ff9da6">' + e.message + '</span>';
        el('btnAdd').disabled = false;
      });
  };

  // 复制按钮:手机上没有方便的选择操作,一键复制最实用
  function wireCopy(btnId, textOf) {
    var btn = el(btnId);
    if (!btn) return;
    btn.onclick = function () {
      var text = textOf();
      if (!text) { alert('地址尚未就绪,请刷新页面'); return; }
      var done = function () {
        var old = btn.textContent;
        btn.textContent = '已复制';
        btn.classList.add('done');
        setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
      } else {
        fallbackCopy(text, done);
      }
    };
  }
  // 兼容非 HTTPS / 旧 WebView:用临时 textarea 选中复制
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('复制失败,请手动长按选中: ' + text); }
    document.body.removeChild(ta);
  }

  // 初始化:先拿 CSRF token,再加载数据
  fetchCsrfToken().then(function () {
    var endpoint = OPENAI_BASE || (BASE + '/v1');
    el('openaiBaseUrl').textContent = endpoint;
    el('serviceInfo').textContent = '管理页: ' + BASE + ' · OpenAI 端点: ' + endpoint;
    el('endpointNote').innerHTML = OPENAI_BASE
      ? '说明:这个地址由插件自建,仅监听本机(127.0.0.1),专供酒馆后端调用 —— '
        + '不要填酒馆自己的 8000 端口,那个端口上的 POST 会被 CSRF 拦截而返回 403。'
      : '说明:本页面未拿到内部端点地址(可能插件版本较旧),请查看启动日志里 '
        + '「酒馆 API 设置里填这个 Base URL」那一行。';
    wireCopy('copyBaseUrl', function () { return endpoint; });
    wireCopy('copyApiKey', function () { return 'sk-x'; });
    refresh();
    setInterval(refresh, 60000);
  });
})();
</script>
</body>
</html>`
}
