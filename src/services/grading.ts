// src/services/grading.ts
import { CustomError } from '../utils/errors'
import { IGradingResult } from '../APIs/exam/types/exam.interface'

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
- Match each question in the student paper to the corresponding answer in the key.
- For each question assign a score: "correct", "partial", or "wrong".
- Write a one-sentence feedback explaining any mistake (leave empty string if correct).
- Count totalScore (correct=1, partial=0.5, wrong=0) and maxScore (total questions).

Respond with ONLY valid JSON in this exact shape:
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
        throw new CustomError('Student paper text is empty — OCR may have failed.', 422)
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

    logger.info('Exam graded', {
        meta: { totalScore: parsed.totalScore, maxScore: parsed.maxScore, questions: parsed.questions.length }
    })

    return parsed
}
