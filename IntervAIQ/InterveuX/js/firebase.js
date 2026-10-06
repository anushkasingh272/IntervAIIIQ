// ============================================
//   InterveuX - Firebase Configuration
// ============================================

// Import Firebase SDK compat files in your HTML directly. The global 'firebase' object will be available.

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBBdnMYC9PY17h3CXRMgMRyC7KEJpRjCPc",
  authDomain: "interveux-94d0b.firebaseapp.com",
  projectId: "interveux-94d0b",
  storageBucket: "interveux-94d0b.firebasestorage.app",
  messagingSenderId: "522188309801",
  appId: "1:522188309801:web:0f321bbe16c5ec7be76338",
  measurementId: "G-5DH6GSM1YR"
};

// Firebase is initialized below using the compatibility library syntax if loaded.

// Add these scripts to your HTML BEFORE firebase.js:
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>

let _app, _auth, _db;

try {
    if (typeof firebase !== 'undefined') {
        try { _app = firebase.initializeApp(firebaseConfig); }
        catch (e) { _app = firebase.app(); }
        _auth = firebase.auth();
        _db = firebase.firestore();
        _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
        console.log('✅ Firebase initialized');
    } else {
        console.warn('⚠️ Firebase not loaded — running in localStorage demo mode.');
    }
} catch (err) {
    console.error('Firebase init error:', err);
}

// ============================================
//   Firestore / localStorage Helpers
// ============================================
const FirebaseDB = {
    async saveInterview(userId, data) {
        if (!_db) return this._lsSave('interviews', data);
        const ref = await _db.collection('users').doc(userId).collection('interviews')
            .add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        return ref.id;
    },

    async getInterviews(userId) {
        if (!_db) return this._lsGet('interviews');
        const snap = await _db.collection('users').doc(userId).collection('interviews')
            .orderBy('createdAt', 'desc').limit(50).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async saveReport(userId, data) {
        if (!_db) return this._lsSave('reports', data);
        const ref = await _db.collection('users').doc(userId).collection('reports')
            .add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        return ref.id;
    },

    async getReport(userId, reportId) {
        if (!_db) return this._lsGet('reports').find(r => r.id === reportId) || null;
        const doc = await _db.collection('users').doc(userId).collection('reports').doc(reportId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    async getAllReports(userId) {
        if (!_db) return this._lsGet('reports');
        const snap = await _db.collection('users').doc(userId).collection('reports')
            .orderBy('createdAt', 'desc').limit(20).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async updateProfile(userId, data) {
        if (!_db) { localStorage.setItem('interveux_profile_' + userId, JSON.stringify(data)); return true; }
        await _db.collection('users').doc(userId).set(data, { merge: true });
        return true;
    },

    async getProfile(userId) {
        if (!_db) return JSON.parse(localStorage.getItem('interveux_profile_' + userId) || 'null');
        const doc = await _db.collection('users').doc(userId).get();
        return doc.exists ? doc.data() : null;
    },

    _lsSave(col, data) {
        const key = `interveux_${col}`;
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        arr.unshift({ id, ...data, createdAt: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(arr.slice(0, 50)));
        return id;
    },

    _lsGet(col) {
        return JSON.parse(localStorage.getItem(`interveux_${col}`) || '[]');
    }
};

window.FirebaseDB = FirebaseDB;
window.firebaseAuth = _auth;
window.firebaseDB = _db;