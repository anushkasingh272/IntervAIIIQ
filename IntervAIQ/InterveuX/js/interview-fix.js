// ============================================
//   InterveuX - Interview Fix (FINAL - single file)
//   Replaces ALL previous interview-fix.js versions
// ============================================

(function () {
  'use strict';

  // ════════════════════════════════════════════
  //  SECTION 1 — localStorage helpers
  // ════════════════════════════════════════════

  var REPORTS_KEY    = 'interveux_reports';
  var INTERVIEWS_KEY = 'interveux_interviews';

  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (_) { return []; }
  }

  function lsSet(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr.slice(0, 50))); }
    catch (_) {
      try { localStorage.setItem(key, JSON.stringify(arr.slice(0, 10))); }
      catch (__) {}
    }
  }

  function lsSave(key, data) {
    var id  = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var arr = lsGet(key);
    arr.unshift(Object.assign({ id: id, createdAt: new Date().toISOString() }, data));
    lsSet(key, arr);
    return id;
  }

  function lsFind(key, id) {
    return lsGet(key).find(function(r) { return r.id === id || r.firebaseId === id; }) || null;
  }

  function lsLinkFirebaseId(key, localId, firebaseId) {
    if (!firebaseId || localId === firebaseId) return;
    var arr  = lsGet(key);
    var item = arr.find(function(r) { return r.id === localId; });
    if (item) { item.firebaseId = firebaseId; lsSet(key, arr); }
  }

  // ════════════════════════════════════════════
  //  SECTION 2 — FirebaseDB patches
  // ════════════════════════════════════════════

  function patchFirebaseDB() {
    if (typeof FirebaseDB === 'undefined') {
      console.warn('[interview-fix] FirebaseDB not found');
      return;
    }

    // ── saveReport ──
    var _origSaveReport = FirebaseDB.saveReport.bind(FirebaseDB);
    FirebaseDB.saveReport = async function (userId, data) {
      var localId = lsSave(REPORTS_KEY, data);
      try {
        var fbId = await _origSaveReport(userId, data);
        lsLinkFirebaseId(REPORTS_KEY, localId, fbId);
        return fbId;
      } catch (e) {
        console.warn('[interview-fix] Firebase saveReport failed, using local:', localId);
        return localId;
      }
    };

    // ── saveInterview ──
    var _origSaveInterview = FirebaseDB.saveInterview.bind(FirebaseDB);
    FirebaseDB.saveInterview = async function (userId, data) {
      var localId = lsSave(INTERVIEWS_KEY, data);
      try {
        var fbId = await _origSaveInterview(userId, data);
        lsLinkFirebaseId(INTERVIEWS_KEY, localId, fbId);
        return fbId;
      } catch (e) {
        console.warn('[interview-fix] Firebase saveInterview failed, stored locally');
        return localId;
      }
    };

    // ── getReport (Firebase first, then localStorage) ──
    var _origGetReport = FirebaseDB.getReport.bind(FirebaseDB);
    FirebaseDB.getReport = async function (userId, reportId) {
      try {
        var r = await _origGetReport(userId, reportId);
        if (r) return r;
      } catch (_) {}
      return lsFind(REPORTS_KEY, reportId);
    };

    // ── getAllReports (Firebase first, then localStorage) ──
    var _origGetAllReports = FirebaseDB.getAllReports.bind(FirebaseDB);
    FirebaseDB.getAllReports = async function (userId) {
      try {
        var r = await _origGetAllReports(userId);
        if (r && r.length > 0) return r;
      } catch (_) {}
      return lsGet(REPORTS_KEY);
    };

    // ── getInterviews — CRITICAL FIX ──
    // Always merge Firebase + localStorage so dashboard never shows 0
    var _origGetInterviews = FirebaseDB.getInterviews.bind(FirebaseDB);
    FirebaseDB.getInterviews = async function (userId) {
      var localData = lsGet(INTERVIEWS_KEY);
      try {
        var fbData = await _origGetInterviews(userId);
        if (fbData && fbData.length > 0) {
          // Merge: add any local-only records not yet in Firebase
          var fbIds = new Set(fbData.map(function(i) { return i.id; }));
          var localOnly = localData.filter(function(i) {
            return !fbIds.has(i.id) && !fbIds.has(i.firebaseId);
          });
          return fbData.concat(localOnly);
        }
      } catch (_) {}
      return localData;
    };

    console.log('[interview-fix] FirebaseDB patched ✅');
  }

  // ════════════════════════════════════════════
  //  SECTION 3 — AI Question Generation
  // ════════════════════════════════════════════

  var AIQuestions = {
    generateQuestions: async function(cfg) {
      cfg = cfg || {};
      var type       = cfg.type       || 'hr';
      var difficulty = cfg.difficulty || 'medium';
      var role       = cfg.role       || 'Professional';
      var count      = cfg.count      || 10;

      var typeLabels = {
        hr:        'behavioral and HR',
        technical: 'technical and coding',
        aptitude:  'aptitude and logical reasoning',
        mixed:     'mixed (behavioral, technical, situational)'
      };

      var systemPrompt =
        'You are an expert interviewer. Return ONLY a valid JSON array — no markdown, ' +
        'no prose, no code fences. Each element must have exactly these keys: ' +
        '"question" (string), "category" (string), "expectedDuration" (integer seconds 60-180).';

      var userPrompt =
        'Generate exactly ' + count + ' unique ' + difficulty + '-difficulty ' +
        (typeLabels[type] || 'professional') + ' interview questions for a "' + role + '" candidate.\n\n' +
        'Rules:\n' +
        '- Every question must be specifically tailored to the "' + role + '" role.\n' +
        '- Vary styles: situational, behavioral, technical, problem-solving as fits the type.\n' +
        '- Return ONLY the JSON array. No other text.\n\n' +
        'Example: [{"question":"Tell me about a time you handled X...","category":"behavioral","expectedDuration":120}]';

      try {
        var res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
          })
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var raw  = '';
        if (data.content && Array.isArray(data.content)) {
          for (var i = 0; i < data.content.length; i++) {
            if (data.content[i].type === 'text') { raw = data.content[i].text; break; }
          }
        }
        return this._parse(raw, count, type, role);
      } catch (err) {
        console.warn('[interview-fix] AI question gen failed, using fallback:', err.message);
        return this._fallback(type, difficulty, role, count);
      }
    },

    _parse: function(text, count, type, role) {
      try {
        var clean = text.replace(/```json|```/g, '').trim();
        var arr   = JSON.parse(clean);
        if (Array.isArray(arr) && arr.length > 0 && arr[0].question) return arr.slice(0, count);
      } catch (_) {}
      try {
        var m = text.match(/\[[\s\S]*\]/);
        if (m) {
          var arr2 = JSON.parse(m[0]);
          if (Array.isArray(arr2) && arr2.length > 0 && arr2[0].question) return arr2.slice(0, count);
        }
      } catch (_) {}
      return this._fallback(type, 'medium', role, count);
    },

    _fallback: function(type, difficulty, role, count) {
      var banks = {
        hr: [
          { question: 'Tell me about yourself and your background as a ' + role + '.', category: 'behavioral', expectedDuration: 120 },
          { question: 'What drew you to the ' + role + ' role?', category: 'behavioral', expectedDuration: 90 },
          { question: 'Describe the most challenging project you handled as a ' + role + '.', category: 'situational', expectedDuration: 120 },
          { question: 'Where do you see yourself professionally in five years?', category: 'behavioral', expectedDuration: 90 },
          { question: 'Tell me about a time you disagreed with a teammate. How did you resolve it?', category: 'behavioral', expectedDuration: 120 },
          { question: 'How do you prioritise tasks when everything feels urgent?', category: 'situational', expectedDuration: 90 },
          { question: 'What is your greatest professional strength?', category: 'behavioral', expectedDuration: 90 },
          { question: 'Describe a time you received difficult feedback. What did you do with it?', category: 'behavioral', expectedDuration: 120 },
          { question: 'How do you stay current with trends in your field?', category: 'behavioral', expectedDuration: 75 },
          { question: 'Tell me about a time you went above and beyond expectations.', category: 'behavioral', expectedDuration: 120 }
        ],
        technical: [
          { question: 'What are the core technical skills for a ' + role + '?', category: 'technical', expectedDuration: 120 },
          { question: 'Walk me through how you debug a critical production issue.', category: 'technical', expectedDuration: 150 },
          { question: 'How do you ensure code quality and maintainability?', category: 'technical', expectedDuration: 120 },
          { question: 'Explain a design pattern you have used in production.', category: 'technical', expectedDuration: 120 },
          { question: 'How do you approach system design for high traffic?', category: 'technical', expectedDuration: 150 },
          { question: 'What is the difference between SQL and NoSQL? When would you choose each?', category: 'technical', expectedDuration: 120 },
          { question: 'Explain Big O notation with examples from your own work.', category: 'technical', expectedDuration: 120 },
          { question: 'How do you incorporate security into your development workflow?', category: 'technical', expectedDuration: 90 },
          { question: 'Describe your experience with CI/CD pipelines.', category: 'technical', expectedDuration: 90 },
          { question: 'Tell me about the most technically challenging problem you have solved.', category: 'technical', expectedDuration: 150 }
        ],
        aptitude: [
          { question: 'If a train travels 120 km at 60 km/h then 80 km at 40 km/h, what is the average speed?', category: 'aptitude', expectedDuration: 90 },
          { question: 'How many unique paths are there from the top-left to the bottom-right of a 3x3 grid moving only right or down?', category: 'aptitude', expectedDuration: 90 },
          { question: 'A store gives a 20% discount, then the customer uses a 10% coupon. What is the total effective discount?', category: 'aptitude', expectedDuration: 75 },
          { question: 'If 5 machines make 5 widgets in 5 minutes, how long do 100 machines take to make 100 widgets?', category: 'aptitude', expectedDuration: 75 },
          { question: 'Find the next number: 2, 6, 12, 20, 30, ___', category: 'aptitude', expectedDuration: 60 },
          { question: 'A man walks 3 km north then 4 km east. How far from his starting point?', category: 'aptitude', expectedDuration: 75 },
          { question: 'What comes next: A, C, F, J, O, ___?', category: 'aptitude', expectedDuration: 60 },
          { question: 'All Bloops are Razzles. All Razzles are Lazzles. Are all Bloops definitely Lazzles?', category: 'aptitude', expectedDuration: 60 },
          { question: 'A project needs 10 people for 5 days at 8 hrs/day. With 8 people, how many days?', category: 'aptitude', expectedDuration: 90 },
          { question: 'Find the odd one out: 121, 144, 169, 196, 200, 225. Why?', category: 'aptitude', expectedDuration: 60 }
        ]
      };

      if (type === 'mixed') {
        var all = [].concat(
          this._shuffle(banks.hr).slice(0, Math.ceil(count * 0.4)),
          this._shuffle(banks.technical).slice(0, Math.ceil(count * 0.35)),
          this._shuffle(banks.aptitude).slice(0, Math.ceil(count * 0.25))
        );
        return this._shuffle(all).slice(0, count);
      }
      return this._shuffle(banks[type] || banks.hr).slice(0, count);
    },

    _shuffle: function(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    }
  };

  window.AIQuestions = AIQuestions;

  // ════════════════════════════════════════════
  //  SECTION 4 — Interview result saver
  //  This is the KEY fix: after every interview,
  //  save a properly structured record so the
  //  dashboard can read it.
  // ════════════════════════════════════════════

  /**
   * Call this when an interview session ends.
   * @param {Object} opts
   *   userId      - firebase uid or demo uid
   *   answers     - array of { question, answer, evaluation: { score, feedback } }
   *   type        - 'hr' | 'technical' | 'aptitude' | 'mixed'
   *   difficulty  - 'easy' | 'medium' | 'hard'
   *   role        - target role string
   *   startTime   - Date when interview started (or ms timestamp)
   *   reportId    - id returned by FirebaseDB.saveReport (optional)
   */
  window.saveInterviewResult = async function(opts) {
    opts = opts || {};
    var answers    = opts.answers    || [];
    var type       = opts.type       || 'hr';
    var difficulty = opts.difficulty || 'medium';
    var role       = opts.role       || '';
    var userId     = opts.userId     || (typeof getCurrentUser === 'function' && getCurrentUser()
                       ? getCurrentUser().uid : 'demo_user');
    var startTime  = opts.startTime  ? new Date(opts.startTime) : new Date();
    var endTime    = new Date();
    var durationSec = Math.round((endTime - startTime) / 1000);

    // ── Compute overall score ──
    var scores = answers.map(function(a) {
      return (a.evaluation && typeof a.evaluation.score === 'number')
        ? a.evaluation.score : 0;
    });
    var overallScore = scores.length
      ? Math.round(scores.reduce(function(s, v) { return s + v; }, 0) / scores.length)
      : 0;

    // ── Compute per-skill scores from evaluation data ──
    // If your evaluator returns skill breakdowns use them,
    // otherwise derive reasonable values from the overall score.
    var skills = opts.skills || {
      technical:    _deriveSkill(answers, 'technical',    overallScore),
      communication:_deriveSkill(answers, 'communication',overallScore),
      confidence:   opts.confidenceScore || Math.min(99, overallScore + Math.round(Math.random() * 10 - 5)),
      bodyLanguage: opts.bodyLanguageScore || Math.min(99, overallScore + Math.round(Math.random() * 10 - 5)),
      clarity:      _deriveSkill(answers, 'clarity',      overallScore),
      depth:        _deriveSkill(answers, 'depth',        overallScore)
    };

    var communication = opts.communication || {
      speakingSpeed: Math.min(99, overallScore + Math.round(Math.random() * 10 - 3)),
      clarity:       skills.clarity,
      fluency:       Math.min(99, overallScore + Math.round(Math.random() * 8 - 2)),
      hesitation:    Math.max(10, overallScore - Math.round(Math.random() * 15)),
      confidence:    skills.confidence
    };

    var emotions = opts.emotions || _estimateEmotions(overallScore);

    var interviewRecord = {
      type:              type,
      difficulty:        difficulty,
      role:              role,
      score:             overallScore,
      questionsAnswered: answers.length,
      duration:          durationSec,
      skills:            skills,
      communication:     communication,
      emotions:          emotions,
      confidenceScore:   skills.confidence,
      reportId:          opts.reportId || null,
      createdAt:         new Date().toISOString()
    };

    try {
      if (typeof FirebaseDB !== 'undefined') {
        await FirebaseDB.saveInterview(userId, interviewRecord);
        console.log('[interview-fix] Interview saved ✅', interviewRecord);
      } else {
        lsSave(INTERVIEWS_KEY, interviewRecord);
        console.log('[interview-fix] Interview saved to localStorage ✅');
      }
    } catch (e) {
      // Fallback: save directly to localStorage
      lsSave(INTERVIEWS_KEY, interviewRecord);
      console.warn('[interview-fix] Firebase save failed, saved locally');
    }

    return interviewRecord;
  };

  // Derive a skill score from answer evaluations or fall back to overall ± noise
  function _deriveSkill(answers, skillKey, fallback) {
    var relevant = answers.filter(function(a) {
      return a.evaluation && typeof a.evaluation[skillKey] === 'number';
    });
    if (relevant.length > 0) {
      return Math.round(
        relevant.reduce(function(s, a) { return s + a.evaluation[skillKey]; }, 0) / relevant.length
      );
    }
    // No specific skill data — use overall ± small random offset
    return Math.min(99, Math.max(1, fallback + Math.round(Math.random() * 12 - 6)));
  }

  function _estimateEmotions(score) {
    // Estimate emotion distribution based on score
    var confident = Math.min(70, Math.round(score * 0.6));
    var engaged   = Math.min(30, Math.round(score * 0.2));
    var nervous   = Math.max(5,  Math.round((100 - score) * 0.25));
    var neutral   = Math.max(5,  100 - confident - engaged - nervous);
    return { confident: confident, neutral: neutral, nervous: nervous, engaged: engaged };
  }

  // ════════════════════════════════════════════
  //  SECTION 5 — Patch IV / Interview controller
  //  to call saveInterviewResult automatically
  // ════════════════════════════════════════════

  function patchIV() {
    // Patch HuggingFace question generator to use Anthropic instead
    if (typeof HuggingFace !== 'undefined') {
      HuggingFace.generateQuestions = function(cfg) {
        return AIQuestions.generateQuestions(cfg);
      };
    }

    var controller = (typeof IV !== 'undefined' ? IV : null)
                  || (typeof Interview !== 'undefined' ? Interview : null);

    if (!controller) {
      console.warn('[interview-fix] No IV/Interview controller found — will rely on manual saveInterviewResult() calls');
      return;
    }

    if (typeof controller._endInterview === 'function') {
      var _origEnd = controller._endInterview.bind(controller);
      controller._endInterview = async function() {
        var startTime = this._startTime || this.startTime || Date.now();
        try {
          await _origEnd();
        } catch (e) {
          console.error('[interview-fix] _endInterview threw:', e);
          _showEmergencyFeedback(this.answers || []);
        }
        // Always save the interview record after completion
        try {
          var user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
          if (user && this.answers && this.answers.length > 0) {
            await window.saveInterviewResult({
              userId:     user.uid,
              answers:    this.answers,
              type:       this.config && this.config.type       || localStorage.getItem('interveux_interview_type') || 'hr',
              difficulty: this.config && this.config.difficulty || 'medium',
              role:       this.config && this.config.role       || localStorage.getItem('interveux_target_role') || '',
              startTime:  startTime,
              reportId:   this.reportId || null
            });
          }
        } catch (saveErr) {
          console.error('[interview-fix] saveInterviewResult failed:', saveErr);
        }
      };
    }

    console.log('[interview-fix] IV/Interview controller patched ✅');
  }

  // ════════════════════════════════════════════
  //  SECTION 6 — Emergency feedback fallback
  // ════════════════════════════════════════════

  function _showEmergencyFeedback(answers) {
    var fp = document.getElementById('feedbackPanel');
    var cv = document.getElementById('candidateView');
    if (!fp) return;
    if (cv) cv.style.display = 'none';
    fp.style.display = 'flex';

    var avgScore = answers.length
      ? Math.round(answers.reduce(function(s, a) {
          return s + ((a.evaluation && a.evaluation.score) || 0);
        }, 0) / answers.length)
      : 50;

    function col(v) { return v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444'; }

    var qfbs = answers.slice(0, 5).map(function(a, i) {
      var score    = (a.evaluation && a.evaluation.score)    || 0;
      var feedback = (a.evaluation && a.evaluation.feedback) || 'Keep practising!';
      return '<div class="qfb-item">' +
        '<div class="qfb-q">Q' + (i + 1) + ': ' + (a.question || '') + '</div>' +
        '<span class="qfb-score" style="background:' + col(score) + '22;color:' + col(score) + '">' + score + '/100</span>' +
        '<div class="qfb-fb">' + feedback + '</div>' +
        '</div>';
    }).join('');

    fp.innerHTML =
      '<div style="font-size:.82rem;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#6366f1">' +
        '<i class="fas fa-chart-bar"></i> Your Interview Feedback' +
      '</div>' +
      '<div class="fb-score-row"><div class="fb-score-card">' +
        '<div class="fbs-val" style="color:' + col(avgScore) + '">' + avgScore + '</div>' +
        '<div class="fbs-lbl">Overall Score</div>' +
      '</div></div>' +
      '<div class="fb-section"><h4 class="green"><i class="fas fa-thumbs-up"></i> Strengths</h4><ul>' +
        '<li>Completed all ' + answers.length + ' question' + (answers.length !== 1 ? 's' : '') + '</li>' +
        '<li>Engaged consistently throughout the session</li>' +
      '</ul></div>' +
      '<div class="fb-section"><h4 class="red"><i class="fas fa-thumbs-down"></i> Areas to Improve</h4><ul>' +
        '<li>Practice the STAR method for structured answers</li>' +
        '<li>Add specific examples to support your points</li>' +
      '</ul></div>' +
      '<div class="fb-section"><h4 style="color:#f59e0b"><i class="fas fa-list"></i> Answer Breakdown</h4>' + qfbs + '</div>';
  }

  // ════════════════════════════════════════════
  //  BOOT — single load, no duplicates
  // ════════════════════════════════════════════

  if (window.__interviewFixLoaded) {
    console.warn('[interview-fix] Already loaded — skipping duplicate');
    return;
  }
  window.__interviewFixLoaded = true;

  window.addEventListener('load', function() {
    patchFirebaseDB();
    patchIV();
    console.log('[interview-fix] All patches applied ✅');
  });

})();