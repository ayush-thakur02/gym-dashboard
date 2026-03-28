(async () => {
    try {
        const res = await fetch('/api/auth/verify', { credentials: 'include' });
        if (res.ok) window.location.href = '/dashboard';
    } catch { }
})();

async function login(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error-msg');
    const btn = document.getElementById('login-btn');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Signing in…`;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data.error || 'Invalid credentials.';
            errorEl.style.display = 'block';
            return;
        }

        showToast('Login successful! Redirecting…', 'success');
        setTimeout(() => (window.location.href = '/dashboard'), 600);
    } catch {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>
      </svg>
      Sign In`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    if (form) {
        form.addEventListener('submit', login);
    }
});
