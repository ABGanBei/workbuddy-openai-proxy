/**
 * WorkBuddy Gateway UI Extension(酒馆前端)。
 *
 * 职责(只做界面,不做后端逻辑):
 *   - 在酒馆顶部工具栏加一个 WorkBuddy 按钮(圆点显示后端在线状态);
 *   - 点击打开管理面板(iframe 嵌 Server Plugin 的 /ui 页);
 *   - 一键在新标签页打开管理页。
 *
 * 凭据与业务逻辑全部在 Server Plugin(后端),本文件永不接触 token。
 *
 * 本文件刻意"零裸 import":一切依赖(SillyTavern 上下文、事件、设置)
 * 都从全局 SillyTavern.getContext() 获取——这是官方文档保证的稳定 API,
 * 不依赖内部模块的相对路径,任何装载方式下都可用。
 */

const MODULE_NAME = 'workbuddy_gateway';

/** 后端探测地址(相对 ST 根;Server Plugin 挂载点)。 */
const HEALTH_PATH = '/api/plugins/workbuddy-gateway/healthz';
const UI_PATH = '/api/plugins/workbuddy-gateway/ui';

let button = null;
let popup = null;
let pollTimer = null;

const PANEL_HTML = `
<div id="wb_gateway_panel" class="wb-panel">
    <div class="wb-panel-header">
        <span class="wb-panel-title">WorkBuddy Gateway</span>
        <span class="wb-panel-actions">
            <span id="wb_gateway_open_new" class="menu_button fa-solid fa-up-right-from-square" title="在新标签页打开"></span>
            <span id="wb_gateway_close" class="menu_button fa-solid fa-xmark" title="关闭"></span>
        </span>
    </div>
    <iframe id="wb_gateway_frame" class="wb-panel-frame" title="WorkBuddy Gateway 管理"></iframe>
</div>
<style>
.wb-panel {
    position: fixed;
    right: 12px;
    top: 12px;
    width: min(480px, calc(100vw - 24px));
    height: min(720px, calc(100vh - 24px));
    z-index: 10000;
    display: flex;
    flex-direction: column;
    background: var(--smartThemeBodyColor, #14161a);
    border: 1px solid var(--smartThemeBorderColor, #2a303a);
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, .5);
    overflow: hidden;
}
.wb-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--smartThemeBlurTintColor, rgba(29, 33, 40, .9));
    border-bottom: 1px solid var(--smartThemeBorderColor, #2a303a);
    color: var(--smartThemeTextColor, #e8eaf0);
}
.wb-panel-title { font-weight: 600; }
.wb-panel-actions { display: flex; gap: 10px; }
.wb-panel-frame {
    flex: 1;
    border: none;
    background: #14161a;
}
#wb_gateway_button.wb-online { color: #7fe0a8; }
#wb_gateway_button.wb-offline { color: #ff9da6; }
</style>`;

function getSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME]) {
        ctx.extensionSettings[MODULE_NAME] = { panelVisible: false };
    }
    return ctx.extensionSettings[MODULE_NAME];
}

/** 探测后端是否在线,更新按钮圆点。 */
async function checkBackend() {
    try {
        const res = await fetch(HEALTH_PATH, { cache: 'no-store' });
        const data = await res.json();
        if (data && data.ok) {
            button?.classList.remove('wb-offline');
            button?.classList.add('wb-online');
            button.title = 'WorkBuddy Gateway(在线)';
            return true;
        }
    } catch {
        // offline
    }
    button?.classList.remove('wb-online');
    button?.classList.add('wb-offline');
    button.title = 'WorkBuddy Gateway(离线,请检查 Server Plugin 是否启用)';
    return false;
}

/** 创建/切换管理面板(iframe)。 */
function togglePanel() {
    const ctx = SillyTavern.getContext();
    if (popup && document.body.contains(popup)) {
        popup.remove();
        popup = null;
        getSettings().panelVisible = false;
        ctx.saveSettingsDebounced();
        return;
    }
    const host = document.createElement('div');
    host.innerHTML = PANEL_HTML;
    document.body.appendChild(host.firstElementChild);
    popup = document.getElementById('wb_gateway_panel');
    if (!popup) return;
    getSettings().panelVisible = true;
    ctx.saveSettingsDebounced();

    // iframe 指向后端管理页
    const frame = popup.querySelector('#wb_gateway_frame');
    if (frame) frame.src = UI_PATH;

    popup.querySelector('#wb_gateway_close')?.addEventListener('click', () => {
        popup.remove();
        popup = null;
        getSettings().panelVisible = false;
        ctx.saveSettingsDebounced();
    });
    popup.querySelector('#wb_gateway_open_new')?.addEventListener('click', () => {
        window.open(UI_PATH, '_blank', 'noopener');
    });
}

/** 工具栏按钮(APP_READY 后创建,避免与其它扩展冲突)。 */
function ensureButton() {
    if (button) return;
    const holder = document.getElementById('extensionsMenu')?.parentElement;
    if (!holder) return;
    button = document.createElement('div');
    button.id = 'wb_gateway_button';
    button.className = 'list-group-item flex-container flexGap5 interactable wb-offline';
    button.title = 'WorkBuddy Gateway';
    button.innerHTML = '<i class="fa-solid fa-plug-circle-bolt fa-fw"></i><span>WorkBuddy</span>';
    button.addEventListener('click', togglePanel);
    holder.appendChild(button);
}

export function onActivate() {
    const ctx = SillyTavern.getContext();
    ctx.eventSource.on(ctx.event_types.APP_READY, () => {
        ensureButton();
        void checkBackend();
        // 每 60 秒探测一次后端在线状态
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => void checkBackend(), 60_000);
    });
}
