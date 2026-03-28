/* ══════════════════════════════════════════════════════
   Members Page
   ══════════════════════════════════════════════════════ */

const PAGE_SIZE = 25;
let membersPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    loadMembers();

    // Live search with debounce
    let searchTimer;
    document.getElementById('members-search').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadMembers(), 300);
    });
});

async function loadMembers(page) {
    membersPage = page !== undefined ? Math.max(1, page) : 1;
    const search = document.getElementById('members-search')?.value?.trim() || '';
    const tbody = document.getElementById('members-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading"><div class="spinner"></div></td></tr>`;

    try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(search)}&page=${membersPage}&limit=${PAGE_SIZE}`);
        if (!res.ok) throw new Error('API error');
        const { rows, total } = await res.json();

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No members found.</td></tr>`;
            document.getElementById('members-pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = rows.map((m) => {
            const dob = m.DOB ? fmtDate(m.DOB) : '—';
            const phone = m.Phone ? escHtml(String(m.Phone)) : '—';
            const emergency = m.Emergency_Phone && m.Emergency_Phone !== '0'
                ? escHtml(String(m.Emergency_Phone)) : '—';
            const address = m.Address ? escHtml(m.Address) : '—';
            return `<tr>
                <td><span class="font-medium">${escHtml(m.Name)}</span></td>
                <td>${phone}</td>
                <td>${emergency}</td>
                <td>${dob}</td>
                <td title="${escHtml(m.Address || '')}">${address}</td>
                <td>
                    <div class="table-actions">
                        <a href="/dashboard/member-form?id=${m.ID}" class="action-btn edit" title="Edit member">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </a>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderPagination('members-pagination', membersPage, total, PAGE_SIZE, 'loadMembers');
    } catch {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load members.</td></tr>`;
    }
}
