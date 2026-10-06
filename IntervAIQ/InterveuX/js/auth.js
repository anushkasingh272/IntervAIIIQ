// ============================================
//   InterveuX - Authentication
// ============================================

const Auth = {
    // ── Sign Up ────────────────────────────
    async signUp(email, password, firstName, lastName) {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            return this._demoSignUp(email, firstName, lastName);
        }
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: `${firstName} ${lastName}` });
        await FirebaseDB.updateProfile(cred.user.uid, {
            firstName, lastName, email,
            displayName: `${firstName} ${lastName}`,
            createdAt: new Date().toISOString(),
            totalInterviews: 0,
            avgScore: 0
        });
        return cred.user;
    },

    // ── Login ──────────────────────────────
    async login(email, password) {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            return this._demoLogin(email);
        }
        const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
        return cred.user;
    },

    // ── Google Sign In ─────────────────────
    async googleSignIn() {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            return this._demoLogin('demo@google.com', 'Google User');
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        const cred = await firebase.auth().signInWithPopup(provider);
        // First time Google user — create profile
        const profile = await FirebaseDB.getProfile(cred.user.uid);
        if (!profile) {
            const [firstName, ...rest] = (cred.user.displayName || 'User').split(' ');
            await FirebaseDB.updateProfile(cred.user.uid, {
                firstName, lastName: rest.join(' '),
                email: cred.user.email,
                displayName: cred.user.displayName,
                createdAt: new Date().toISOString(),
                totalInterviews: 0,
                avgScore: 0
            });
        }
        return cred.user;
    },

    // ── Forgot Password ────────────────────
    async sendPasswordReset(email) {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            return true; // Demo mode
        }
        await firebase.auth().sendPasswordResetEmail(email);
        return true;
    },

    // ── Logout ─────────────────────────────
    async logout() {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            await firebase.auth().signOut();
        }
        localStorage.removeItem('interveux_demo_user');
        window.location.href = 'index.html';
    },

    // ── Auth State Listener ────────────────
    onAuthChange(callback) {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(callback);
        } else {
            const demo = localStorage.getItem('interveux_demo_user');
            callback(demo ? JSON.parse(demo) : null);
        }
    },

    // ── Demo Mode Fallbacks ────────────────
    _demoSignUp(email, firstName, lastName) {
        const user = {
            uid: 'demo_' + Date.now(),
            email,
            displayName: `${firstName} ${lastName}`,
            emailVerified: true
        };
        localStorage.setItem('interveux_demo_user', JSON.stringify(user));
        return user;
    },

    _demoLogin(email, name = null) {
        const existing = localStorage.getItem('interveux_demo_user');
        if (existing) return JSON.parse(existing);
        const user = {
            uid: 'demo_user_001',
            email,
            displayName: name || email.split('@')[0],
            emailVerified: true
        };
        localStorage.setItem('interveux_demo_user', JSON.stringify(user));
        return user;
    }
};

window.Auth = Auth;

// ============================================
//   Page-specific Auth Logic
// ============================================

// ── LOGIN PAGE ─────────────────────────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    // Check if already logged in
    Auth.onAuthChange(user => {
        if (user) window.location.href = 'dashboard.html';
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const btn = document.getElementById('loginSubmit');

        setButtonLoading(btn, true, 'Signing in...');
        try {
            await Auth.login(email, password);
            showNotification('Welcome back! Redirecting...', 'success');
            setTimeout(() => window.location.href = 'dashboard.html', 800);
        } catch (err) {
            const msgs = {
                'auth/user-not-found': 'No account found with this email.',
                'auth/wrong-password': 'Incorrect password. Try again.',
                'auth/invalid-email': 'Please enter a valid email address.',
                'auth/too-many-requests': 'Too many attempts. Try again later.',
                'auth/network-request-failed': 'Network error. Check your connection.'
            };
            showNotification(msgs[err.code] || err.message || 'Login failed.', 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    });

    // Google Login
    document.getElementById('googleLogin')?.addEventListener('click', async () => {
        try {
            await Auth.googleSignIn();
            window.location.href = 'dashboard.html';
        } catch (err) {
        console.error("FULL ERROR:", err);
        console.error("ERROR CODE:", err.code);
        console.error("ERROR MESSAGE:", err.message);

        alert(err.code + "\n" + err.message);

        showNotification(err.message, 'error');
}
    });

    // Forgot Password toggle
    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').closest('.auth-card').style.display = 'none';
        document.getElementById('forgotPasswordCard').style.display = 'block';
    });

    document.getElementById('backToLogin')?.addEventListener('click', () => {
        document.getElementById('forgotPasswordCard').style.display = 'none';
        document.getElementById('loginForm').closest('.auth-card').style.display = 'block';
    });

    document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value.trim();
        try {
            await Auth.sendPasswordReset(email);
            showNotification('Password reset email sent! Check your inbox.', 'success');
        } catch (err) {
            showNotification('Could not send reset email. Check the address.', 'error');
        }
    });
}

// ── SIGNUP PAGE ────────────────────────────
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    Auth.onAuthChange(user => {
        if (user) window.location.href = 'dashboard.html';
    });

    // Password strength meter
    const pwInput = document.getElementById('signupPassword');
    if (pwInput) {
        pwInput.addEventListener('input', () => {
            const strength = checkPasswordStrength(pwInput.value);
            const fill = document.querySelector('.strength-fill');
            const text = document.querySelector('.strength-text');
            if (fill) { fill.className = `strength-fill ${strength.cls}`; }
            if (text) { text.className = `strength-text ${strength.cls}`; text.textContent = strength.label; }
        });
    }

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        const confirm = document.getElementById('confirmPassword').value;
        const agreed = document.getElementById('agreeTerms').checked;
        const btn = document.getElementById('signupSubmit');

        if (!agreed) { showNotification('Please agree to the Terms of Service.', 'warning'); return; }
        if (password !== confirm) { showNotification('Passwords do not match.', 'error'); return; }
        if (password.length < 8) { showNotification('Password must be at least 8 characters.', 'warning'); return; }

        setButtonLoading(btn, true, 'Creating account...');
        try {
            await Auth.signUp(email, password, firstName, lastName);
            showNotification('Account created! Welcome to InterveuX 🎉', 'success');
            setTimeout(() => window.location.href = 'dashboard.html', 1000);
        } catch (err) {
            const msgs = {
                'auth/email-already-in-use': 'An account with this email already exists.',
                'auth/invalid-email': 'Please enter a valid email address.',
                'auth/weak-password': 'Password is too weak. Add numbers and symbols.',
                'auth/network-request-failed': 'Network error. Check your connection.'
            };
            showNotification(msgs[err.code] || err.message || 'Sign up failed.', 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    });

    // Google Signup
    document.getElementById('googleSignup')?.addEventListener('click', async () => {
        try {
            await Auth.googleSignIn();
            window.location.href = 'dashboard.html';
        } catch (err) {
            showNotification('Google sign-up failed. Try again.', 'error');
        }
    });
}

// ── LOGOUT BUTTON (dashboard) ──────────────
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    Auth.logout();
});
