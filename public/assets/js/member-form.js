/* ══════════════════════════════════════════════════════
   Member Form Page — Add & Edit
   ══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (id) {
        // Edit mode
        document.getElementById('form-title').textContent = 'Edit Member';
        document.getElementById('form-subtitle').textContent = 'Update member details below';
        document.getElementById('mobile-title').textContent = 'Edit Member';
        loadMember(id);
    } else {
        // Add mode
        document.getElementById('m-firstname').focus();
    }

    document.getElementById('member-save-btn').addEventListener('click', saveMember);

    // Allow Enter key to submit (not on textarea)
    document.querySelectorAll('.input:not(textarea)').forEach((inp) => {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveMember();
        });
    });
});

async function loadMember(id) {
    try {
        const res = await fetch(`/api/members/by-id/${encodeURIComponent(id)}`);
        if (!res.ok) {
            showToast('Member not found', 'error');
            return;
        }
        const m = await res.json();
        if (m.error) { showToast(m.error, 'error'); return; }

        document.getElementById('member-id').value = m.ID;

        const nameParts = (m.Name || '').split(' ');
        document.getElementById('m-firstname').value = nameParts[0] || '';
        document.getElementById('m-lastname').value = nameParts.slice(1).join(' ').trim();
        document.getElementById('m-phone').value = m.Phone || '';
        document.getElementById('m-emergency').value =
            (m.Emergency_Phone && m.Emergency_Phone !== '0') ? m.Emergency_Phone : '';
        document.getElementById('m-dob').value = m.DOB ? m.DOB.split('T')[0] : '';
        document.getElementById('m-address').value = m.Address || '';
    } catch {
        showToast('Failed to load member details', 'error');
    }
}

async function saveMember() {
    const id = document.getElementById('member-id').value.trim();
    const firstName = document.getElementById('m-firstname').value.trim().toUpperCase();
    const lastName = document.getElementById('m-lastname').value.trim().toUpperCase();
    const phone = document.getElementById('m-phone').value.trim();
    const emergency = document.getElementById('m-emergency').value.trim();
    const dob = document.getElementById('m-dob').value;
    const address = document.getElementById('m-address').value.trim().toUpperCase();

    if (!firstName) { showToast('First name is required', 'error'); document.getElementById('m-firstname').focus(); return; }
    if (!phone) { showToast('Phone number is required', 'error'); document.getElementById('m-phone').focus(); return; }
    if (!/^\d{10}$/.test(phone)) {
        showToast('Phone must be exactly 10 digits', 'error');
        document.getElementById('m-phone').focus();
        return;
    }

    const btn = document.getElementById('member-save-btn');
    btn.disabled = true;

    try {
        const url = id ? `/api/members/${id}` : '/api/members';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, phone, emergencyPhone: emergency, dob, address }),
        });
        const data = await res.json();

        if (!res.ok) { showToast(data.error || 'Failed to save', 'error'); return; }

        showToast(id ? 'Member updated successfully!' : `${data.name} registered!`, 'success');
        setTimeout(() => { window.location.href = '/dashboard/members'; }, 900);
    } catch {
        showToast('Network error — please try again', 'error');
    } finally {
        btn.disabled = false;
    }
}

