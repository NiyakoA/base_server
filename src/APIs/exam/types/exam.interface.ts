import { OcrMode } from '../../../services/ocr'

export interface IExamQuestion {
    number: number
    correctAnswer: string
    studentAnswer: string
    score: 'correct' | 'partial' | 'wrong'
    feedback: string
}

export interface IGradingResult {
    totalScore: number
    maxScore: number
    questions: IExamQuestion[]
}

export interface IExamRecord extends IGradingResult {
    mode: OcrMode
    answerKeyText: string
    studentPaperText: string
    percentage: number
}
