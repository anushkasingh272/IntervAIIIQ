// ============================================
//   InterveuX - AI Question Generator
//   Uses Anthropic API (claude-sonnet-4-20250514)
//   Drop this file in js/ and load it in
//   interview.html BEFORE interview.js / the
//   inline <script> block.
// ============================================
 
const AIQuestions = {
 
  // ── Public API ──────────────────────────────
  /**
   * Generate questions via Claude.
   * @param {Object} cfg  { type, difficulty, role, count }
   * @returns {Promise<Array>}  array of { question, category, expectedDuration }
   */
  async generateQuestions(cfg = {}) {
    const { type = 'hr', difficulty = 'medium', role = 'Professional', count = 10 } = cfg;
 
    const systemPrompt = `You are an expert interviewer. Return ONLY a valid JSON array — no markdown, no prose, no code fences. Each element has exactly these keys: "question" (string), "category" (string), "expectedDuration" (integer seconds 60-180).`;
 
    const typeMap = {
      hr:        'behavioral and HR',
      technical: 'technical and coding',
      aptitude:  'aptitude and logical reasoning',
      mixed:     'mixed (behavioral, technical, situational)',
    };
 
    const userPrompt = `Generate exactly ${count} unique ${difficulty}-difficulty ${typeMap[type] || 'professional'} interview questions for a "${role}" candidate.
 
Rules:
- Tailor every question specifically to the "${role}" role.
- Vary question styles (situational, behavioral, technical, problem-solving) where appropriate for the interview type.
- For technical questions, make them relevant to the skills a ${role} would use day-to-day.
- Return ONLY the JSON array. No other text.
 
Example format:
[{"question":"Tell me about a time you…","category":"behavioral","expectedDuration":120}]`;
 
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
 
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const raw = data.content?.find(b => b.type === 'text')?.text || '';
      return this._parse(raw, count, type, role);
    } catch (err) {
      console.warn('[AIQuestions] API call failed, using fallback:', err.message);
      return this._fallback(type, difficulty, role, count);
    }
  },
 
  // ── Parse Claude's JSON output ──────────────
  _parse(text, count, type, role) {
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const arr = JSON.parse(clean);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].question) {
        return arr.slice(0, count);
      }
    } catch (_) { /* fall through */ }
 
    // Try extracting a JSON array from anywhere in the text
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr) && arr.length > 0) return arr.slice(0, count);
      }
    } catch (_) { /* fall through */ }
 
    console.warn('[AIQuestions] Could not parse response, using fallback');
    return this._fallback(type, 'medium', role, count);
  },
 
  // ── Fallback bank (role-agnostic but typed) ─
  _fallback(type, difficulty, role, count) {
    const banks = {
      hr: [
        { question: `Tell me about yourself and your background as a ${role}.`, category: 'behavioral', expectedDuration: 120 },
        { question: `What drew you to the ${role} role, and why do you want to work here?`, category: 'behavioral', expectedDuration: 90 },
        { question: `Describe a challenging project you worked on as a ${role} and how you handled it.`, category: 'situational', expectedDuration: 120 },
        { question: 'Where do you see yourself professionally in five years?', category: 'behavioral', expectedDuration: 90 },
        { question: 'Tell me about a time you disagreed with a teammate. How did you resolve it?', category: 'behavioral', expectedDuration: 120 },
        { question: 'How do you prioritise tasks when everything feels urgent?', category: 'situational', expectedDuration: 90 },
        { question: 'What is your greatest professional strength, and how has it helped your team?', category: 'behavioral', expectedDuration: 90 },
        { question: 'Describe a time you received difficult feedback. What did you do with it?', category: 'behavioral', expectedDuration: 120 },
        { question: 'How do you stay current with trends and developments in your field?', category: 'behavioral', expectedDuration: 75 },
        { question: 'Tell me about a time you went above and beyond what was expected.', category: 'behavioral', expectedDuration: 120 },
      ],
      technical: [
        { question: `What are the core technical skills a ${role} must have, and how do you rate yourself in each?`, category: 'technical', expectedDuration: 120 },
        { question: 'Explain a complex technical concept you use regularly in simple terms.', category: 'technical', expectedDuration: 120 },
        { question: `Walk me through how you would debug a production issue in your ${role} capacity.`, category: 'technical', expectedDuration: 150 },
        { question: 'How do you ensure code quality and maintainability in your projects?', category: 'technical', expectedDuration: 120 },
        { question: 'Describe your experience with version control and CI/CD pipelines.', category: 'technical', expectedDuration: 90 },
        { question: 'How do you approach system design for a feature that needs to scale?', category: 'technical', expectedDuration: 150 },
        { question: 'What is the difference between SQL and NoSQL databases? When would you choose each?', category: 'technical', expectedDuration: 120 },
        { question: 'Explain a design pattern you have used and why you chose it.', category: 'technical', expectedDuration: 120 },
        { question: 'How do you handle security considerations in your day-to-day work?', category: 'technical', expectedDuration: 90 },
        { question: 'Tell me about the most technically challenging problem you have solved.', category: 'technical', expectedDuration: 150 },
      ],
      aptitude: [
        { question: 'If a train travels 120 km at 60 km/h, then 80 km at 40 km/h, what is the average speed for the whole journey?', category: 'aptitude', expectedDuration: 90 },
        { question: 'How many unique paths are there from the top-left to the bottom-right of a 3×3 grid, moving only right or down?', category: 'aptitude', expectedDuration: 90 },
        { question: 'A store gives a 20% discount; then the customer applies a 10% coupon. What is the effective total discount?', category: 'aptitude', expectedDuration: 75 },
        { question: 'If 5 machines make 5 widgets in 5 minutes, how long for 100 machines to make 100 widgets?', category: 'aptitude', expectedDuration: 75 },
        { question: 'Find the next number: 2, 6, 12, 20, 30, ___', category: 'aptitude', expectedDuration: 60 },
        { question: 'A man walks 3 km north, then 4 km east. How far is he from his starting point?', category: 'aptitude', expectedDuration: 75 },
        { question: 'What comes next in the series: A, C, F, J, O, ___?', category: 'aptitude', expectedDuration: 60 },
        { question: 'All Bloops are Razzles. All Razzles are Lazzles. Are all Bloops definitely Lazzles?', category: 'aptitude', expectedDuration: 60 },
        { question: 'A project needs 10 people × 8 hrs/day × 5 days. With only 8 people, how many days?', category: 'aptitude', expectedDuration: 90 },
        { question: 'Find the odd one out: 121, 144, 169, 196, 200, 225', category: 'aptitude', expectedDuration: 60 },
      ],
    };
 
    if (type === 'mixed') {
      const all = [...banks.hr.slice(0, 4), ...banks.technical.slice(0, 3), ...banks.aptitude.slice(0, 3)];
      return this._shuffle(all).slice(0, count);
    }
    const pool = banks[type] || banks.hr;
    return this._shuffle(pool).slice(0, count);
  },
 
  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
};
 
window.AIQuestions = AIQuestions;