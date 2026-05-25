// src/services/grading.ts
import { CustomError } from '../utils/errors'
import { IExamQuestion, IGradingResult } from '../APIs/exam/types/exam.interface'

// require() bypasses ts-jest's __importDefault wrapping for both logger and genai
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../handlers/logger') as { default: typeof import('../handlers/logger').default }).default
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GoogleGenAI } = require('@google/genai') as typeof import('@google/genai')

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'models/gemini-flash-lite-latest'

// Lazy singleton — defer construction until first call so Jest mock factories
// are fully initialised before the GoogleGenAI constructor runs.
let _ai: InstanceType<typeof GoogleGenAI> | null = null
const getAI = (): InstanceType<typeof GoogleGenAI> => {
    if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' })
    return _ai
}

const buildPrompt = (answerKeyText: string, studentPaperText: string): string =>
    `
You are an exam grader. You will be given an answer key and a student's exam paper.

ANSWER KEY:
${answerKeyText}

STUDENT PAPER:
${studentPaperText}

Instructions:
- Include EVERY question from the answer key — do not skip any.
- For each question, copy the student's answer verbatim from the student paper. If the student left a question blank or you cannot find their answer, use an empty string "".
- Assign a score: "correct", "partial", or "wrong".
- Write a one-sentence feedback explaining any mistake (use empty string "" if correct).
- totalScore: correct=1, partial=0.5, wrong=0. maxScore = total number of questions.

Respond with ONLY valid JSON — no markdown, no explanation:
{
  "totalScore": number,
  "maxScore": number,
  "questions": [
    {
      "number": number,
      "correctAnswer": string,
      "studentAnswer": string,
      "score": "correct" | "partial" | "wrong",
      "feedback": string
    }
  ]
}
`.trim()

export const gradeExam = async (answerKeyText: string, studentPaperText: string): Promise<IGradingResult> => {
    if (!answerKeyText.trim()) {
        throw new CustomError('Answer key text is empty — OCR may have failed.', 422)
    }

    if (!studentPaperText.trim()) {
        throw new CustomError('No text detected on student paper — the page may be blank or unreadable.', 422)
    }

    let raw: string
    try {
        const response = await getAI().models.generateContent({
            model: GEMINI_MODEL,
            contents: buildPrompt(answerKeyText, studentPaperText)
        })
        raw = response.text ?? ''
    } catch {
        throw new CustomError('Grading service unavailable.', 503)
    }

    if (!raw.trim()) {
        throw new CustomError('Grading service returned an empty response.', 503)
    }

    // Strip markdown code fences Gemini sometimes adds
    const cleaned = raw
        .replace(/^```(?:json)?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim()

    let parsed: IGradingResult
    try {
        parsed = JSON.parse(cleaned) as IGradingResult
    } catch {
        logger.error('Gemini returned unparseable grading response', { meta: { raw } })
        throw new CustomError('Could not identify question structure — ensure the exam is clearly formatted.', 422)
    }

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        logger.error('Gemini returned structurally invalid grading response', { meta: { raw } })
        throw new CustomError('Could not identify question structure — ensure the exam is clearly formatted.', 422)
    }

    // Normalise each question so Mongoose enum/required constraints are always satisfied
    const VALID_SCORES = new Set<IExamQuestion['score']>(['correct', 'partial', 'wrong'])
    const questions: IExamQuestion[] = parsed.questions.map((raw, i) => {
        const q = raw as unknown as Record<string, unknown>
        const rawScore = String(q.score ?? '')
        return {
            number: typeof q.number === 'number' ? q.number : i + 1,
            correctAnswer: String(q.correctAnswer ?? q.correct_answer ?? ''),
            studentAnswer: String(q.studentAnswer ?? q.student_answer ?? ''),
            score: (VALID_SCORES.has(rawScore as IExamQuestion['score']) ? rawScore : 'wrong') as IExamQuestion['score'],
            feedback: String(q.feedback ?? '')
        }
    })

    // Recompute from individual question scores so the badge always matches the cards
    const scoreMap: Record<string, number> = { correct: 1, partial: 0.5, wrong: 0 }
    const totalScore = questions.reduce((sum, q) => sum + (scoreMap[q.score] ?? 0), 0)
    const maxScore = questions.length

    logger.info('Exam graded', { meta: { totalScore, maxScore, questions: maxScore } })

    return { ...parsed, totalScore, maxScore, questions }
}
