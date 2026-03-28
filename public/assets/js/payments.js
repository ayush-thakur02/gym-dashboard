/* ══════════════════════════════════════════════════════
   Payments Page
   ══════════════════════════════════════════════════════ */

const PAGE_SIZE = 25;
let paymentsPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
    // Populate year dropdown (current year back to 2015)
    const yearSel = document.getElementById('filter-pay-year');
    if (yearSel) {
        const curYear = new Date().getFullYear();
        yearSel.innerHTML = '<option value="">All Years</option>';
        for (let y = curYear; y >= 2015; y--) {
            yearSel.innerHTML += `<option value="${y}">${y}</option>`;
        }
    }

    // Populate amount filter from DB plans
    await loadAmountFilter();

    loadPayments();

    let searchTimer;
    const onFilterChange = () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadPayments(), 300);
    };

    document.getElementById('payments-search').addEventListener('input', onFilterChange);
    document.getElementById('filter-mode')?.addEventListener('change', () => loadPayments());
    document.getElementById('filter-pay-month')?.addEventListener('change', () => loadPayments());
    document.getElementById('filter-pay-year')?.addEventListener('change', () => loadPayments());
    document.getElementById('filter-amount')?.addEventListener('change', () => loadPayments());

    document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
        document.getElementById('payments-search').value = '';
        document.getElementById('filter-mode').value = '';
        document.getElementById('filter-pay-month').value = '';
        document.getElementById('filter-pay-year').value = '';
        document.getElementById('filter-amount').value = '';
        loadPayments();
    });
});

async function loadAmountFilter() {
    const sel = document.getElementById('filter-amount');
    if (!sel) return;
    try {
        const res = await fetch('/api/plans');
        if (!res.ok) return;
        const plans = await res.json();

        const groups = {};
        for (const p of plans) {
            if (!groups[p.category]) groups[p.category] = [];
            groups[p.category].push(p);
        }

        sel.innerHTML = '<option value="">All Amounts</option>';
        for (const [cat, items] of Object.entries(groups)) {
            const og = document.createElement('optgroup');
            og.label = cat;
            for (const p of items) {
                const opt = document.createElement('option');
                opt.value = p.amount;
                opt.textContent = `₹${Number(p.amount).toLocaleString('en-IN')} — ${p.label}`;
                og.appendChild(opt);
            }
            sel.appendChild(og);
        }
    } catch {
        // leave the "All Amounts" fallback in place
    }
}

async function loadPayments(page) {
    paymentsPage = page !== undefined ? Math.max(1, page) : 1;
    const search = document.getElementById('payments-search')?.value?.trim() || '';
    const mode = document.getElementById('filter-mode')?.value || '';
    const month = document.getElementById('filter-pay-month')?.value || '';
    const year = document.getElementById('filter-pay-year')?.value || '';
    const amount = document.getElementById('filter-amount')?.value || '';
    const tbody = document.getElementById('payments-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div></td></tr>`;

    const params = new URLSearchParams({ search, page: paymentsPage, limit: PAGE_SIZE });
    if (mode) params.set('mode', mode);
    if (month) params.set('month', month);
    if (year) params.set('year', year);
    if (amount) params.set('amount', amount);

    try {
        const res = await fetch(`/api/payments?${params.toString()}`);
        if (!res.ok) throw new Error('API error');
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
            return `<tr>
                <td><span class="font-medium">${escHtml(p.Name)}</span></td>
                <td>${fmtDate(p.Date)}</td>
                <td>${escHtml(String(p.Phone))}</td>
                <td>${badge}</td>
                <td class="font-semibold">${fmtCurrency(p.Money)}</td>
                <td>
                    <div class="table-actions">
                        <a href="/dashboard/payment-form?id=${p.ID}" class="action-btn edit" title="Edit payment">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </a>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderPagination('payments-pagination', paymentsPage, total, PAGE_SIZE, 'loadPayments');
    } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load payments.</td></tr>`;
    }
}
