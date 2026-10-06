// ============================================
//   InterveuX - Emotion & Face Detection
// ============================================
// Uses face-api.js (loaded via CDN) with graceful fallback

const EmotionDetector = {
    video: null,
    canvas: null,
    ctx: null,
    isRunning: false,
    detectionInterval: null,
    lastEmotions: null,
    faceApiLoaded: false,
    emotionHistory: [],
    eyeContactHistory: [],
    onEmotionUpdate: null,

    // ── Init ────────────────────────────────
    async init(videoEl, canvasEl) {
        this.video = videoEl;
        this.canvas = canvasEl;
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }

        // Try to load face-api.js models
        if (typeof faceapi !== 'undefined') {
            try {
                await this._loadModels();
                this.faceApiLoaded = true;
                console.log('✅ face-api.js loaded');
            } catch (e) {
                console.warn('face-api.js models failed to load — using simulated detection');
            }
        } else {
            console.info('face-api.js not available — using simulated emotion detection');
        }

        return this;
    },

    async _loadModels() {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model/';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
    },

    // ── Start Detection ──────────────────────
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        if (this.faceApiLoaded) {
            this._realDetection();
        } else {
            this._simulatedDetection();
        }
    },

    // ── Real face-api.js detection ───────────
    _realDetection() {
        this.detectionInterval = setInterval(async () => {
            if (!this.isRunning || !this.video || this.video.paused) return;
            try {
                const detections = await faceapi
                    .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
                    .withFaceLandmarks(true)
                    .withFaceExpressions();

                if (detections) {
                    this._processDetection(detections);
                } else {
                    this._noFaceDetected();
                }
            } catch (e) {
                // Silent fail
            }
        }, 500);
    },

    _processDetection(d) {
        const expr = d.expressions;
        const dominant = Object.entries(expr).reduce((a, b) => a[1] > b[1] ? a : b);
        const dominantName = dominant[0]; // happy, sad, neutral, surprised, angry, fearful, disgusted

        // Eye contact: estimate from landmark positions
        const landmarks = d.landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const faceBox = d.detection.box;
        const eyeCenterX = (leftEye[0].x + rightEye[0].x) / 2;
        const faceCenter = faceBox.x + faceBox.width / 2;
        const eyeContact = Math.max(0, 100 - Math.abs(eyeCenterX - faceCenter) / 2);

        const emotions = {
            dominant: dominantName,
            confidence: expr.happy > 0.3 ? 'High' : expr.neutral > 0.4 ? 'Moderate' : 'Low',
            nervousness: Math.round((expr.fearful + expr.surprised) * 100),
            happiness: Math.round(expr.happy * 100),
            neutral: Math.round(expr.neutral * 100),
            eyeContact: Math.round(eyeContact),
            label: this._emotionLabel(dominantName),
            icon: this._emotionIcon(dominantName),
            raw: expr
        };

        this._updateUI(emotions);
        this._recordHistory(emotions);
        if (this.onEmotionUpdate) this.onEmotionUpdate(emotions);
    },

    _noFaceDetected() {
        const emotions = {
            dominant: 'none',
            confidence: 'N/A',
            nervousness: 0,
            happiness: 0,
            neutral: 100,
            eyeContact: 0,
            label: 'No Face',
            icon: 'fa-face-meh',
            raw: {}
        };
        this._updateUI(emotions);
    },

    // ── Simulated Detection (fallback) ───────
    _simulatedDetection() {
        const emotions = ['neutral', 'happy', 'surprised', 'neutral', 'neutral'];
        let emotionIdx = 0;

        this.detectionInterval = setInterval(() => {
            if (!this.isRunning) return;

            // Gradually change to simulate realistic detection
            const t = Date.now() / 1000;
            const eyeContact = 65 + Math.sin(t * 0.5) * 20 + (Math.random() - 0.5) * 10;
            const confidence = 70 + Math.sin(t * 0.3) * 15 + (Math.random() - 0.5) * 10;
            const nervousness = Math.max(0, 30 - Math.sin(t * 0.2) * 20);

            if (Math.random() < 0.05) emotionIdx = (emotionIdx + 1) % emotions.length;
            const dominant = emotions[emotionIdx];

            const result = {
                dominant,
                confidence: confidence > 70 ? 'High' : confidence > 50 ? 'Moderate' : 'Low',
                nervousness: Math.round(nervousness),
                happiness: dominant === 'happy' ? 75 : 20,
                neutral: dominant === 'neutral' ? 80 : 30,
                eyeContact: Math.round(Math.max(0, Math.min(100, eyeContact))),
                label: this._emotionLabel(dominant),
                icon: this._emotionIcon(dominant),
                raw: {}
            };

            this.lastEmotions = result;
            this._updateUI(result);
            this._recordHistory(result);
            if (this.onEmotionUpdate) this.onEmotionUpdate(result);
        }, 1000);
    },

    // ── UI Updates ───────────────────────────
    _updateUI(emotions) {
        const badge = document.getElementById('emotionBadge');
        if (badge) {
            badge.innerHTML = `<i class="fas ${emotions.icon}"></i><span>${emotions.label}</span>`;
            badge.style.background = this._emotionColor(emotions.dominant);
        }

        const eyeMetric = document.querySelector('#eyeContactMetric span');
        if (eyeMetric) eyeMetric.textContent = `${emotions.eyeContact}%`;

        const confMetric = document.querySelector('#confidenceMetric span');
        if (confMetric) confMetric.textContent = emotions.confidence;
    },

    _recordHistory(emotions) {
        this.emotionHistory.push({
            time: Date.now(),
            emotions
        });
        this.eyeContactHistory.push(emotions.eyeContact);
        // Keep last 5 minutes
        if (this.emotionHistory.length > 300) this.emotionHistory.shift();
    },

    // ── Analytics ────────────────────────────
    getAverageMetrics() {
        if (this.emotionHistory.length === 0) {
            return { eyeContact: 72, confidence: 'Moderate', nervousness: 25, dominantEmotion: 'neutral' };
        }

        const avg = (arr, key) => Math.round(arr.reduce((s, e) => s + (e.emotions[key] || 0), 0) / arr.length);
        const eyeContact = avg(this.emotionHistory, 'eyeContact');
        const nervousness = avg(this.emotionHistory, 'nervousness');

        // Find most common dominant emotion
        const counts = {};
        this.emotionHistory.forEach(e => {
            counts[e.emotions.dominant] = (counts[e.emotions.dominant] || 0) + 1;
        });
        const dominantEmotion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

        return {
            eyeContact,
            nervousness,
            dominantEmotion,
            confidence: eyeContact > 65 ? 'High' : eyeContact > 45 ? 'Moderate' : 'Low',
            confidenceScore: Math.round(eyeContact * 0.6 + (100 - nervousness) * 0.4)
        };
    },

    // ── Stop ─────────────────────────────────
    stop() {
        this.isRunning = false;
        if (this.detectionInterval) clearInterval(this.detectionInterval);
    },

    // ── Helpers ──────────────────────────────
    _emotionLabel(e) {
        const labels = {
            happy: 'Confident', neutral: 'Focused', surprised: 'Engaged',
            fearful: 'Nervous', sad: 'Thoughtful', angry: 'Stressed',
            disgusted: 'Uncomfortable', none: 'No Face'
        };
        return labels[e] || 'Neutral';
    },

    _emotionIcon(e) {
        const icons = {
            happy: 'fa-face-smile', neutral: 'fa-face-meh', surprised: 'fa-face-surprise',
            fearful: 'fa-face-sad-tear', sad: 'fa-face-frown', angry: 'fa-face-angry',
            disgusted: 'fa-face-rolling-eyes', none: 'fa-face-meh-blank'
        };
        return icons[e] || 'fa-face-meh';
    },

    _emotionColor(e) {
        const colors = {
            happy: 'rgba(16,185,129,0.75)', neutral: 'rgba(0,0,0,0.6)',
            surprised: 'rgba(59,130,246,0.75)', fearful: 'rgba(245,158,11,0.75)',
            sad: 'rgba(100,116,139,0.75)', angry: 'rgba(239,68,68,0.75)'
        };
        return colors[e] || 'rgba(0,0,0,0.6)';
    }
};

window.EmotionDetector = EmotionDetector;
