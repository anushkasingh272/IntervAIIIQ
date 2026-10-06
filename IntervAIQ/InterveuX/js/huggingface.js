// ============================================
//   InterveuX - Hugging Face AI Integration
// ============================================

// Replace with your Hugging Face API token
// Get it free at: https://huggingface.co/settings/tokens
const API_URL = '/api/huggingface';

// Primary model for text generation
const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2';
// Fallback model (faster, smaller)
const HF_FALLBACK = 'google/flan-t5-large';

const HuggingFace = {
    async query(model, inputs, parameters = {}) {
       const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        model,
        inputs,
        parameters
    })
});

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            if (response.status === 503) {
                throw new Error('MODEL_LOADING'); // Model is warming up
            }
            throw new Error(err.error || `API error ${response.status}`);
        }

        return response.json();
    },

    // ── Generate Interview Questions ────────
    async generateQuestions(config) {
        const { type = 'hr', difficulty = 'medium', role = 'Software Engineer', count = 5 } = config;

        const typeDesc = {
            hr: 'behavioral and HR interview',
            technical: 'technical and programming',
            aptitude: 'aptitude and logical reasoning',
            mixed: 'mixed behavioral, technical, and situational'
        };

        const prompt = `<s>[INST] You are an expert ${typeDesc[type] || 'professional'} interviewer. 
Generate exactly ${count} unique ${difficulty} difficulty interview questions for a ${role} position.
Format your response as a JSON array of objects, each with:
- "question": the interview question
- "category": one of [technical, behavioral, situational, aptitude, communication]
- "expectedDuration": estimated answer time in seconds (60-180)

Return ONLY the JSON array, no other text. [/INST]`;

        try {
            const result = await this.query(HF_MODEL, prompt, {
                max_new_tokens: 1000,
                temperature: 0.7,
                return_full_text: false
            });

            const text = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
            return this._parseQuestions(text, count, type, role);
        } catch (err) {
            console.warn('Primary model failed, using fallback questions:', err.message);
            return this._getFallbackQuestions(type, difficulty, role, count);
        }
    },

    // ── Evaluate a Candidate's Answer ───────
    async evaluateAnswer(question, answer, type = 'hr') {
        if (!answer || answer.trim().length < 10) {
            return this._defaultEvaluation();
        }

        const prompt = `<s>[INST] You are an expert interview evaluator. 
Evaluate this interview answer and return a JSON object.

Question: "${question}"
Answer: "${answer}"
Interview type: ${type}

Return ONLY a JSON object with these fields:
{
  "score": (number 0-100),
  "relevance": (number 0-100),
  "clarity": (number 0-100),
  "depth": (number 0-100),
  "feedback": "2-3 sentence constructive feedback",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}
Return ONLY the JSON. [/INST]`;

        try {
            const result = await this.query(HF_MODEL, prompt, {
                max_new_tokens: 500,
                temperature: 0.3,
                return_full_text: false
            });
            const text = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
            return this._parseEvaluation(text);
        } catch (err) {
            console.warn('Evaluation API failed, using heuristic:', err.message);
            return this._heuristicEvaluation(answer);
        }
    },

    // ── Generate Final Report Summary ───────
    async generateReportSummary(interviewData) {
        const { answers = [], type, role = 'candidate', avgScore = 0 } = interviewData;
        const answerSummary = answers.slice(0, 5).map((a, i) =>
            `Q${i + 1}: ${a.question?.slice(0, 80) || '...'} | Score: ${a.evaluation?.score || 0}/100`
        ).join('\n');

        const prompt = `<s>[INST] Based on this interview performance, generate a professional summary report.

Role: ${role}
Interview Type: ${type}
Average Score: ${avgScore}/100
Questions & Scores:
${answerSummary}

Return ONLY a JSON object:
{
  "overallFeedback": "3-4 sentence overall assessment",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "hiringSuitability": "Strong Candidate | Moderate Candidate | Needs Improvement"
}
[/INST]`;

        try {
            const result = await this.query(HF_MODEL, prompt, {
                max_new_tokens: 700,
                temperature: 0.4,
                return_full_text: false
            });
            const text = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
            return this._parseReportSummary(text);
        } catch (err) {
            return this._defaultReportSummary(avgScore);
        }
    },

    // ── Parse Helpers ────────────────────────
    _parseQuestions(text, count, type, role) {
        try {
            if (!text) throw new Error('No text');
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { /* fall through */ }
        return this._getFallbackQuestions(type, 'medium', role, count);
    },

    _parseEvaluation(text) {
        try {
            if (!text) throw new Error('No text');
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.score !== undefined) return parsed;
            }
        } catch (e) { /* fall through */ }
        return this._defaultEvaluation();
    },

    _parseReportSummary(text) {
        try {
            if (!text) throw new Error('No text');
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch (e) { /* fall through */ }
        return this._defaultReportSummary(50);
    },

    _heuristicEvaluation(answer) {
        const words = answer.trim().split(/\s+/).length;
        const sentences = answer.split(/[.!?]+/).filter(Boolean).length;
        const hasExamples = /for example|such as|instance|specifically|when i|i have/i.test(answer);
        const hasStructure = /first|then|finally|however|therefore|because/i.test(answer);

        let score = 40;
        if (words > 50) score += 15;
        if (words > 100) score += 10;
        if (sentences > 3) score += 10;
        if (hasExamples) score += 15;
        if (hasStructure) score += 10;
        score = Math.min(score, 95);

        return {
            score,
            relevance: score - 5 + Math.floor(Math.random() * 10),
            clarity: score - 10 + Math.floor(Math.random() * 15),
            depth: score - 15 + Math.floor(Math.random() * 20),
            feedback: words < 30
                ? 'Your answer was quite brief. Try to expand with specific examples and details.'
                : hasExamples
                    ? 'Good use of examples to support your answer. Structure it with a clear beginning, middle, and conclusion.'
                    : 'Solid answer. Adding concrete examples from your experience would strengthen it significantly.',
            strengths: [
                words > 80 ? 'Detailed and comprehensive response' : 'Clear and concise answer',
                hasStructure ? 'Well-structured with logical flow' : 'Communicates main points effectively'
            ],
            improvements: [
                !hasExamples ? 'Include specific real-world examples' : 'Quantify your achievements when possible',
                words < 60 ? 'Expand your answer with more detail' : 'Consider using the STAR method for structure'
            ]
        };
    },

    _defaultEvaluation() {
        return {
            score: 50, relevance: 50, clarity: 50, depth: 50,
            feedback: 'Answer recorded. Provide more detailed responses for better evaluation.',
            strengths: ['Attempted to answer the question'],
            improvements: ['Provide more detailed responses', 'Use specific examples']
        };
    },

    _defaultReportSummary(avgScore) {
        const level = avgScore >= 75 ? 'strong' : avgScore >= 50 ? 'moderate' : 'developing';
        return {
            overallFeedback: `The candidate demonstrated ${level} performance across the interview. With continued practice and focused preparation, there is clear potential for growth.`,
            strengths: ['Willingness to engage with questions', 'Demonstrated some relevant knowledge', 'Completed the full interview session'],
            weaknesses: ['Answers could be more structured', 'More specific examples needed', 'Some technical areas need strengthening'],
            recommendations: ['Practice the STAR method for behavioral questions', 'Review core concepts in your target domain', 'Conduct more mock interviews to build confidence'],
            hiringSuitability: avgScore >= 75 ? 'Strong Candidate' : avgScore >= 50 ? 'Moderate Candidate' : 'Needs Improvement'
        };
    },

    // ── Fallback Question Bank ────────────────
    _getFallbackQuestions(type, difficulty, role, count) {
        const questionBank = {
            hr: [
                { question: "Tell me about yourself and your professional background.", category: "behavioral", expectedDuration: 120 },
                { question: "What are your greatest strengths and how have they contributed to your success?", category: "behavioral", expectedDuration: 90 },
                { question: "Describe a challenging situation you faced at work and how you overcame it.", category: "situational", expectedDuration: 120 },
                { question: "Where do you see yourself in 5 years?", category: "behavioral", expectedDuration: 90 },
                { question: "Why are you interested in this role and our company?", category: "behavioral", expectedDuration: 90 },
                { question: "Tell me about a time you worked successfully in a team.", category: "behavioral", expectedDuration: 120 },
                { question: "How do you handle pressure and tight deadlines?", category: "situational", expectedDuration: 90 },
                { question: "Describe a time you showed leadership, even without a formal title.", category: "behavioral", expectedDuration: 120 },
                { question: "What motivates you in your work?", category: "behavioral", expectedDuration: 75 },
                { question: "Tell me about a time you made a mistake and what you learned from it.", category: "behavioral", expectedDuration: 120 }
            ],
            technical: [
                { question: `Explain the concept of Object-Oriented Programming and its four main principles.`, category: "technical", expectedDuration: 120 },
                { question: `What is the difference between REST and GraphQL APIs?`, category: "technical", expectedDuration: 90 },
                { question: `How would you optimize a slow database query?`, category: "technical", expectedDuration: 120 },
                { question: `Explain the concept of Big O notation with examples.`, category: "technical", expectedDuration: 120 },
                { question: `What are design patterns? Describe three you've used.`, category: "technical", expectedDuration: 150 },
                { question: `How does garbage collection work in modern programming languages?`, category: "technical", expectedDuration: 90 },
                { question: `Explain the difference between SQL and NoSQL databases. When would you use each?`, category: "technical", expectedDuration: 120 },
                { question: `What is CI/CD and why is it important in modern software development?`, category: "technical", expectedDuration: 90 },
                { question: `How would you approach debugging a production issue with no logs?`, category: "technical", expectedDuration: 120 },
                { question: `What is microservices architecture and what are its trade-offs?`, category: "technical", expectedDuration: 150 }
            ],
            aptitude: [
                { question: "If a train travels 120 km at 60 km/h and then 80 km at 40 km/h, what is the average speed for the whole journey?", category: "aptitude", expectedDuration: 90 },
                { question: "How many unique paths are there from the top-left to the bottom-right of a 3×3 grid, moving only right or down?", category: "aptitude", expectedDuration: 90 },
                { question: "A shop gives 20% discount on an item. A customer also has a coupon for an additional 10% off. What is the total effective discount?", category: "aptitude", expectedDuration: 75 },
                { question: "If 5 machines can make 5 widgets in 5 minutes, how many minutes would it take 100 machines to make 100 widgets?", category: "aptitude", expectedDuration: 75 },
                { question: "Arrange these numbers in a pattern and find the next: 2, 6, 12, 20, 30, __", category: "aptitude", expectedDuration: 60 },
                { question: "A man walks 3 km north, then 4 km east. How far is he from his starting point?", category: "aptitude", expectedDuration: 75 },
                { question: "What comes next in the series: A, C, F, J, O, __?", category: "aptitude", expectedDuration: 60 },
                { question: "If all Bloops are Razzles and all Razzles are Lazzles, are all Bloops definitely Lazzles?", category: "aptitude", expectedDuration: 60 },
                { question: "A project requires 10 people working 8 hours per day for 5 days. If only 8 people are available, how many days will the project take?", category: "aptitude", expectedDuration: 90 },
                { question: "Find the odd one out: 121, 144, 169, 196, 200, 225", category: "aptitude", expectedDuration: 60 }
            ],
            mixed: []
        };

        if (type === 'mixed') {
            const allQ = [
                ...questionBank.hr.slice(0, 4),
                ...questionBank.technical.slice(0, 3),
                ...questionBank.aptitude.slice(0, 3)
            ];
            return this._shuffle(allQ).slice(0, count);
        }

        const pool = questionBank[type] || questionBank.hr;
        return this._shuffle(pool).slice(0, Math.min(count, pool.length));
    },

    _shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
};

window.HuggingFace = HuggingFace;
