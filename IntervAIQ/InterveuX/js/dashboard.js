// ============================================
//   InterveuX - Dashboard Controller (Fixed)
// ============================================

const Dashboard = {
    user: null,
    profile: null,
    interviews: [],
    charts: {},

    async init() {
        this.user = await requireAuth('login.html');
        this._initTheme();
        this._initSidebar();
        this._initNavigation();
        this._loadUserData();
    },

    // ── Theme ─────────────────────────────────
    _initTheme() {
        const saved = localStorage.getItem('interveux_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        const toggle = document.getElementById('darkModeToggle');
        if (toggle) toggle.checked = saved === 'dark';

        document.getElementById('dashThemeToggle')?.addEventListener('click', () => {
            const theme = toggleTheme();
            if (toggle) toggle.checked = theme === 'dark';
            const icon = theme === 'dark' ? 'fa-sun' : 'fa-moon';
            document.querySelector('#dashThemeToggle i').className = `fas ${icon}`;
        });

        document.getElementById('darkModeToggle')?.addEventListener('change', (e) => {
            const theme = e.target.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('interveux_theme', theme);
        });
    },

    // ── Sidebar Navigation ────────────────────
    _initSidebar() {
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const toggle = document.getElementById('sidebarToggle');
            if (sidebar && !sidebar.contains(e.target) && !toggle?.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    },

    _initNavigation() {
        const links = document.querySelectorAll('.sidebar-link[data-section]');
        const sections = document.querySelectorAll('.dashboard-section');

        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.dataset.section;

                links.forEach(l => l.classList.remove('active'));
                sections.forEach(s => s.classList.remove('active'));

                link.classList.add('active');
                document.getElementById(`section-${target}`)?.classList.add('active');
                document.getElementById('sidebar').classList.remove('open');

                if (target === 'analytics') this._initAnalyticsCharts();
                if (target === 'interviews') this._renderInterviewsHistory();
                if (target === 'reports') this._renderReports();
            });
        });

        document.querySelectorAll('.view-all-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.dataset.section;
                document.querySelector(`.sidebar-link[data-section="${target}"]`)?.click();
            });
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => Auth.logout());

        document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                firstName: document.getElementById('profileFirstName')?.value,
                lastName: document.getElementById('profileLastName')?.value,
                targetRole: document.getElementById('profileRole')?.value,
                experience: document.getElementById('profileExperience')?.value,
                industry: document.getElementById('profileIndustry')?.value
            };
            await FirebaseDB.updateProfile(this.user.uid, data);
            localStorage.setItem('interveux_target_role', data.targetRole || '');
            showNotification('Profile updated!', 'success');
        });

        const resumeUpload = document.getElementById('resumeUpload');
        const resumeFile = document.getElementById('resumeFile');
        resumeUpload?.addEventListener('click', () => resumeFile?.click());
        resumeFile?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                resumeUpload.innerHTML = `<i class="fas fa-check-circle" style="color:var(--success)"></i><span>${file.name}</span>`;
                showNotification(`Resume "${file.name}" uploaded!`, 'success');
            }
        });

        document.getElementById('startInterviewBtn')?.addEventListener('click', () => {
            const role = document.getElementById('targetRole')?.value;
            if (role) localStorage.setItem('interveux_target_role', role);
            const type = document.getElementById('interviewType')?.value;
            if (type) localStorage.setItem('interveux_interview_type', type);
        });

        document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
            if (confirm('Are you absolutely sure? This will permanently delete your account and all data.')) {
                showNotification('Account deletion is not available in demo mode.', 'info');
            }
        });
    },

    // ── Load User Data ────────────────────────
    async _loadUserData() {
        const displayName = this.user.displayName || this.user.email?.split('@')[0] || 'User';
        const initial = displayName.charAt(0).toUpperCase();

        document.getElementById('welcomeName').textContent = displayName.split(' ')[0];
        document.getElementById('userName').textContent = displayName.split(' ')[0];
        document.getElementById('userAvatar').textContent = initial;
        document.getElementById('profileAvatar').textContent = initial;
        document.getElementById('profileName').textContent = displayName;
        document.getElementById('profileEmail').textContent = this.user.email || '';

        this.profile = await FirebaseDB.getProfile(this.user.uid);
        if (this.profile) {
            if (document.getElementById('profileFirstName')) document.getElementById('profileFirstName').value = this.profile.firstName || '';
            if (document.getElementById('profileLastName')) document.getElementById('profileLastName').value = this.profile.lastName || '';
            if (document.getElementById('profileRole')) document.getElementById('profileRole').value = this.profile.targetRole || '';
            if (document.getElementById('profileExperience')) document.getElementById('profileExperience').value = this.profile.experience || 'entry';
            if (document.getElementById('profileIndustry')) document.getElementById('profileIndustry').value = this.profile.industry || 'tech';
        }

        this.interviews = await FirebaseDB.getInterviews(this.user.uid);
        this._updateStats();
        this._renderRecentInterviews();
        this._initOverviewCharts();
    },

    // ── Helpers ───────────────────────────────

    /**
     * Safely parse a Firestore timestamp, JS Date, ISO string, or epoch number
     * into a JS Date object. Returns null if unparseable.
     */
    _toDate(val) {
        if (!val) return null;
        // Firestore Timestamp object
        if (typeof val === 'object' && typeof val.seconds === 'number') {
            return new Date(val.seconds * 1000);
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    },

    /**
     * Destroy a Chart.js instance if it exists, then remove from cache.
     */
    _destroyChart(key) {
        if (this.charts[key]) {
            this.charts[key].destroy();
            delete this.charts[key];
        }
    },

    // ── Stats ─────────────────────────────────
    _updateStats() {
        const total = this.interviews.length;

        // Average score
        const avgScore = total > 0
            ? Math.round(this.interviews.reduce((s, i) => s + (i.score || 0), 0) / total)
            : 0;

        // Total practice time in hours
        const totalSeconds = this.interviews.reduce((s, i) => s + (i.duration || 0), 0);
        const hours = Math.round((totalSeconds / 3600) * 10) / 10;

        // Confidence: average of confidence scores stored per interview,
        // or fall back to (avgScore + 5) capped at 99
        const confidenceArr = this.interviews.filter(i => i.confidenceScore != null);
        const confidence = confidenceArr.length > 0
            ? Math.round(confidenceArr.reduce((s, i) => s + i.confidenceScore, 0) / confidenceArr.length)
            : (avgScore > 0 ? Math.min(99, avgScore + 5) : 0);

        // Week-over-week trend for score
        const now = new Date();
        const oneWeekAgo = new Date(now - 7 * 86400000);
        const twoWeeksAgo = new Date(now - 14 * 86400000);

        const thisWeek = this.interviews.filter(i => {
            const d = this._toDate(i.createdAt);
            return d && d >= oneWeekAgo;
        });
        const lastWeek = this.interviews.filter(i => {
            const d = this._toDate(i.createdAt);
            return d && d >= twoWeeksAgo && d < oneWeekAgo;
        });

        const thisWeekAvg = thisWeek.length > 0
            ? Math.round(thisWeek.reduce((s, i) => s + (i.score || 0), 0) / thisWeek.length)
            : null;
        const lastWeekAvg = lastWeek.length > 0
            ? Math.round(lastWeek.reduce((s, i) => s + (i.score || 0), 0) / lastWeek.length)
            : null;

        let trendPct = null;
        if (thisWeekAvg !== null && lastWeekAvg !== null && lastWeekAvg > 0) {
            trendPct = Math.round(((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100);
        }

        // Animate counters
        animateCounter(document.getElementById('totalInterviews'), total);
        animateCounter(document.getElementById('avgScore'), avgScore);
        animateCounter(document.getElementById('confidenceScore'), confidence, '%');
        animateCounter(document.getElementById('totalTime'), hours, 'h');

        // Update trend badges with real data
        this._updateTrend('.stat-card:nth-child(1) .stat-trend', this.interviews.length, 0);
        this._updateTrend('.stat-card:nth-child(2) .stat-trend', trendPct, null);
    },

    _updateTrend(selector, value, fallback) {
        const el = document.querySelector(selector);
        if (!el) return;
        const v = value !== null && value !== undefined ? value : fallback;
        if (v === null || v === undefined) {
            el.style.display = 'none';
            return;
        }
        el.style.display = '';
        const isUp = v >= 0;
        el.className = `stat-trend ${isUp ? 'up' : 'down'}`;
        el.innerHTML = `<i class="fas fa-arrow-${isUp ? 'up' : 'down'}"></i> ${Math.abs(v)}%`;
    },

    // ── Recent Interviews List ────────────────
    _renderRecentInterviews() {
        const container = document.getElementById('recentInterviewsList');
        if (!container) return;

        if (this.interviews.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-video-slash"></i>
                <h4>No interviews yet</h4>
                <p>Start your first AI-powered interview to see results here.</p>
                <a href="interview.html" class="btn-primary btn-sm">Start Interview</a>
            </div>`;
            return;
        }

        // Sort newest first
        const sorted = [...this.interviews].sort((a, b) => {
            const da = this._toDate(a.createdAt) || new Date(0);
            const db = this._toDate(b.createdAt) || new Date(0);
            return db - da;
        });

        container.innerHTML = sorted.slice(0, 5).map(item => `
            <div class="interview-item">
                <div class="interview-item-left">
                    <div class="interview-type-icon ${item.type || 'hr'}">
                        <i class="fas ${this._typeIcon(item.type)}"></i>
                    </div>
                    <div class="interview-item-info">
                        <h4>${capitalize(item.type || 'hr')} Interview</h4>
                        <p>${formatDate(item.createdAt)} • ${item.difficulty || 'medium'} • ${item.questionsAnswered || 0} questions</p>
                    </div>
                </div>
                <div class="interview-item-right">
                    <span class="interview-score" style="color:${getScoreColor(item.score || 0)}">${item.score || 0}</span>
                    ${item.reportId ? `<a href="report.html?id=${item.reportId}" class="btn-outline btn-sm">View Report</a>` : ''}
                </div>
            </div>
        `).join('');
    },

    _renderInterviewsHistory() {
        const container = document.getElementById('interviewsHistory');
        if (!container) return;

        if (this.interviews.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><h4>No interview history yet</h4></div>';
            return;
        }

        const sorted = [...this.interviews].sort((a, b) => {
            const da = this._toDate(a.createdAt) || new Date(0);
            const db = this._toDate(b.createdAt) || new Date(0);
            return db - da;
        });

        container.innerHTML = sorted.map(item => `
            <div class="interview-item glass-card" style="margin-bottom:0.75rem;padding:1.25rem;">
                <div class="interview-item-left">
                    <div class="interview-type-icon ${item.type || 'hr'}">
                        <i class="fas ${this._typeIcon(item.type)}"></i>
                    </div>
                    <div class="interview-item-info">
                        <h4>${capitalize(item.type || 'hr')} Interview</h4>
                        <p>${formatDate(item.createdAt)} • ${capitalize(item.difficulty || 'Medium')} • ${Math.round((item.duration || 0) / 60)} min</p>
                    </div>
                </div>
                <div class="interview-item-right">
                    <span class="interview-score" style="color:${getScoreColor(item.score || 0)}">${item.score || 0}/100</span>
                    ${item.reportId
                        ? `<a href="report.html?id=${item.reportId}" class="btn-primary btn-sm">View Report</a>`
                        : '<span class="btn-ghost btn-sm">No report</span>'}
                </div>
            </div>
        `).join('');
    },

    async _renderReports() {
        const container = document.getElementById('reportsList');
        if (!container) return;

        const reports = await FirebaseDB.getAllReports(this.user.uid);
        if (!reports || reports.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-file-lines"></i>
                <h4>No reports yet</h4>
                <p>Complete an interview to generate your first AI report.</p>
            </div>`;
            return;
        }

        container.innerHTML = reports.map(r => `
            <div class="interview-item glass-card" style="margin-bottom:0.75rem;padding:1.25rem;">
                <div class="interview-item-left">
                    <div class="interview-type-icon ${r.type || 'hr'}">
                        <i class="fas fa-file-chart-column"></i>
                    </div>
                    <div class="interview-item-info">
                        <h4>${capitalize(r.type || 'hr')} Interview Report</h4>
                        <p>${formatDate(r.createdAt)} • Overall Score: ${r.scores?.overall || 0}/100</p>
                    </div>
                </div>
                <div class="interview-item-right">
                    <a href="report.html?id=${r.id}" class="btn-primary btn-sm">View Report</a>
                </div>
            </div>
        `).join('');
    },

    _typeIcon(type) {
        const icons = { hr: 'fa-users', technical: 'fa-code', aptitude: 'fa-brain', mixed: 'fa-layer-group' };
        return icons[type] || 'fa-video';
    },

    // ── Overview Charts ───────────────────────
    _initOverviewCharts() {
        this._destroyChart('performance');
        this._destroyChart('skills');
        this._renderPerformanceChart();
        this._renderSkillsChart();
    },

    _renderPerformanceChart() {
        const canvas = document.getElementById('performanceChart');
        if (!canvas) return;

        // Build last-7-days labels and map real interview scores to each day
        const labels = [];
        const data = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));

            // Find all interviews on this day and average their scores
            const dayInterviews = this.interviews.filter(iv => {
                const ivDate = this._toDate(iv.createdAt);
                return ivDate && ivDate.toDateString() === d.toDateString();
            });

            if (dayInterviews.length > 0) {
                const avg = Math.round(
                    dayInterviews.reduce((s, iv) => s + (iv.score || 0), 0) / dayInterviews.length
                );
                data.push(avg);
            } else {
                data.push(null); // Use null so Chart.js skips the point (spanGaps: false)
            }
        }

        this.charts.performance = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Score',
                    data,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.08)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#6366f1',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    spanGaps: false // Don't interpolate across missing days
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.raw !== null ? `Score: ${ctx.raw}` : 'No interview'
                        }
                    }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        grid: { color: 'rgba(148,163,184,0.1)' },
                        ticks: { color: '#94a3b8' }
                    },
                    x: {
                        grid: { color: 'rgba(148,163,184,0.1)' },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    },

    _renderSkillsChart() {
        const canvas = document.getElementById('skillsChart');
        if (!canvas) return;

        // Aggregate real skill scores from interviews.
        // Each interview can have a `skills` object like:
        // { technical: 80, communication: 70, confidence: 75, bodyLanguage: 65, clarity: 72, depth: 68 }
        const skillKeys = ['technical', 'communication', 'confidence', 'bodyLanguage', 'clarity', 'depth'];
        const skillLabels = ['Technical', 'Communication', 'Confidence', 'Body Language', 'Clarity', 'Depth'];

        const skillTotals = Object.fromEntries(skillKeys.map(k => [k, { sum: 0, count: 0 }]));

        this.interviews.forEach(iv => {
            const s = iv.skills || {};
            skillKeys.forEach(k => {
                // Also try camelCase fallbacks stored differently
                const val = s[k] ?? iv[k] ?? null;
                if (val !== null && typeof val === 'number') {
                    skillTotals[k].sum += val;
                    skillTotals[k].count += 1;
                }
            });
        });

        // If no real data at all, show zeros instead of fake data
        const skillData = skillKeys.map(k =>
            skillTotals[k].count > 0
                ? Math.round(skillTotals[k].sum / skillTotals[k].count)
                : 0
        );

        this.charts.skills = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: skillLabels,
                datasets: [{
                    label: 'Your Scores',
                    data: skillData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.15)',
                    pointBackgroundColor: '#6366f1'
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: { display: false },
                        grid: { color: 'rgba(148,163,184,0.15)' },
                        pointLabels: { color: '#94a3b8', font: { size: 11 } }
                    }
                }
            }
        });
    },

    // ── Analytics Charts ──────────────────────
    _initAnalyticsCharts() {
        // Always destroy and re-render so fresh data is shown
        this._destroyChart('scoreHistory');
        this._destroyChart('emotion');
        this._destroyChart('communication');

        const sorted = [...this.interviews].sort((a, b) => {
            const da = this._toDate(a.createdAt) || new Date(0);
            const db = this._toDate(b.createdAt) || new Date(0);
            return da - db; // oldest → newest for a timeline
        });

        // ── Score History Bar Chart ───────────
        const scoreHistCanvas = document.getElementById('scoreHistoryChart');
        if (scoreHistCanvas) {
            const sessionData = sorted.slice(-10); // last 10 sessions
            this.charts.scoreHistory = new Chart(scoreHistCanvas, {
                type: 'bar',
                data: {
                    labels: sessionData.map((iv, i) => {
                        const d = this._toDate(iv.createdAt);
                        return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Session ${i + 1}`;
                    }),
                    datasets: [{
                        label: 'Overall Score',
                        data: sessionData.map(i => i.score || 0),
                        backgroundColor: sessionData.map(i => {
                            const s = i.score || 0;
                            return s >= 75 ? 'rgba(16,185,129,0.7)' : s >= 50 ? 'rgba(99,102,241,0.7)' : 'rgba(239,68,68,0.7)';
                        }),
                        borderColor: sessionData.map(i => {
                            const s = i.score || 0;
                            return s >= 75 ? '#10b981' : s >= 50 ? '#6366f1' : '#ef4444';
                        }),
                        borderWidth: 2,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => `Score: ${ctx.raw}/100` } }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(148,163,184,0.1)' }
                        },
                        x: {
                            ticks: { color: '#94a3b8' },
                            grid: { display: false }
                        }
                    }
                }
            });
        }

        // ── Emotion Analysis Doughnut ─────────
        const emotionCanvas = document.getElementById('emotionChart');
        if (emotionCanvas) {
            // Aggregate emotion data from interviews
            // Each interview can have an `emotions` object like:
            // { confident: 45, neutral: 30, nervous: 15, engaged: 10 }
            const emotionKeys = ['confident', 'neutral', 'nervous', 'engaged'];
            const emotionTotals = Object.fromEntries(emotionKeys.map(k => [k, 0]));
            let emotionCount = 0;

            this.interviews.forEach(iv => {
                const e = iv.emotions || iv.emotionScores || null;
                if (e && typeof e === 'object') {
                    emotionKeys.forEach(k => {
                        emotionTotals[k] += (e[k] || 0);
                    });
                    emotionCount++;
                }
            });

            // If real emotion data exists, average it; otherwise show zeros
            const emotionData = emotionCount > 0
                ? emotionKeys.map(k => Math.round(emotionTotals[k] / emotionCount))
                : [0, 0, 0, 0];

            const hasEmotionData = emotionData.some(v => v > 0);

            this.charts.emotion = new Chart(emotionCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Confident', 'Neutral', 'Nervous', 'Engaged'],
                    datasets: [{
                        data: hasEmotionData ? emotionData : [1, 1, 1, 1], // equal slices if no data
                        backgroundColor: ['#10b981', '#6366f1', '#f59e0b', '#3b82f6'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#94a3b8' }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => hasEmotionData
                                    ? `${ctx.label}: ${ctx.raw}%`
                                    : `${ctx.label}: No data yet`
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }

        // ── Communication Stats Bar Chart ─────
        const commCanvas = document.getElementById('communicationChart');
        if (commCanvas) {
            // Aggregate communication scores from interviews
            // Each interview can have a `communication` object like:
            // { speakingSpeed: 72, clarity: 68, fluency: 75, hesitation: 60, confidence: 80 }
            const commKeys = ['speakingSpeed', 'clarity', 'fluency', 'hesitation', 'confidence'];
            const commLabels = ['Speaking Speed', 'Clarity', 'Fluency', 'Hesitation', 'Confidence'];
            const commTotals = Object.fromEntries(commKeys.map(k => [k, { sum: 0, count: 0 }]));

            this.interviews.forEach(iv => {
                const c = iv.communication || iv.communicationScores || {};
                commKeys.forEach(k => {
                    const val = c[k] ?? null;
                    if (val !== null && typeof val === 'number') {
                        commTotals[k].sum += val;
                        commTotals[k].count += 1;
                    }
                });
            });

            const commData = commKeys.map(k =>
                commTotals[k].count > 0
                    ? Math.round(commTotals[k].sum / commTotals[k].count)
                    : 0
            );

            this.charts.communication = new Chart(commCanvas, {
                type: 'bar',
                data: {
                    labels: commLabels,
                    datasets: [{
                        label: 'Score',
                        data: commData,
                        backgroundColor: [
                            'rgba(99,102,241,0.7)',
                            'rgba(139,92,246,0.7)',
                            'rgba(59,130,246,0.7)',
                            'rgba(245,158,11,0.7)',
                            'rgba(16,185,129,0.7)'
                        ],
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => `Score: ${ctx.raw}/100` } }
                    },
                    scales: {
                        x: {
                            min: 0,
                            max: 100,
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(148,163,184,0.1)' }
                        },
                        y: {
                            ticks: { color: '#94a3b8' },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }
};

// Boot
document.addEventListener('DOMContentLoaded', () => Dashboard.init());