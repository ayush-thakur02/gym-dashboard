/* ══════════════════════════════════════════════════════
   Monthly Detail Page
   ══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    loadMonthlyDetail();
});

async function loadMonthlyDetail() {
    try {
        const res = await fetch('/api/stats/monthly-detail');
        if (!res.ok) { showToast('Failed to load data', 'error'); return; }
        const rows = await res.json();

        if (!rows.length) {
            document.getElementById('detail-tbody').innerHTML =
                '<tr><td colspan="5" class="table-empty">No data found.</td></tr>';
            return;
        }

        // Summary totals
        const totalCheckins = rows.reduce((s, r) => s + r.checkins, 0);
        const totalPayments = rows.reduce((s, r) => s + r.payments, 0);
        const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
        const avgCheckins = rows.length ? Math.round(totalCheckins / rows.length) : 0;

        document.getElementById('total-checkins').textContent = totalCheckins.toLocaleString();
        document.getElementById('total-payments').textContent = totalPayments.toLocaleString();
        document.getElementById('total-revenue').textContent = fmtCurrency(totalRevenue);
        document.getElementById('avg-checkins').textContent = avgCheckins.toLocaleString();

        // Table rows — newest month first
        const reversed = [...rows].reverse();
        const tbody = document.getElementById('detail-tbody');
        tbody.innerHTML = reversed.map((r) => {
            const [y, m] = r.month.split('-');
            const label = new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', {
                month: 'long', year: 'numeric',
            });

            // Days in that month for avg calc
            const daysInMonth = new Date(+y, +m, 0).getDate();
            const avgDay = (r.checkins / daysInMonth).toFixed(1);

            return `<tr>
                <td class="font-medium">${escHtml(label)}</td>
                <td class="text-right">${r.checkins.toLocaleString()}</td>
                <td class="text-right">${r.payments.toLocaleString()}</td>
                <td class="text-right">${fmtCurrency(r.revenue)}</td>
                <td class="text-right">${avgDay}</td>
            </tr>`;
        }).join('');

        // Footer totals
        document.getElementById('detail-tfoot').innerHTML = `
            <tr class="table-total-row">
                <td class="font-semibold">Total (${rows.length} month${rows.length !== 1 ? 's' : ''})</td>
                <td class="text-right font-semibold">${totalCheckins.toLocaleString()}</td>
                <td class="text-right font-semibold">${totalPayments.toLocaleString()}</td>
                <td class="text-right font-semibold">${fmtCurrency(totalRevenue)}</td>
                <td class="text-right">—</td>
            </tr>`;
    } catch {
        showToast('Network error', 'error');
    }
}
