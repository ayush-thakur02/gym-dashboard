
async function initAuth() {
    try {
        const res = await fetch('/api/auth/verify', { credentials: 'include' });
        if (!res.ok) { window.location.href = '/admin'; return; }
        const data = await res.json();
        const el = document.getElementById('admin-username');
        if (el) el.textContent = data.username;
    } catch {
        window.location.href = '/admin';
    }
}

function setActiveNav() {
    const page = document.body.dataset.page || '';
    document.querySelectorAll('.nav-item[data-page]').forEach((link) => {
        link.classList.toggle('active', link.dataset.page === page);
    });
}


function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('active');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { }
    window.location.href = '/admin';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('hamburger')?.addEventListener('click', openSidebar);
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    setActiveNav();
    initAuth();
    initIdleTimer();
});

// ── Idle auto-disconnect ────────────────────────────────────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes
const IDLE_WARN_MS = 2 * 60 * 1000;   // warn 2 min before logout

let _idleTimer = null;
let _idleWarnTimer = null;
let _idleWarnShown = false;

function _resetIdleTimer() {
    clearTimeout(_idleTimer);
    clearTimeout(_idleWarnTimer);
    if (_idleWarnShown) {
        _idleWarnShown = false;
        document.getElementById('idle-warn-overlay')?.remove();
    }
    _idleWarnTimer = setTimeout(_showIdleWarning, IDLE_TIMEOUT_MS - IDLE_WARN_MS);
    _idleTimer = setTimeout(_idleLogout, IDLE_TIMEOUT_MS);
}

function _showIdleWarning() {
    if (document.getElementById('idle-warn-overlay')) return;
    _idleWarnShown = true;

    const overlay = document.createElement('div');
    overlay.id = 'idle-warn-overlay';
    overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;' +
        'display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:32px 36px;max-width:380px;
                    width:90%;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,0.2);">
            <div style="font-size:36px;margin-bottom:14px;">⏱️</div>
            <h3 style="margin:0 0 8px;font-size:17px;font-weight:600;color:#1a1a1e;">
                Session Expiring Soon
            </h3>
            <p style="margin:0 0 22px;font-size:13px;color:#666;line-height:1.5;">
                You've been inactive for a while.<br>
                You'll be signed out in <strong>2 minutes</strong>.
            </p>
            <button id="idle-stay-btn"
                style="background:#6c47ff;color:#fff;border:none;padding:11px 28px;
                       border-radius:9px;font-size:14px;cursor:pointer;font-weight:600;
                       transition:opacity .15s;">
                Stay Signed In
            </button>
        </div>`;

    document.body.appendChild(overlay);
    document.getElementById('idle-stay-btn').addEventListener('click', _resetIdleTimer);
}

async function _idleLogout() {
    document.getElementById('idle-warn-overlay')?.remove();
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/admin?reason=idle';
}

function initIdleTimer() {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => document.addEventListener(e, _resetIdleTimer, { passive: true }));
    _resetIdleTimer();
}

function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtCurrency(n) {
    return '₹' + Number(n).toLocaleString('en-IN');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderPagination(containerId, curPage, total, pageSize, fn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    container._pgCallback = typeof fn === 'function' ? fn : window[fn];

    if (!container._pgListenerAttached) {
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pg]');
            if (!btn || btn.disabled || btn.hasAttribute('disabled')) return;
            const pg = parseInt(btn.dataset.pg, 10);
            if (!isNaN(pg) && typeof container._pgCallback === 'function') {
                container._pgCallback(pg);
            }
        });
        container._pgListenerAttached = true;
    }

    const s = (curPage - 1) * pageSize + 1;
    const e = Math.min(curPage * pageSize, total);
    let pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (curPage <= 4) {
        pages = [1, 2, 3, 4, 5, '...', totalPages];
    } else if (curPage >= totalPages - 3) {
        pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
        pages = [1, '...', curPage - 1, curPage, curPage + 1, '...', totalPages];
    }

    let html = `<div class="pagination">
        <span class="pagination-info">${s}–${e} of ${total}</span>
        <div class="pagination-btns">
            <button type="button" class="page-btn" data-pg="${curPage - 1}" ${curPage <= 1 ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>`;
    for (const p of pages) {
        if (p === '...') html += `<span class="page-ellipsis">…</span>`;
        else html += `<button type="button" class="page-btn${p === curPage ? ' active' : ''}" data-pg="${p}">${p}</button>`;
    }
    html += `<button type="button" class="page-btn" data-pg="${curPage + 1}" ${curPage >= totalPages ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button></div></div>`;
    container.innerHTML = html;
}

// ── Chart defaults ───────────────────────────────────────
const CHART_DEFAULTS = {
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1,
            titleColor: '#1a1a1e', bodyColor: 'rgba(0,0,0,0.6)',
            padding: 10, cornerRadius: 8,
        },
    },
    scales: {
        x: {
            grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
            ticks: { color: 'rgba(0,0,0,0.45)', font: { family: 'Inter', size: 11 } },
        },
        y: {
            grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
            ticks: { color: 'rgba(0,0,0,0.45)', font: { family: 'Inter', size: 11 }, precision: 0 },
            beginAtZero: true,
        },
    },
    animation: { duration: 400, easing: 'easeOutQuart' },
    responsive: true,
    maintainAspectRatio: false,
};
