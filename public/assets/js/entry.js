/* ══════════════════════════════════════════════════════
   Daily Entry Page
   ══════════════════════════════════════════════════════ */

const PAGE_SIZE = 25;
let entryPage = 1;
let entryFilter = 'today';
let entryChart = null;

document.addEventListener('DOMContentLoaded', () => {
    // Populate year dropdown
    const yearSelect = document.getElementById('filter-year');
    const thisYear = new Date().getFullYear();
    for (let y = thisYear; y >= thisYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        if (y === thisYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }

    // Set current month
    document.getElementById('filter-month').value = String(new Date().getMonth() + 1);

    // Set today's date
    document.getElementById('filter-date').value = new Date().toISOString().split('T')[0];

    // Filter tab clicks
    document.querySelectorAll('.filter-tab').forEach((btn) => {
        btn.addEventListener('click', () => setEntryFilter(btn.dataset.filter, btn));
    });

    // Search debounce
    let searchTimer;
    document.getElementById('entry-search').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadEntry(), 300);
    });

    // Date/month/year change
    document.getElementById('filter-date').addEventListener('change', loadEntry);
    document.getElementById('filter-month').addEventListener('change', loadEntry);
    document.getElementById('filter-year').addEventListener('change', loadEntry);

    loadEntry();
});

function setEntryFilter(filter, el) {
    entryFilter = filter;
    document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('filter-date-wrap').style.display = filter === 'date' ? 'flex' : 'none';
    document.getElementById('filter-month-wrap').style.display = filter === 'month' ? 'flex' : 'none';
    loadEntry();
}

async function loadEntry(page) {
    entryPage = page !== undefined ? Math.max(1, page) : 1;
    const search = document.getElementById('entry-search')?.value?.trim() || '';
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
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        const rows = data.rows;

        document.getElementById('entry-count-badge').textContent = `${data.total} entries`;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="table-empty">No entries found.</td></tr>`;
            document.getElementById('entry-pagination').innerHTML = '';
        } else {
            tbody.innerHTML = rows.map((r) => {
                const timeStr = typeof r.Time === 'number'
                    ? new Date(r.Time * 1000).toISOString().substr(11, 8)
                    : (r.Time || '—');
                return `<tr>
                    <td><span class="font-medium">${escHtml(r.Name)}</span></td>
                    <td>${escHtml(String(r.Phone))}</td>
                    <td>${fmtDate(r.Date)}</td>
                    <td>${escHtml(timeStr)}</td>
                </tr>`;
            }).join('');
            renderPagination('entry-pagination', entryPage, data.total, PAGE_SIZE, 'loadEntry');
        }

        await loadEntryChart(data.start, data.end);
    } catch {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Failed to load entries.</td></tr>`;
    }
}

async function loadEntryChart(start) {
    const ctx = document.getElementById('entry-chart').getContext('2d');
    if (entryChart) entryChart.destroy();

    try {
        if (entryFilter === 'month') {
            const [y, m] = start.split('-');
            const res = await fetch(`/api/entry/daily-counts?month=${+m}&year=${+y}`);
            if (!res.ok) return;
            const data = await res.json();

            const daysInMonth = new Date(+y, +m, 0).getDate();
            const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
            const counts = labels.map((d) => {
                const dateStr = `${y}-${m}-${d.padStart(2, '0')}`;
                const row = data.rows.find((r) => r.Date === dateStr);
                return row ? row.count : 0;
            });

            document.getElementById('entry-chart-title').textContent =
                `Daily Entries — ${new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

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
            const date = entryFilter === 'date'
                ? document.getElementById('filter-date').value
                : new Date().toISOString().split('T')[0];

            const res = await fetch(`/api/stats/hourly?date=${date}`);
            if (!res.ok) return;
            const rows = await res.json();

            const fullHours = Array.from({ length: 18 }, (_, i) => i + 5);
            const labels = fullHours.map((h) => `${h}:00`);
            const counts = fullHours.map((h) => {
                const r = rows.find((x) => x.hour === h);
                return r ? r.count : 0;
            });

            document.getElementById('entry-chart-title').textContent =
                `Hourly Traffic — ${fmtDate(date)}`;

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
