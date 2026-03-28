document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    // Populate category datalist from existing plans
    await loadCategorySuggestions();

    if (id) {
        document.getElementById('form-title').textContent = 'Edit Plan';
        document.getElementById('form-subtitle').textContent = 'Update plan details below';
        document.getElementById('mobile-title').textContent = 'Edit Plan';
        document.getElementById('status-group').style.display = 'block';
        await loadPlan(id);
    } else {
        document.getElementById('p-category').focus();
    }

    document.getElementById('p-days').addEventListener('input', updateDaysHint);
    document.getElementById('p-active').addEventListener('change', (e) => {
        document.getElementById('active-text').textContent = e.target.checked ? 'Active' : 'Inactive';
    });
    document.getElementById('plan-save-btn').addEventListener('click', savePlan);
});

async function loadCategorySuggestions() {
    try {
        const res = await fetch('/api/plans');
        if (!res.ok) return;
        const plans = await res.json();
        const cats = [...new Set(plans.map(p => p.category))];
        const dl = document.getElementById('category-suggestions');
        dl.innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');
    } catch { /* silent */ }
}

async function loadPlan(id) {
    try {
        const res = await fetch(`/api/plans/${encodeURIComponent(id)}`);
        if (!res.ok) { showToast('Plan not found', 'error'); return; }
        const plan = await res.json();
        if (plan.error) { showToast(plan.error, 'error'); return; }

        document.getElementById('plan-id').value = plan.ID;
        document.getElementById('p-category').value = plan.category;
        document.getElementById('p-label').value = plan.label;
        document.getElementById('p-amount').value = plan.amount;
        document.getElementById('p-days').value = plan.duration_days;
        document.getElementById('p-active').checked = !!plan.is_active;
        document.getElementById('active-text').textContent = plan.is_active ? 'Active' : 'Inactive';
        updateDaysHint();
    } catch {
        showToast('Failed to load plan', 'error');
    }
}

function updateDaysHint() {
    const days = Number(document.getElementById('p-days').value);
    const hint = document.getElementById('days-hint');
    if (!days) { hint.textContent = ''; return; }
    if (days === 365) hint.textContent = '≈ 1 year';
    else if (days === 180) hint.textContent = '≈ 6 months';
    else if (days === 90) hint.textContent = '≈ 3 months';
    else if (days === 30) hint.textContent = '≈ 1 month';
    else if (days < 30) hint.textContent = `${days} day${days !== 1 ? 's' : ''}`;
    else hint.textContent = `≈ ${(days / 30).toFixed(1)} months`;
}

async function savePlan() {
    const id = document.getElementById('plan-id').value.trim();
    const category = document.getElementById('p-category').value.trim();
    const label = document.getElementById('p-label').value.trim();
    const amount = document.getElementById('p-amount').value.trim();
    const duration_days = document.getElementById('p-days').value.trim();
    const is_active = document.getElementById('p-active').checked;

    if (!category) { showToast('Category is required', 'error'); document.getElementById('p-category').focus(); return; }
    if (!label) { showToast('Label is required', 'error'); document.getElementById('p-label').focus(); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        showToast('Enter a valid amount', 'error'); document.getElementById('p-amount').focus(); return;
    }
    if (!duration_days || isNaN(Number(duration_days)) || Number(duration_days) <= 0) {
        showToast('Enter valid duration in days', 'error'); document.getElementById('p-days').focus(); return;
    }

    const btn = document.getElementById('plan-save-btn');
    btn.disabled = true;

    try {
        const url = id ? `/api/plans/${id}` : '/api/plans';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category,
                label,
                amount: Number(amount),
                duration_days: Number(duration_days),
                is_active,
            }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to save', 'error'); return; }

        showToast(id ? 'Plan updated!' : 'Plan added!', 'success');
        setTimeout(() => { window.location.href = '/dashboard/settings'; }, 900);
    } catch {
        showToast('Network error — please try again', 'error');
    } finally {
        btn.disabled = false;
    }
}
