// ============================================
//   InterveuX - Posture Detection
// ============================================
// Uses MediaPipe Pose (optional) with simulated fallback

const PostureDetector = {
    video: null,
    canvas: null,
    ctx: null,
    isRunning: false,
    interval: null,
    postureHistory: [],
    onPostureUpdate: null,
    mediaPipeLoaded: false,
    pose: null,

    async init(videoEl, canvasEl) {
        this.video = videoEl;
        this.canvas = canvasEl;
        if (this.canvas) this.ctx = this.canvas.getContext('2d');

        // Try MediaPipe
        if (typeof Pose !== 'undefined') {
            try {
                await this._initMediaPipe();
                this.mediaPipeLoaded = true;
                console.log('✅ MediaPipe Pose loaded');
            } catch (e) {
                console.warn('MediaPipe failed — using simulated posture detection');
            }
        } else {
            console.info('MediaPipe not available — using simulated posture detection');
        }
    },

    async _initMediaPipe() {
        this.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.pose.setOptions({
            modelComplexity: 0,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.pose.onResults((results) => this._processPose(results));
    },

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        if (this.mediaPipeLoaded) {
            this._realDetection();
        } else {
            this._simulatedDetection();
        }
    },

    _realDetection() {
        const detect = async () => {
            if (!this.isRunning || !this.video || this.video.paused) return;
            try {
                await this.pose.send({ image: this.video });
            } catch (e) { /* silent */ }
            this.interval = setTimeout(detect, 1000);
        };
        detect();
    },

    _processPose(results) {
        if (!results.poseLandmarks) {
            this._updateUI({ label: 'No Pose', score: 0, status: 'bad' });
            return;
        }

        const lm = results.poseLandmarks;

        // Key landmarks
        const nose = lm[0];
        const leftShoulder = lm[11];
        const rightShoulder = lm[12];
        const leftEar = lm[7];
        const rightEar = lm[8];

        // Shoulder alignment (symmetry)
        const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y);
        const shoulderOk = shoulderDiff < 0.05;

        // Head tilt: compare ears
        const earDiff = Math.abs(leftEar.y - rightEar.y);
        const headOk = earDiff < 0.04;

        // Head forward/straight: nose should be between shoulders
        const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
        const headForward = Math.abs(nose.x - shoulderCenterX) < 0.1;

        // Overall posture score
        let score = 0;
        if (shoulderOk) score += 40;
        if (headOk) score += 30;
        if (headForward) score += 30;

        const posture = this._scoreToPosture(score);
        this._updateUI(posture);
        this._recordHistory(posture);
        if (this.onPostureUpdate) this.onPostureUpdate(posture);
    },

    _simulatedDetection() {
        let baseScore = 75;

        this.interval = setInterval(() => {
            if (!this.isRunning) return;

            // Simulate gradual drift and correction
            baseScore += (Math.random() - 0.48) * 5;
            baseScore = Math.max(40, Math.min(100, baseScore));

            const score = Math.round(baseScore + (Math.random() - 0.5) * 10);
            const posture = this._scoreToPosture(Math.max(0, Math.min(100, score)));

            this._updateUI(posture);
            this._recordHistory(posture);
            if (this.onPostureUpdate) this.onPostureUpdate(posture);
        }, 2000);
    },

    _scoreToPosture(score) {
        if (score >= 80) return { label: 'Excellent', score, status: 'good', icon: 'fa-person' };
        if (score >= 60) return { label: 'Good', score, status: 'ok', icon: 'fa-person' };
        if (score >= 40) return { label: 'Fair', score, status: 'warn', icon: 'fa-person-walking' };
        return { label: 'Poor', score, status: 'bad', icon: 'fa-person-falling' };
    },

    _updateUI(posture) {
        const badge = document.getElementById('postureBadge');
        if (badge) {
            badge.innerHTML = `<i class="fas ${posture.icon}"></i><span>${posture.label}</span>`;
            const colors = { good: 'rgba(16,185,129,0.75)', ok: 'rgba(99,102,241,0.75)', warn: 'rgba(245,158,11,0.75)', bad: 'rgba(239,68,68,0.75)' };
            badge.style.background = colors[posture.status] || 'rgba(0,0,0,0.6)';
        }
    },

    _recordHistory(posture) {
        this.postureHistory.push({ time: Date.now(), posture });
        if (this.postureHistory.length > 200) this.postureHistory.shift();
    },

    getAverageScore() {
        if (this.postureHistory.length === 0) return 72;
        const avg = this.postureHistory.reduce((s, e) => s + e.posture.score, 0) / this.postureHistory.length;
        return Math.round(avg);
    },

    stop() {
        this.isRunning = false;
        clearInterval(this.interval);
        clearTimeout(this.interval);
    }
};

window.PostureDetector = PostureDetector;
