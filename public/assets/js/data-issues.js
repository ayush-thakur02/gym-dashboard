/* ══════════════════════════════════════════════════════
   Data Issues Page
   ══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    loadIssues();
    document.getElementById('refresh-btn').addEventListener('click', loadIssues);
});

async function loadIssues() {
    const tbody = document.getElementById('issues-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch('/api/data-issues');
        if (!res.ok) throw new Error('API error');
        const rows = await res.json();

        const banner = document.getElementById('issue-banner');
        const bannerText = document.getElementById('issue-banner-text');

        if (!rows.length) {
            banner.style.display = 'none';
            tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No data issues found. Run the cleanup script to detect problems.</td></tr>`;
            return;
        }

        banner.style.display = 'flex';
        bannerText.textContent = `${rows.length} issue${rows.length !== 1 ? 's' : ''} found — edit each member manually to correct their data, then dismiss.`;

        tbody.innerHTML = rows.map((r) => {
            const issueLabel = r.issue_type === 'INVALID_PHONE'
                ? `<span class="badge" style="background:var(--danger-muted);color:var(--danger);">Invalid Phone</span>`
                : `<span class="badge" style="background:var(--warning-muted);color:var(--warning);">${escHtml(r.issue_type)}</span>`;

            return `<tr>
                <td><span class="font-medium">#${r.record_id}</span></td>
                <td>${r.Name ? escHtml(r.Name) : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td><code style="font-family:monospace;font-size:0.875rem;">${escHtml(r.field_value || '—')}</code></td>
                <td>${issueLabel}</td>
                <td>${escHtml(r.field_name || '—')}</td>
                <td style="max-width:280px;white-space:normal;font-size:0.8125rem;color:var(--text-secondary);">${escHtml(r.notes || '—')}</td>
                <td>
                    <div class="table-actions">
                        <a href="/dashboard/member-form?id=${r.record_id}" class="action-btn edit" title="Edit member">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </a>
                        <button class="action-btn" title="Dismiss issue" style="color:var(--danger);" onclick="dismissIssue(${r.id})">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch {
        document.getElementById('issues-tbody').innerHTML =
            `<tr><td colspan="7" class="table-empty">Failed to load data issues.</td></tr>`;
    }
}

async function dismissIssue(id) {
    try {
        const res = await fetch(`/api/data-issues/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        showToast('Issue dismissed', 'success');
        loadIssues();
    } catch {
        showToast('Failed to dismiss issue', 'error');
    }
}
