// ============================================
//   InterveuX - Speech (TTS + STT)
// ============================================

const Speech = {
    // ── State ────────────────────────────────
    synthesis: window.speechSynthesis || null,
    recognition: null,
    isListening: false,
    isSpeaking: false,
    currentUtterance: null,
    voices: [],
    preferredVoice: null,
    onTranscriptUpdate: null,
    onSpeakStart: null,
    onSpeakEnd: null,
    onListenStart: null,
    onListenEnd: null,

    // ── Init ─────────────────────────────────
    init() {
        this._loadVoices();
        this._initRecognition();

        if (this.synthesis) {
            this.synthesis.onvoiceschanged = () => this._loadVoices();
        }
    },

    _loadVoices() {
    if (!this.synthesis) return;
    this.voices = this.synthesis.getVoices();
    // Prefer female English voices only
    const preferred = ['Google US English Female', 'Microsoft Zira', 'Microsoft Aria', 'Samantha', 'Victoria', 'Karen', 'Female'];
    this.preferredVoice = null;
    for (const name of preferred) {
        const v = this.voices.find(v => v.name.includes(name));
        if (v) { this.preferredVoice = v; break; }
    }
    if (!this.preferredVoice) {
        const maleNames = ['David', 'Mark', 'Daniel', 'Alex', 'Fred', 'Male', 'Guy', 'James'];
        const englishVoices = this.voices.filter(v => v.lang.startsWith('en'));
        this.preferredVoice = englishVoices.find(v => !maleNames.some(m => v.name.includes(m))) || englishVoices[0] || this.voices[0] || null;
    }
},

    _initRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.warn('Speech Recognition not supported in this browser.');
            return;
        }
        this.recognition = new SR();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (e) => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t;
                else interim += t;
            }
            if (this.onTranscriptUpdate) this.onTranscriptUpdate(final, interim);
        };

        this.recognition.onerror = (e) => {
            if (e.error !== 'no-speech' && e.error !== 'aborted') {
                console.warn('Speech recognition error:', e.error);
            }
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                // Auto-restart if still in listening mode
                try { this.recognition.start(); } catch (e) { /* already started */ }
            }
        };
    },

    // ── Text-to-Speech ───────────────────────
    speak(text, options = {}) {
        return new Promise((resolve) => {
            if (!this.synthesis || !text) {
                this.simulateSpeaking(3000);
                resolve();
                return;
            }

            this.synthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.voice = this.preferredVoice;
            utterance.rate = options.rate || 0.9;
            utterance.pitch = options.pitch || 1.0;
            utterance.volume = options.volume || 1.0;

            utterance.onstart = () => {
                this.isSpeaking = true;
                if (this.onSpeakStart) this.onSpeakStart();
            };

            utterance.onend = () => {
                this.isSpeaking = false;
                this.currentUtterance = null;
                if (this.onSpeakEnd) this.onSpeakEnd();
                resolve();
            };

            utterance.onerror = () => {
                this.isSpeaking = false;
                if (this.onSpeakEnd) this.onSpeakEnd();
                resolve();
            };

            this.currentUtterance = utterance;
            this.synthesis.speak(utterance);
        });
    },

    stopSpeaking() {
        if (this.synthesis) {
            this.synthesis.cancel();
            this.isSpeaking = false;
            if (this.onSpeakEnd) this.onSpeakEnd();
        }
    },

    // ── Speech-to-Text ───────────────────────
    startListening() {
        if (!this.recognition) return false;
        try {
            this.isListening = true;
            this.recognition.start();
            if (this.onListenStart) this.onListenStart();
            return true;
        } catch (e) {
            console.warn('Could not start recognition:', e);
            return false;
        }
    },

    stopListening() {
        if (!this.recognition) return;
        this.isListening = false;
        try { this.recognition.stop(); } catch (e) { /* already stopped */ }
        if (this.onListenEnd) this.onListenEnd();
    },

    // ── Simulate speaking when TTS unavailable ─
    simulateSpeaking(duration = 3000) {
        this.isSpeaking = true;
        if (this.onSpeakStart) this.onSpeakStart();
        setTimeout(() => {
            this.isSpeaking = false;
            if (this.onSpeakEnd) this.onSpeakEnd();
        }, duration);
    },

    // ── Get available voices ──────────────────
    getVoices() {
        return this.voices.filter(v => v.lang.startsWith('en'));
    },

    setVoice(voiceName) {
        const v = this.voices.find(v => v.name === voiceName);
        if (v) this.preferredVoice = v;
    },

    isSupported() {
        return !!(this.synthesis && (window.SpeechRecognition || window.webkitSpeechRecognition));
    }
};

// ── Audio Waveform Visualizer ────────────────
const AudioVisualizer = {
    analyser: null,
    animFrame: null,
    stream: null,

    async init(stream, canvasId) {
        try {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = audioCtx.createAnalyser();
            this.analyser.fftSize = 256;

            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(this.analyser);

            this.stream = stream;
            this._draw(canvas);
        } catch (e) {
            console.warn('AudioVisualizer init failed:', e);
        }
    },

    _draw(canvas) {
        const ctx = canvas.getContext('2d');
        const bufferLength = this.analyser ? this.analyser.frequencyBinCount : 64;
        const dataArray = new Uint8Array(bufferLength);

        const render = () => {
            this.animFrame = requestAnimationFrame(render);
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;

            if (this.analyser) {
                this.analyser.getByteFrequencyData(dataArray);
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = this.analyser
                    ? (dataArray[i] / 255) * canvas.height
                    : Math.random() * 10 + 2;

                const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
                gradient.addColorStop(0, '#6366f1');
                gradient.addColorStop(1, '#8b5cf6');

                ctx.fillStyle = gradient;
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
                x += barWidth + 1;
            }
        };
        render();
    },

    stop() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.analyser = null;
    }
};

// Initialize
Speech.init();
window.Speech = Speech;
window.AudioVisualizer = AudioVisualizer;