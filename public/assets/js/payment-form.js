/* ══════════════════════════════════════════════════════
   Payment Form Page — Add & Edit
   ══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    // Set default date to today
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];

    // Load plans from DB first
    await loadPlanOptions();

    if (id) {
        // Edit mode
        document.getElementById('form-title').textContent = 'Edit Payment';
        document.getElementById('form-subtitle').textContent = 'Update payment details below';
        document.getElementById('mobile-title').textContent = 'Edit Payment';
        // Hide phone field — can't change member on edit
        document.getElementById('phone-group').style.display = 'none';
        loadPayment(id);
    } else {
        // Add mode — focus phone field
        document.getElementById('p-phone').focus();
    }

    document.getElementById('payment-save-btn').addEventListener('click', savePayment);
});

async function loadPlanOptions(selectedValue) {
    const sel = document.getElementById('p-amount');
    try {
        const res = await fetch('/api/plans');
        if (!res.ok) throw new Error('Failed');
        const plans = await res.json();

        // Group by category
        const groups = {};
        for (const p of plans) {
            if (!p.is_active) continue;
            if (!groups[p.category]) groups[p.category] = [];
            groups[p.category].push(p);
        }

        sel.innerHTML = '';
        for (const [cat, items] of Object.entries(groups)) {
            const og = document.createElement('optgroup');
            og.label = cat;
            for (const p of items) {
                const opt = document.createElement('option');
                opt.value = p.amount;
                opt.textContent = `₹${p.amount.toLocaleString('en-IN')} — ${p.label}`;
                if (selectedValue !== undefined && String(p.amount) === String(selectedValue)) {
                    opt.selected = true;
                }
                og.appendChild(opt);
            }
            sel.appendChild(og);
        }

        if (!sel.options.length) {
            sel.innerHTML = '<option value="">No active plans — add in Settings</option>';
        }
    } catch {
        sel.innerHTML = '<option value="">Failed to load plans</option>';
    }
}

async function loadPayment(id) {
    try {
        const res = await fetch(`/api/payments/${encodeURIComponent(id)}`);
        if (!res.ok) {
            showToast('Payment not found', 'error');
            return;
        }
        const p = await res.json();
        if (p.error) { showToast(p.error, 'error'); return; }

        document.getElementById('payment-id').value = p.ID;
        document.getElementById('p-date').value = p.Date ? p.Date.split('T')[0] : '';
        // Re-populate select with saved value selected
        await loadPlanOptions(p.Money);
        document.getElementById('p-mode').value = p.Mode || 'UPI';

        // Show member name in info bar
        if (p.Name) {
            document.getElementById('member-info-name').textContent = `${p.Name} — ${p.Phone}`;
            document.getElementById('member-info-bar').style.display = 'flex';
        }
    } catch {
        showToast('Failed to load payment details', 'error');
    }
}

async function savePayment() {
    const id = document.getElementById('payment-id').value.trim();
    const phone = document.getElementById('p-phone').value.trim();
    const date = document.getElementById('p-date').value;
    const amount = document.getElementById('p-amount').value;
    const mode = document.getElementById('p-mode').value;

    if (!id && !phone) { showToast('Phone number is required', 'error'); document.getElementById('p-phone').focus(); return; }
    if (!id && (phone.length !== 10 || !/^\d+$/.test(phone))) {
        showToast('Enter a valid 10-digit phone number', 'error');
        document.getElementById('p-phone').focus();
        return;
    }
    if (!date) { showToast('Payment date is required', 'error'); return; }
    if (!amount) { showToast('Plan amount is required', 'error'); return; }

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
        setTimeout(() => { window.location.href = '/dashboard/payments'; }, 900);
    } catch {
        showToast('Network error — please try again', 'error');
    } finally {
        btn.disabled = false;
    }
}
