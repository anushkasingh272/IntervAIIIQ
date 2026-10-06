// ============================================
//   InterveuX - AI Avatar Controller
// ============================================

const Avatar = {
    mouth: null,
    speakingIndicator: null,
    eyes: null,
    iris: null,
    isSpeaking: false,
    isBlinking: false,
    mouthAnimFrame: null,
    eyeAnimInterval: null,
    blinkInterval: null,

    init(containerId = 'interviewAvatar') {
        const container = document.getElementById(containerId);
        if (!container) return;

        this.mouth = container.querySelector('#avatarMouth, .avatar-mouth-main');
        this.speakingIndicator = document.getElementById('speakingIndicator');
        this.eyes = container.querySelectorAll('.avatar-eye-main');
        this.iris = container.querySelectorAll('.avatar-iris');

        this._startBlinking();
        this._startEyeMovement();
        this._startIdleBreathing();
    },

    // ── Speaking animation ───────────────────
    startSpeaking() {
        this.isSpeaking = true;

        if (this.mouth) {
            this.mouth.classList.add('speaking');
        }

        if (this.speakingIndicator) {
            this.speakingIndicator.classList.add('active');
        }

        // Animate wave bars dynamically
        const bars = document.querySelectorAll('.wave-bar-main');
        bars.forEach((bar, i) => {
            bar.style.animationPlayState = 'running';
            bar.style.animationDuration = (0.4 + Math.random() * 0.4) + 's';
        });
    },

    stopSpeaking() {
        this.isSpeaking = false;

        if (this.mouth) {
            this.mouth.classList.remove('speaking');
            // Rest mouth position
            const shape = this.mouth.querySelector('.mouth-shape');
            if (shape) {
                shape.style.animation = 'none';
                setTimeout(() => { shape.style.animation = ''; }, 100);
            }
        }

        if (this.speakingIndicator) {
            this.speakingIndicator.classList.remove('active');
        }
    },

    // ── Blink animation ──────────────────────
    _startBlinking() {
        const blink = () => {
            if (this.isBlinking) return;
            this.isBlinking = true;
            this.eyes.forEach(eye => {
                eye.style.transform = 'scaleY(0.1)';
                eye.style.transition = 'transform 0.08s ease';
            });
            setTimeout(() => {
                this.eyes.forEach(eye => {
                    eye.style.transform = 'scaleY(1)';
                });
                this.isBlinking = false;
            }, 130);
        };

        // Random blink interval between 2-6 seconds
        const schedBlink = () => {
            const delay = 2000 + Math.random() * 4000;
            this.blinkInterval = setTimeout(() => {
                blink();
                // Occasionally double-blink
                if (Math.random() > 0.7) {
                    setTimeout(blink, 300);
                }
                schedBlink();
            }, delay);
        };
        schedBlink();
    },

    // ── Subtle eye movement ──────────────────
    _startEyeMovement() {
        this.eyeAnimInterval = setInterval(() => {
            const dx = (Math.random() - 0.5) * 4;
            const dy = (Math.random() - 0.5) * 2;
            this.iris.forEach(iris => {
                iris.style.transform = `translate(${dx}px, ${dy}px)`;
                iris.style.transition = 'transform 0.8s ease';
            });
        }, 3000);
    },

    // ── Idle breathing effect ────────────────
    _startIdleBreathing() {
        const ring = document.querySelector('.avatar-ring-main, .avatar-ring');
        if (!ring) return;
        let t = 0;
        const breathe = () => {
            t += 0.02;
            const scale = 1 + Math.sin(t) * 0.01;
            ring.style.transform = `scale(${scale})`;
            requestAnimationFrame(breathe);
        };
        breathe();
    },

    // ── Thinking animation ───────────────────
    showThinking() {
        const glow = document.querySelector('.avatar-glow');
        if (glow) {
            glow.style.background = 'radial-gradient(circle, rgba(245,158,11,0.2), transparent)';
            glow.style.animation = 'glowPulse 1s ease-in-out infinite';
        }
        // Move eyes as if thinking
        this.iris.forEach(iris => {
            iris.style.transform = 'translate(2px, -2px)';
            iris.style.transition = 'transform 0.5s ease';
        });
        setTimeout(() => {
            this.iris.forEach(iris => {
                iris.style.transform = 'translate(-2px, 0px)';
            });
        }, 800);
    },

    showListening() {
        const glow = document.querySelector('.avatar-glow');
        if (glow) {
            glow.style.background = 'radial-gradient(circle, rgba(99,102,241,0.2), transparent)';
        }
        // Eyes widen slightly
        this.eyes.forEach(eye => {
            eye.style.transform = 'scaleY(1.2)';
            eye.style.transition = 'transform 0.3s ease';
        });
    },

    showIdle() {
        const glow = document.querySelector('.avatar-glow');
        if (glow) {
            glow.style.background = 'radial-gradient(circle, rgba(99,102,241,0.15), transparent)';
            glow.style.animation = 'glowPulse 3s ease-in-out infinite';
        }
        this.eyes.forEach(eye => {
            eye.style.transform = 'scaleY(1)';
        });
    },

    // ── Cleanup ──────────────────────────────
    destroy() {
        clearTimeout(this.blinkInterval);
        clearInterval(this.eyeAnimInterval);
        cancelAnimationFrame(this.mouthAnimFrame);
        this.stopSpeaking();
    }
};

// ── Hero Avatar (Landing Page) ───────────────
const HeroAvatar = {
    init() {
        const avatar = document.getElementById('heroAvatar');
        if (!avatar) return;

        // Auto-animate the hero preview avatar
        setInterval(() => {
            const mouth = avatar.querySelector('.avatar-mouth');
            if (mouth) {
                mouth.classList.toggle('speaking');
            }
        }, 3000);

        // Animate wave bars
        const bars = avatar.querySelectorAll('.wave-bar');
        bars.forEach((bar, i) => {
            bar.style.animationDelay = `${i * 0.1}s`;
        });
    }
};

window.Avatar = Avatar;
window.HeroAvatar = HeroAvatar;

// Auto init hero avatar if on landing page
if (document.getElementById('heroAvatar')) {
    HeroAvatar.init();
}
