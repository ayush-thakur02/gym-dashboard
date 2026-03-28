/* ══════════════════════════════════════════════════════
   Dashboard — Main SPA Controller
   ══════════════════════════════════════════════════════ */

// ── Auth guard ──────────────────────────────────────────
(async () => {
    try {
        const res = await fetch('/api/auth/verify', { credentials: 'include' });
        if (!res.ok) return (window.location.href = '/admin');
        const data = await res.json();
        document.getElementById('admin-username').textContent = data.username;
    } catch {
        window.location.href = '/admin';
    }
})();

// ── Navigation ──────────────────────────────────────────
let currentPage = 'overview';
let hourlyChart = null;
let monthlyChart = null;
let entryChart = null;

// ── Form page context ──────────────────────────────────
let memberFormReturnPage = 'members';
let paymentFormReturnPage = 'payments';

// ── Pagination state ────────────────────────────────────
let membersPage = 1;
let paymentsPage = 1;
let entryPage = 1;
const PAGE_SIZE = 25;

function renderPagination(containerId, curPage, total, pageSize, fnName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
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
    const prevDisabled = curPage <= 1 ? 'disabled' : '';
    const nextDisabled = curPage >= totalPages ? 'disabled' : '';
    let html = `<div class="pagination">
        <span class="pagination-info">${s}–${e} of ${total}</span>
        <div class="pagination-btns">
            <button class="page-btn" onclick="${fnName}(${curPage - 1})" ${prevDisabled}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>`;
    for (const p of pages) {
        if (p === '...') html += `<span class="page-ellipsis">…</span>`;
        else html += `<button class="page-btn${p === curPage ? ' active' : ''}" onclick="${fnName}(${p})">${p}</button>`;
    }
    html += `<button class="page-btn" onclick="${fnName}(${curPage + 1})" ${nextDisabled}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button></div></div>`;
    container.innerHTML = html;
}

document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(item.dataset.page);
        closeSidebar();
    });
});

function navigateTo(page) {
    if (page === currentPage) return;

    // Keep the parent nav item highlighted for sub-form pages
    const navPage = page === 'member-form' ? 'members' : page === 'payment-form' ? 'payments' : page;
    document.querySelectorAll('.nav-item').forEach((i) =>
        i.classList.toggle('active', i.dataset.page === navPage)
    );
    document.querySelectorAll('.page-section').forEach((s) =>
        s.classList.toggle('active', s.id === `page-${page}`)
    );

    currentPage = page;

    if (page === 'overview') loadOverview();
    else if (page === 'members') loadMembers();
    else if (page === 'payments') loadPayments();
    else if (page === 'entry') initEntryPage();
}

// ── Mobile sidebar ──────────────────────────────────────
document.getElementById('hamburger').addEventListener('click', openSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('active');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

// ── Logout ──────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/admin';
});

// ── Helpers ─────────────────────────────────────────────
function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtCurrency(n) {
    return '₹' + Number(n).toLocaleString('en-IN');
}
function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CHART_DEFAULTS = {
    plugins: {
        legend: { display: false }, tooltip: {
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1,
            titleColor: '#1a1a1e', bodyColor: 'rgba(0,0,0,0.6)',
            padding: 10, cornerRadius: 8,
        }
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

// ── Form back / cancel button wiring ───────────────────────
document.getElementById('member-form-back-btn').addEventListener('click', () => navigateTo(memberFormReturnPage));
document.getElementById('member-form-cancel-btn').addEventListener('click', () => navigateTo(memberFormReturnPage));
document.getElementById('payment-form-back-btn').addEventListener('click', () => navigateTo(paymentFormReturnPage));
document.getElementById('payment-form-cancel-btn').addEventListener('click', () => navigateTo(paymentFormReturnPage));

// ══════════════════════════════════════════════════════════
// OVERVIEW
// ══════════════════════════════════════════════════════════
async function loadOverview() {
    document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    // Stats
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('stat-members').textContent = data.totalMembers.toLocaleString();
        document.getElementById('stat-today').textContent = data.todayEntries.toLocaleString();
        document.getElementById('stat-revenue').textContent = fmtCurrency(data.monthlyRevenue);
        document.getElementById('stat-active').textContent = data.activeMembers.toLocaleString();
    } catch { /* silent */ }

    loadExtendedStats();

    // Hourly chart (today)
    try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/stats/hourly?date=${today}`);
        const rows = await res.json();

        const fullHours = [];
        for (let h = 5; h <= 22; h++) fullHours.push(h);
        const labels = fullHours.map((h) => `${h}:00`);
        const counts = fullHours.map((h) => {
            const r = rows.find((x) => x.hour === h);
            return r ? r.count : 0;
        });

        const total = counts.reduce((a, b) => a + b, 0);
        document.getElementById('today-total-badge').textContent = `${total} entries`;

        const ctx = document.getElementById('hourly-chart').getContext('2d');
        if (hourlyChart) hourlyChart.destroy();
        hourlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: counts,
                    backgroundColor: 'rgba(59,130,246,0.45)',
                    borderColor: 'rgba(59,130,246,0.9)',
                    borderWidth: 1.5,
                    borderRadius: 5,
                    borderSkipped: false,
                    hoverBackgroundColor: 'rgba(59,130,246,0.75)',
                }],
            },
            options: { ...CHART_DEFAULTS },
        });
    } catch { /* silent */ }

    // Monthly trend chart
    try {
        const res = await fetch('/api/stats/monthly');
        const rows = await res.json();
        const labels = rows.map((r) => {
            const [y, m] = r.month.split('-');
            return new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        });
        const counts = rows.map((r) => r.count);

        const ctx = document.getElementById('monthly-chart').getContext('2d');
        if (monthlyChart) monthlyChart.destroy();
        monthlyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: counts,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.08)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#2563eb',
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderWidth: 2,
                }],
            },
            options: { ...CHART_DEFAULTS },
        });
    } catch { /* silent */ }
}

async function loadExtendedStats() {
    try {
        const [extRes, expRes] = await Promise.all([
            fetch('/api/stats/extended'),
            fetch('/api/stats/expiring?days=7'),
        ]);
        const ext = await extRes.json();
        const expiring = await expRes.json();

        // Second row of stat cards
        document.getElementById('stat-expiring').textContent = expiring.length.toLocaleString();
        document.getElementById('stat-new-members').textContent = ext.newThisMonth.toLocaleString();
        document.getElementById('stat-ytd-revenue').textContent = fmtCurrency(ext.ytdRevenue);
        document.getElementById('stat-avg-daily').textContent = ext.avgDailyCheckins;

        // Expiring members list
        const expiringEl = document.getElementById('expiring-list');
        const badge = document.getElementById('expiring-count-badge');
        badge.textContent = `${expiring.length} member${expiring.length !== 1 ? 's' : ''}`;
        if (!expiring.length) {
            expiringEl.innerHTML = '<div class="mini-list-empty">No memberships expiring in 7 days</div>';
        } else {
            const today = new Date();
            expiringEl.innerHTML = expiring.map(m => {
                const exp = new Date(m.expiryDate + 'T00:00:00');
                const diff = Math.round((exp - today) / 86400000);
                const cls = diff <= 2 ? 'danger' : 'warning';
                const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff}d`;
                const waMsg = encodeURIComponent(
                    `Hi ${m.Name}, your 44 Fitness Center membership is expiring ${diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `in ${diff} days`} (on ${m.expiryDate}). Please renew your subscription to continue your fitness journey. 💪`
                );
                const waPhone = `91${String(m.Phone).replace(/\D/g, '')}`;
                const waUrl = `https://wa.me/${waPhone}?text=${waMsg}`;
                return `<div class="mini-list-item">
                    <div style="flex:1;min-width:0;">
                        <div class="mini-list-name">${escHtml(m.Name)}</div>
                        <span class="mini-list-sub">${escHtml(String(m.Phone))}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                        <span class="mini-list-badge ${cls}">${label}</span>
                        <a href="${waUrl}" target="_blank" rel="noopener noreferrer" title="Send WhatsApp reminder"
                            style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#25d366;color:#fff;text-decoration:none;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.528 5.845L.057 23.428a.5.5 0 0 0 .619.61l5.737-1.505A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a10 10 0 0 1-5.09-1.385l-.36-.214-3.742.981.999-3.645-.236-.375A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                            </svg>
                        </a>
                    </div>
                </div>`;
            }).join('');
        }

        // Top active members list
        const topEl = document.getElementById('top-members-list');
        if (!ext.topMembers.length) {
            topEl.innerHTML = '<div class="mini-list-empty">No check-ins this month</div>';
        } else {
            topEl.innerHTML = ext.topMembers.map((m, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const rank = i < 3 ? `<span style="font-size:1rem;">${medals[i]}</span>` : `<span class="mini-list-meta" style="width:22px;text-align:center;">${i + 1}</span>`;
                return `<div class="mini-list-item">
                    ${rank}
                    <div style="flex:1;min-width:0;">
                        <div class="mini-list-name">${escHtml(m.Name)}</div>
                        <span class="mini-list-sub">${escHtml(String(m.Phone))}</span>
                    </div>
                    <span class="mini-list-badge success">${m.visits} visit${m.visits !== 1 ? 's' : ''}</span>
                </div>`;
            }).join('');
        }
    } catch { /* silent */ }
}

// ══════════════════════════════════════════════════════════
// MEMBERS
// ══════════════════════════════════════════════════════════
async function loadMembers(page) {
    if (page === undefined) membersPage = 1;
    else membersPage = Math.max(1, page);
    const search = document.getElementById('members-search')?.value || '';
    const tbody = document.getElementById('members-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(search)}&page=${membersPage}&limit=${PAGE_SIZE}`);
        const { rows, total } = await res.json();

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No members found.</td></tr>`;
            document.getElementById('members-pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = rows.map((m) => {
            const dob = m.DOB ? fmtDate(m.DOB) : '—';
            const phone = m.Phone || '—';
            const emergency = m.Emergency_Phone && m.Emergency_Phone !== '0' ? m.Emergency_Phone : '—';
            return `
        <tr>
          <td><span class="font-medium">${escHtml(m.Name)}</span></td>
          <td>${escHtml(phone)}</td>
          <td>${escHtml(emergency)}</td>
          <td>${escHtml(dob)}</td>
          <td title="${escHtml(m.Address || '')}">${escHtml(m.Address || '—')}</td>
          <td>
            <div class="table-actions">
              <button class="action-btn edit" title="Edit" onclick="openEditMemberForm(${m.ID})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>`;
        }).join('');
        renderPagination('members-pagination', membersPage, total, PAGE_SIZE, 'loadMembers');
    } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load members.</td></tr>`;
    }
}

function openAddMemberForm() {
    memberFormReturnPage = 'members';
    document.getElementById('member-form-title').textContent = 'Add Member';
    document.getElementById('member-form-subtitle').textContent = 'Fill in member details below';
    document.getElementById('member-id').value = '';
    ['m-firstname', 'm-lastname', 'm-phone', 'm-emergency', 'm-dob', 'm-house', 'm-sector', 'm-city']
        .forEach((id) => { document.getElementById(id).value = ''; });
    document.getElementById('m-phone').disabled = false;
    navigateTo('member-form');
    setTimeout(() => document.getElementById('m-firstname').focus(), 50);
}

async function openEditMemberForm(id) {
    memberFormReturnPage = 'members';
    document.getElementById('member-form-title').textContent = 'Edit Member';
    document.getElementById('member-form-subtitle').textContent = 'Update member details below';
    document.getElementById('member-id').value = id;
    navigateTo('member-form');

    try {
        const res = await fetch(`/api/members/by-id/${id}`);
        const m = await res.json();
        if (!m || m.error) { showToast('Member not found', 'error'); return; }

        const addr = m.Address || '';
        const houseMatch = addr.match(/House No:\s*([^,]+)/);
        const sectorMatch = addr.match(/Sector:\s*([^,]+)/);
        const cityMatch = addr.match(/,\s*([^,]+)$/);

        const nameParts = (m.Name || '').split(' ');
        document.getElementById('m-firstname').value = nameParts[0] || '';
        document.getElementById('m-lastname').value = nameParts.slice(1).join(' ').trim();
        document.getElementById('m-phone').value = m.Phone || '';
        document.getElementById('m-phone').disabled = false;
        document.getElementById('m-emergency').value = (m.Emergency_Phone && m.Emergency_Phone !== '0') ? m.Emergency_Phone : '';
        document.getElementById('m-dob').value = m.DOB ? m.DOB.split('T')[0] : '';
        document.getElementById('m-house').value = houseMatch ? houseMatch[1].trim() : '';
        document.getElementById('m-sector').value = sectorMatch ? sectorMatch[1].trim() : '';
        document.getElementById('m-city').value = cityMatch ? cityMatch[1].trim() : '';
    } catch {
        showToast('Failed to load member details', 'error');
    }
}

async function saveMember() {
    const id = document.getElementById('member-id').value;
    const firstName = document.getElementById('m-firstname').value.trim();
    const lastName = document.getElementById('m-lastname').value.trim();
    const phone = document.getElementById('m-phone').value.trim();
    const emergency = document.getElementById('m-emergency').value.trim();
    const dob = document.getElementById('m-dob').value;
    const houseNo = document.getElementById('m-house').value.trim();
    const sector = document.getElementById('m-sector').value.trim();
    const city = document.getElementById('m-city').value.trim();

    if (!firstName) { showToast('First name is required', 'error'); return; }
    if (!phone) { showToast('Phone number is required', 'error'); return; }

    const btn = document.getElementById('member-save-btn');
    btn.disabled = true;

    try {
        const url = id ? `/api/members/${id}` : '/api/members';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, phone, emergencyPhone: emergency, dob, houseNo, sector, city }),
        });
        const data = await res.json();

        if (!res.ok) { showToast(data.error || 'Failed to save', 'error'); return; }

        showToast(id ? 'Member updated successfully!' : `${data.name} registered!`, 'success');
        navigateTo(memberFormReturnPage);
    } catch {
        showToast('Network error', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════
async function loadPayments(page) {
    if (page === undefined) paymentsPage = 1;
    else paymentsPage = Math.max(1, page);
    const search = document.getElementById('payments-search')?.value || '';
    const tbody = document.getElementById('payments-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch(`/api/payments?search=${encodeURIComponent(search)}&page=${paymentsPage}&limit=${PAGE_SIZE}`);
        const { rows, total } = await res.json();

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No payments found.</td></tr>`;
            document.getElementById('payments-pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = rows.map((p) => {
            const badge = p.Mode === 'UPI'
                ? `<span class="badge badge-blue">UPI</span>`
                : `<span class="badge badge-green">Cash</span>`;
            return `
        <tr>
          <td><span class="font-medium">${escHtml(p.Name)}</span></td>
          <td>${fmtDate(p.Date)}</td>
          <td>${escHtml(String(p.Phone))}</td>
          <td>${badge}</td>
          <td class="font-semibold">${fmtCurrency(p.Money)}</td>
          <td>
            <div class="table-actions">
              <button class="action-btn edit" title="Edit" onclick="openEditPaymentForm(${p.ID}, '${escHtml(p.Date)}', ${p.Money}, '${escHtml(p.Mode)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>`;
        }).join('');
        renderPagination('payments-pagination', paymentsPage, total, PAGE_SIZE, 'loadPayments');
    } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load payments.</td></tr>`;
    }
}

function openAddPaymentForm() {
    paymentFormReturnPage = 'payments';
    document.getElementById('payment-form-title').textContent = 'New Payment';
    document.getElementById('payment-form-subtitle').textContent = 'Record a membership payment';
    document.getElementById('payment-id').value = '';
    document.getElementById('p-phone').value = '';
    document.getElementById('p-phone').disabled = false;
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('p-amount').value = '1500';
    document.getElementById('p-mode').value = 'UPI';
    navigateTo('payment-form');
    setTimeout(() => document.getElementById('p-phone').focus(), 50);
}

function openEditPaymentForm(id, date, amount, mode) {
    paymentFormReturnPage = 'payments';
    document.getElementById('payment-form-title').textContent = 'Edit Payment';
    document.getElementById('payment-form-subtitle').textContent = 'Update payment details below';
    document.getElementById('payment-id').value = id;
    document.getElementById('p-phone').value = '';
    document.getElementById('p-phone').disabled = true;
    document.getElementById('p-date').value = date ? date.split('T')[0] : '';
    document.getElementById('p-amount').value = String(amount);
    document.getElementById('p-mode').value = mode;
    navigateTo('payment-form');
}

async function savePayment() {
    const id = document.getElementById('payment-id').value;
    const phone = document.getElementById('p-phone').value.trim();
    const date = document.getElementById('p-date').value;
    const amount = document.getElementById('p-amount').value;
    const mode = document.getElementById('p-mode').value;

    if (!id && !phone) { showToast('Phone number is required', 'error'); return; }
    if (!date) { showToast('Payment date is required', 'error'); return; }

    const btn = document.getElementById('payment-save-btn');
    btn.disabled = true;

    try {
        const url = id ? `/api/payments/${id}` : '/api/payments';
        const method = id ? 'PUT' : 'POST';
        const body = id ? { amount, date, mode } : { phone, amount, date, mode };

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) { showToast(data.error || 'Failed to save', 'error'); return; }

        showToast(id ? 'Payment updated!' : `Payment recorded for ${data.name}!`, 'success');
        navigateTo(paymentFormReturnPage);
    } catch {
        showToast('Network error', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════
// DAILY ENTRY
// ══════════════════════════════════════════════════════════
let entryFilter = 'today';

function initEntryPage() {
    // Populate year select
    const yearSelect = document.getElementById('filter-year');
    const thisYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = thisYear; y >= thisYear - 5; y--) {
        yearSelect.innerHTML += `<option value="${y}" ${y === thisYear ? 'selected' : ''}>${y}</option>`;
    }

    // Set current month
    document.getElementById('filter-month').value = String(new Date().getMonth() + 1);

    // Set today's date
    document.getElementById('filter-date').value = new Date().toISOString().split('T')[0];

    loadEntry();
}

function setEntryFilter(filter, el) {
    entryFilter = filter;
    document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
    el.classList.add('active');

    document.getElementById('filter-date-wrap').style.display = filter === 'date' ? 'flex' : 'none';
    document.getElementById('filter-month-wrap').style.display = filter === 'month' ? 'flex' : 'none';

    loadEntry();
}

async function loadEntry(page) {
    if (page === undefined) entryPage = 1;
    else entryPage = Math.max(1, page);
    const search = document.getElementById('entry-search')?.value || '';
    let url = `/api/entry?filter=${entryFilter}&search=${encodeURIComponent(search)}&page=${entryPage}&limit=${PAGE_SIZE}`;

    if (entryFilter === 'date') {
        url += `&date=${document.getElementById('filter-date').value}`;
    } else if (entryFilter === 'month') {
        url += `&month=${document.getElementById('filter-month').value}&year=${document.getElementById('filter-year').value}`;
    }

    const tbody = document.getElementById('entry-tbody');
    tbody.innerHTML = `<tr><td colspan="4" class="table-loading"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const rows = data.rows;

        // Update badge with total count
        document.getElementById('entry-count-badge').textContent = `${data.total} entries`;

        // Render table
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="table-empty">No entries found.</td></tr>`;
            document.getElementById('entry-pagination').innerHTML = '';
        } else {
            tbody.innerHTML = rows.map((r) => {
                const timeStr = typeof r.Time === 'number'
                    ? new Date(r.Time * 1000).toISOString().substr(11, 8)
                    : r.Time;
                return `
          <tr>
            <td><span class="font-medium">${escHtml(r.Name)}</span></td>
            <td>${escHtml(String(r.Phone))}</td>
            <td>${fmtDate(r.Date)}</td>
            <td>${escHtml(timeStr || '—')}</td>
          </tr>`;
            }).join('');
            renderPagination('entry-pagination', entryPage, data.total, PAGE_SIZE, 'loadEntry');
        }

        // Draw chart
        await loadEntryChart(data.start, data.end);
    } catch {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Failed to load entries.</td></tr>`;
    }
}

async function loadEntryChart(start, end) {
    const ctx = document.getElementById('entry-chart').getContext('2d');
    if (entryChart) entryChart.destroy();

    try {
        if (entryFilter === 'month') {
            // Daily counts for the month
            const [y, m] = start.split('-');
            const res = await fetch(`/api/entry/daily-counts?month=${+m}&year=${+y}`);
            const data = await res.json();

            const daysInMonth = new Date(+y, +m, 0).getDate();
            const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
            const counts = labels.map((d) => {
                const dateStr = `${y}-${m}-${d.padStart(2, '0')}`;
                const row = data.rows.find((r) => r.Date === dateStr);
                return row ? row.count : 0;
            });

            document.getElementById('entry-chart-title').textContent = `Daily Entries — ${new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

            entryChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        data: counts,
                        backgroundColor: 'rgba(168,85,247,0.4)',
                        borderColor: 'rgba(168,85,247,0.8)',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        borderSkipped: false,
                    }],
                },
                options: { ...CHART_DEFAULTS },
            });
        } else {
            // Hourly for specific date / today
            const date = entryFilter === 'date'
                ? document.getElementById('filter-date').value
                : new Date().toISOString().split('T')[0];

            const res = await fetch(`/api/stats/hourly?date=${date}`);
            const rows = await res.json();

            const fullHours = Array.from({ length: 18 }, (_, i) => i + 5);
            const labels = fullHours.map((h) => `${h}:00`);
            const counts = fullHours.map((h) => {
                const r = rows.find((x) => x.hour === h);
                return r ? r.count : 0;
            });

            document.getElementById('entry-chart-title').textContent = `Hourly Traffic — ${fmtDate(date)}`;

            entryChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        data: counts,
                        backgroundColor: 'rgba(59,130,246,0.4)',
                        borderColor: 'rgba(59,130,246,0.85)',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        borderSkipped: false,
                    }],
                },
                options: { ...CHART_DEFAULTS },
            });
        }
    } catch { /* silent chart error */ }
}

// ── Initial load ─────────────────────────────────────────
loadOverview();
