let allPlans = [];

document.addEventListener('DOMContentLoaded', () => {
    loadPlans();
    document.getElementById('sql-backup-btn')?.addEventListener('click', downloadSqlBackup);
});

async function downloadSqlBackup() {
    const btn = document.getElementById('sql-backup-btn');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;">
        <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
        <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
    </svg> Exporting…`;

    try {
        const res = await fetch('/api/backup/sql');
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(data.error || 'Backup failed', 'error');
            return;
        }
        const blob = await res.blob();
        const filename = (res.headers.get('Content-Disposition') || '')
            .match(/filename="?([^"]+)"?/)?.[1] || '44fitness_backup.sql';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup downloaded', 'success');
    } catch {
        showToast('Network error — backup failed', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

async function loadPlans() {
    const tbody = document.getElementById('plans-tbody');
    try {
        const res = await fetch('/api/plans');
        if (!res.ok) throw new Error('Failed to load');
        allPlans = await res.json();
        renderPlans();
    } catch {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Failed to load plans.</td></tr>';
    }
}

function renderPlans() {
    const tbody = document.getElementById('plans-tbody');
    if (!allPlans.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No plans yet. Click "Add Plan" to create one.</td></tr>';
        return;
    }

    tbody.innerHTML = allPlans.map(p => {
        const statusBadge = p.is_active
            ? '<span class="badge badge-green">Active</span>'
            : '<span class="badge badge-muted">Inactive</span>';
        const daysLabel = daysToLabel(p.duration_days);
        return `<tr>
            <td>${escHtml(p.category)}</td>
            <td>${escHtml(p.label)}</td>
            <td class="text-right" style="font-variant-numeric:tabular-nums;">₹${Number(p.amount).toLocaleString('en-IN')}</td>
            <td class="text-right">${daysLabel}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <a href="/dashboard/plan-form?id=${p.ID}" class="action-btn edit" title="Edit plan">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </a>
                    <button class="action-btn" title="Toggle active/inactive" onclick="togglePlan(${p.ID})" style="color:${p.is_active ? 'var(--warning)' : 'var(--success)'};">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                            stroke-linecap="round" stroke-linejoin="round">
                            ${p.is_active
                ? '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'
                : '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'}
                        </svg>
                    </button>
                    <button class="action-btn" title="Delete plan" onclick="deletePlan(${p.ID})"
                        style="color:var(--danger);" onmouseover="this.style.background='var(--danger-muted)'" onmouseout="this.style.background='transparent'">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function daysToLabel(days) {
    if (days === 365) return '1 Year (365d)';
    if (days === 180) return '6 Months (180d)';
    if (days === 90) return '3 Months (90d)';
    if (days === 30) return '1 Month (30d)';
    return `${days} day${days !== 1 ? 's' : ''}`;
}

async function togglePlan(planId) {
    const plan = allPlans.find(p => p.ID === planId);
    if (!plan) return;

    try {
        const res = await fetch(`/api/plans/${planId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: plan.category,
                label: plan.label,
                amount: plan.amount,
                duration_days: plan.duration_days,
                is_active: plan.is_active ? 0 : 1,
            }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to update', 'error'); return; }
        showToast(plan.is_active ? 'Plan deactivated' : 'Plan activated', 'success');
        await loadPlans();
    } catch {
        showToast('Network error', 'error');
    }
}

async function deletePlan(planId) {
    const plan = allPlans.find(p => p.ID === planId);
    if (!plan) return;
    if (!confirm(`Delete plan "${plan.label} — ₹${plan.amount}"?\n\nThis only removes the plan option. Existing payments are unaffected.`)) return;

    try {
        const res = await fetch(`/api/plans/${planId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to delete', 'error'); return; }
        showToast('Plan deleted', 'success');
        await loadPlans();
    } catch {
        showToast('Network error', 'error');
    }
}
