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
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #4a5568; border-top-color: #7fb0ff; border-radius: 50%; animation: spin 1s linear infinite; vertical-align: -2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<h1>WorkBuddy Gateway</h1>
<div class="sub" id="serviceInfo">正在加载…</div>

<div class="card" style="border-left:3px solid #1f4d33">
  <div class="status-line"><b>① 把这个地址填进酒馆的 API 设置</b><br>
    Chat Completion → Custom (OpenAI-compatible) → Custom Endpoint:</div>
  <div class="url-box" id="openaiBaseUrl">—</div>
  <div class="meta">模型名点酒馆里的「刷新」按钮即可自动列出(直连上游,无需 CSRF)。</div>
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

  // 初始化:先拿 CSRF token,再加载数据
  fetchCsrfToken().then(function () {
    if (OPENAI_BASE) {
      el('serviceInfo').textContent = '管理端点: ' + BASE;
      el('openaiBaseUrl').textContent = OPENAI_BASE;
    } else {
      el('serviceInfo').textContent = 'OpenAI Base URL: ' + BASE;
      el('openaiBaseUrl').textContent = BASE + '/v1';
    }
    refresh();
    setInterval(refresh, 60000);
  });
})();
</script>
</body>
</html>`
}
