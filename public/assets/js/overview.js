/* ══════════════════════════════════════════════════════
   Overview Page
   ══════════════════════════════════════════════════════ */

let hourlyChart = null;
let monthlyChart = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    loadOverview();
});

async function loadOverview() {
    await Promise.all([loadStats(), loadExtendedStats(), loadHourlyChart(), loadMonthlyChart()]);
}

async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('stat-members').textContent = data.totalMembers.toLocaleString();
        document.getElementById('stat-today').textContent = data.todayEntries.toLocaleString();
        document.getElementById('stat-revenue').textContent = fmtCurrency(data.monthlyRevenue);
        document.getElementById('stat-active').textContent = data.activeMembers.toLocaleString();
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

        document.getElementById('stat-expiring').textContent = expiring.length.toLocaleString();
        document.getElementById('stat-new-members').textContent = ext.newThisMonth.toLocaleString();
        document.getElementById('stat-ytd-revenue').textContent = fmtCurrency(ext.ytdRevenue);
        document.getElementById('stat-avg-daily').textContent = ext.avgDailyCheckins;

        // Expiring list
        const expiringEl = document.getElementById('expiring-list');
        const badge = document.getElementById('expiring-count-badge');
        badge.textContent = `${expiring.length} member${expiring.length !== 1 ? 's' : ''}`;
        if (!expiring.length) {
            expiringEl.innerHTML = '<div class="mini-list-empty">No memberships expiring in 7 days</div>';
        } else {
            const today = new Date();
            expiringEl.innerHTML = expiring.map((m) => {
                const exp = new Date(m.expiryDate + 'T00:00:00');
                const diff = Math.round((exp - today) / 86400000);
                const cls = diff <= 2 ? 'danger' : 'warning';
                const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff}d`;
                const phone = String(m.Phone).replace(/\D/g, '');
                const waPhone = phone.length === 10 ? `91${phone}` : phone;
                const waText = encodeURIComponent(`Hi ${m.Name}, your gym membership at 44 Fitness Center is expiring on ${m.expiryDate}. Please renew to continue your fitness journey!`);
                const waUrl = `https://wa.me/${waPhone}?text=${waText}`;
                return `<div class="mini-list-item">
                    <div style="flex:1;min-width:0;">
                        <div class="mini-list-name">${escHtml(m.Name)}</div>
                        <span class="mini-list-sub">${escHtml(String(m.Phone))}</span>
                    </div>
                    <span class="mini-list-badge ${cls}">${label}</span>
                    <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="wa-btn" title="Send WhatsApp reminder">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                        </svg>
                    </a>
                    
                </div>`;
            }).join('');
        }

        // Top members list
        const topEl = document.getElementById('top-members-list');
        if (!ext.topMembers.length) {
            topEl.innerHTML = '<div class="mini-list-empty">No check-ins this month</div>';
        } else {
            topEl.innerHTML = ext.topMembers.map((m, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const rank = i < 3
                    ? `<span style="font-size:1rem;">${medals[i]}</span>`
                    : `<span class="mini-list-meta" style="width:22px;text-align:center;">${i + 1}</span>`;
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

async function loadHourlyChart() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/stats/hourly?date=${today}`);
        if (!res.ok) return;
        const rows = await res.json();

        const fullHours = Array.from({ length: 18 }, (_, i) => i + 5);
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
}

async function loadMonthlyChart() {
    try {
        const res = await fetch('/api/stats/monthly');
        if (!res.ok) return;
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
