// ============================================
//   InterveuX - Utility Functions
// ============================================

// ── Notification Toast ──────────────────────
function showNotification(message, type = 'info', duration = 3500) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    document.body.appendChild(n);

    setTimeout(() => {
        n.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => n.remove(), 280);
    }, duration);
}

// ── Password Toggle ──────────────────────────
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.querySelector('i').className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
}

// ── Password Strength ────────────────────────
function checkPasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const levels = [
        { label: 'Weak', cls: 'weak' },
        { label: 'Fair', cls: 'fair' },
        { label: 'Good', cls: 'good' },
        { label: 'Strong', cls: 'strong' }
    ];
    return levels[Math.min(Math.floor(score / 1.5), 3)];
}

// ── Format Time ─────────────────────────────
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Format Date — FIXED ──────────────────────
// Safely handles: Firestore Timestamp, JS Date, ISO string, epoch number, null
function formatDate(date) {
    if (!date) return '--';
    try {
        let d;
        // Firestore Timestamp object
        if (date && typeof date === 'object' && typeof date.toDate === 'function') {
            d = date.toDate();
        }
        // Firestore Timestamp-like plain object { seconds, nanoseconds }
        else if (date && typeof date === 'object' && typeof date.seconds === 'number') {
            d = new Date(date.seconds * 1000);
        }
        // Already a Date object
        else if (date instanceof Date) {
            d = date;
        }
        // ISO string or epoch number
        else {
            d = new Date(date);
        }

        if (isNaN(d.getTime())) return '--';
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return '--';
    }
}

// ── Loading Button ───────────────────────────
function setButtonLoading(btn, loading, text = null) {
    if (!btn) return;
    if (loading) {
        btn._originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${text || 'Loading...'}</span>`;
        btn.classList.add('loading');
    } else {
        btn.disabled = false;
        btn.innerHTML = btn._originalHTML || btn.innerHTML;
        btn.classList.remove('loading');
    }
}

// ── Smooth Counter Animation ─────────────────
function animateCounter(el, target, suffix = '', duration = 1500) {
    if (!el) return;
    // Handle decimal targets (e.g. hours like 1.5h)
    const isDecimal = target % 1 !== 0;
    const start = performance.now();
    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = 0 + (target - 0) * eased;
        el.textContent = (isDecimal ? (Math.round(val * 10) / 10) : Math.floor(val)).toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ── Intersection Observer Helper ─────────────
function onVisible(selector, callback, options = {}) {
    const elements = typeof selector === 'string' ? document.querySelectorAll(selector) : [selector];
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                callback(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, ...options });
    elements.forEach(el => observer.observe(el));
}

// ── Generate Random ID ───────────────────────
function generateId(prefix = 'ix') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Deep Clone ───────────────────────────────
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// ── Debounce ─────────────────────────────────
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ── Get Current User ─────────────────────────
function getCurrentUser() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        return firebase.auth().currentUser;
    }
    const demo = localStorage.getItem('interveux_demo_user');
    return demo ? JSON.parse(demo) : null;
}

// ── Require Auth ─────────────────────────────
function requireAuth(redirectTo = 'login.html') {
    return new Promise(resolve => {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(user => {
                if (!user) window.location.href = redirectTo;
                else resolve(user);
            });
        } else {
            const demo = localStorage.getItem('interveux_demo_user');
            if (!demo) window.location.href = redirectTo;
            else resolve(JSON.parse(demo));
        }
    });
}

// ── Theme ────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('interveux_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    return saved;
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('interveux_theme', next);
    return next;
}

// ── Score Color ──────────────────────────────
function getScoreColor(score) {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#6366f1';
    return '#ef4444';
}

// ── Capitalize ───────────────────────────────
function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ── Export globals ───────────────────────────
window.showNotification = showNotification;
window.togglePassword = togglePassword;
window.checkPasswordStrength = checkPasswordStrength;
window.formatTime = formatTime;
window.formatDate = formatDate;
window.setButtonLoading = setButtonLoading;
window.animateCounter = animateCounter;
window.onVisible = onVisible;
window.generateId = generateId;
window.deepClone = deepClone;
window.debounce = debounce;
window.getCurrentUser = getCurrentUser;
window.requireAuth = requireAuth;
window.initTheme = initTheme;
window.toggleTheme = toggleTheme;
window.getScoreColor = getScoreColor;
window.capitalize = capitalize;

// Auto-init theme
initTheme();