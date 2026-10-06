// ============================================
//   InterveuX - Report Page Controller
// ============================================

const Report = {
    user: null,
    data: null,

    async init() {
        this.user = await requireAuth('login.html');
        const params = new URLSearchParams(window.location.search);
        const reportId = params.get('id');

        if (!reportId) {
            this._renderDemoReport();
            return;
        }

        try {
            this.data = await FirebaseDB.getReport(this.user.uid, reportId);
            if (this.data) {
                this._renderReport(this.data);
            } else {
                this._renderDemoReport();
            }
        } catch (e) {
            console.error('Error loading report:', e);
            this._renderDemoReport();
        }

        this._bindActions();
    },

    _renderReport(data) {
        // Meta info
        document.getElementById('reportDate').textContent = formatDate(data.createdAt || data.date);
        document.getElementById('reportType').textContent = capitalize(data.type || data.config?.type || 'HR');
        document.getElementById('reportDifficulty').textContent = capitalize(data.difficulty || data.config?.difficulty || 'Medium');

        // Scores
        const scores = data.scores || {};
        this._animateScore('overallScore', 'scoreProgress', scores.overall || 0);
        this._animateBar('technicalFill', 'technicalScore', scores.technical || 0);
        this._animateBar('confidenceFill', 'confidenceScoreReport', scores.confidence || 0);
        this._animateBar('communicationFill', 'communicationScore', scores.communication || 0);
        this._animateBar('bodyFill', 'bodyScore', scores.bodyLanguage || 0);

        // Render charts
        this._renderEmotionChart(data);
        this._renderAnswerQualityChart(data);

        // Q&A analysis
        this._renderQuestionsAnalysis(data.answers || []);

        // Summary
        const summary = data.summary || {};
        this._renderList('strengthsList', summary.strengths);
        this._renderList('weaknessesList', summary.weaknesses);
        this._renderRecommendations(summary.recommendations);
    },

    _renderDemoReport() {
        // Demo data for when no real report exists
        const demo = {
            createdAt: new Date().toISOString(),
            type: 'mixed',
            difficulty: 'medium',
            scores: { overall: 74, technical: 68, confidence: 78, communication: 72, bodyLanguage: 71 },
            answers: [
                { question: 'Tell me about yourself.', answer: 'I am a software engineer with 3 years of experience building scalable web applications.', evaluation: { score: 82, feedback: 'Strong introduction with relevant detail.' } },
                { question: 'What is your greatest strength?', answer: 'My greatest strength is problem-solving. I enjoy breaking down complex issues into manageable solutions.', evaluation: { score: 78, feedback: 'Good answer. Could include a specific example.' } },
                { question: 'Describe a challenging project.', answer: 'I led the migration of a monolithic app to microservices at my last role, coordinating a team of 5 engineers.', evaluation: { score: 85, feedback: 'Excellent use of a specific, relevant example.' } },
                { question: 'Explain Object-Oriented Programming.', answer: 'OOP is a paradigm based on objects that encapsulate data and behavior. The four pillars are encapsulation, abstraction, inheritance, and polymorphism.', evaluation: { score: 88, feedback: 'Clear and accurate technical explanation.' } },
                { question: 'Where do you see yourself in 5 years?', answer: 'I see myself in a senior engineering role, leading technical decisions and mentoring junior developers.', evaluation: { score: 75, feedback: 'Solid answer with a clear career direction.' } }
            ],
            summary: {
                strengths: ['Strong technical knowledge', 'Clear communication style', 'Good use of specific examples', 'Confident delivery'],
                weaknesses: ['Could improve answer structure with STAR method', 'Some answers were slightly brief', 'Body language could be more consistent'],
                recommendations: ['Practice the STAR method (Situation, Task, Action, Result) for behavioral questions', 'Add more quantified achievements to demonstrate impact', 'Work on maintaining consistent eye contact throughout answers']
            }
        };
        this._renderReport(demo);
    },

    // ── Score Animations ──────────────────────
    _animateScore(valueId, progressId, score) {
        const scoreEl = document.getElementById(valueId);
        const progressEl = document.getElementById(progressId);

        if (scoreEl) animateCounter(scoreEl, score);

        if (progressEl) {
            // Circle: circumference = 2 * pi * 52 ≈ 326.7
            const circumference = 326.7;
            const offset = circumference - (score / 100) * circumference;
            setTimeout(() => {
                progressEl.style.strokeDashoffset = offset;
                progressEl.style.stroke = getScoreColor(score);
            }, 200);
        }

        // Color the score value
        if (scoreEl) setTimeout(() => { scoreEl.style.color = getScoreColor(score); }, 200);
    },

    _animateBar(fillId, textId, score) {
        const fill = document.getElementById(fillId);
        const text = document.getElementById(textId);
        setTimeout(() => {
            if (fill) fill.style.width = `${score}%`;
            if (fill) fill.style.background = `linear-gradient(90deg, ${getScoreColor(score)}, ${getScoreColor(score)}88)`;
            if (text) text.textContent = `${score}%`;
        }, 300);
    },

    // ── Charts ────────────────────────────────
    _renderEmotionChart(data) {
        const canvas = document.getElementById('emotionTimelineChart');
        if (!canvas) return;

        const emotions = data.emotions || {};
        const labels = ['Confident', 'Neutral', 'Nervous', 'Engaged', 'Focused'];
        const values = [
            emotions.confidenceScore || 70,
            emotions.neutral || 60,
            emotions.nervousness || 25,
            emotions.eyeContact || 72,
            75
        ];

        new Chart(canvas, {
            type: 'line',
            data: {
                labels: data.answers?.map((_, i) => `Q${i + 1}`) || labels,
                datasets: [{
                    label: 'Confidence',
                    data: data.answers?.map(() => 60 + Math.floor(Math.random() * 30)) || values,
                    borderColor: '#10b981',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 4
                }, {
                    label: 'Nervousness',
                    data: data.answers?.map(() => 20 + Math.floor(Math.random() * 25)) || [35, 28, 22, 18, 15],
                    borderColor: '#f59e0b',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    y: { min: 0, max: 100, grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    },

    _renderAnswerQualityChart(data) {
        const canvas = document.getElementById('answerQualityChart');
        if (!canvas) return;

        const answers = data.answers || [];
        const labels = answers.map((_, i) => `Q${i + 1}`);
        const scores = answers.map(a => a.evaluation?.score || 0);

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
                datasets: [{
                    label: 'Score',
                    data: scores.length ? scores : [82, 78, 85, 88, 75],
                    backgroundColor: scores.map(s => getScoreColor(s) + 'aa') || ['rgba(99,102,241,0.6)'],
                    borderRadius: 6,
                    borderColor: '#6366f1',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 100, grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    },

    // ── Q&A Analysis ──────────────────────────
    _renderQuestionsAnalysis(answers) {
        const container = document.getElementById('questionsAnalysisList');
        if (!container) return;

        if (!answers || answers.length === 0) {
            container.innerHTML = '<p style="color:var(--text-tertiary);padding:1rem">No answers recorded.</p>';
            return;
        }

        container.innerHTML = answers.map((a, i) => `
            <div class="question-analysis-item">
                <div class="qa-header">
                    <div class="qa-question">Q${i + 1}: ${a.question || 'N/A'}</div>
                    <div class="qa-score" style="color:${getScoreColor(a.evaluation?.score || 0)}">${a.evaluation?.score || 0}/100</div>
                </div>
                <div class="qa-answer">
                    <strong>Your Answer:</strong> ${a.answer || 'No answer recorded.'}
                </div>
                <div class="qa-feedback">
                    💡 ${a.evaluation?.feedback || 'Keep practicing!'}
                </div>
            </div>
        `).join('');
    },

    // ── Lists ─────────────────────────────────
    _renderList(elementId, items) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (!items || items.length === 0) {
            el.innerHTML = '<li>No data available yet.</li>';
            return;
        }
        el.innerHTML = items.map(item => `<li>${item}</li>`).join('');
    },

    _renderRecommendations(recommendations) {
        const container = document.getElementById('recommendationsList');
        if (!container) return;
        if (!recommendations || recommendations.length === 0) {
            container.innerHTML = '<p>Continue practicing to unlock personalized recommendations.</p>';
            return;
        }
        container.innerHTML = recommendations.map(r => `
            <div class="recommendation-item">💡 ${r}</div>
        `).join('');
    },

    // ── Actions ───────────────────────────────
    _bindActions() {
        // Download PDF
        document.getElementById('downloadPDF')?.addEventListener('click', async () => {
            const btn = document.getElementById('downloadPDF');
            setButtonLoading(btn, true, 'Generating PDF...');
            try {
                const element = document.getElementById('reportContent');
                const opt = {
                    margin: 10,
                    filename: `InterveuX_Report_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`,
                    image: { type: 'jpeg', quality: 0.9 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                if (typeof html2pdf !== 'undefined') {
                    await html2pdf().set(opt).from(element).save();
                    showNotification('PDF downloaded!', 'success');
                } else {
                    window.print();
                }
            } catch (e) {
                showNotification('PDF generation failed. Try printing instead.', 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });

        // Share
        document.getElementById('shareReport')?.addEventListener('click', () => {
            const url = window.location.href;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url);
                showNotification('Report link copied to clipboard!', 'success');
            } else {
                showNotification('Copy this URL to share: ' + url, 'info');
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Report.init());
