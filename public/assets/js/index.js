/* ══════════════════════════════════════════
   User Check-in Page
   ══════════════════════════════════════════ */

const phoneInput = document.getElementById('phone-input');
const errorMsg = document.getElementById('error-msg');
const successCard = document.getElementById('success-card');

phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    hideError();
    successCard.style.display = 'none';
});

phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkIn();
});

function hideError() {
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
}

async function checkIn() {
    const phone = phoneInput.value.trim();
    hideError();
    successCard.style.display = 'none';

    if (!phone || phone.length < 10) {
        showError('Please enter a valid 10-digit phone number.');
        return;
    }

    const btn = document.getElementById('checkin-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Checking in…`;

    try {
        const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
        });

        const data = await res.json();

        if (!res.ok) {
            showError(data.error || 'Something went wrong.');
            return;
        }

        // Show success card
        document.getElementById('success-name').textContent = data.name;
        document.getElementById('success-meta').innerHTML = `
      <span>Checked in at <strong>${data.time}</strong></span>
      <span>Membership valid until <strong>${formatDate(data.expiresOn)}</strong></span>
    `;
        successCard.style.display = 'flex';
        phoneInput.value = '';

        showToast(`Welcome ${data.name}! Check-in successful.`, 'success');
    } catch {
        showError('Network error. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
      Check In`;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
