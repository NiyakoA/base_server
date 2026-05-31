import { OcrMode } from '../../../services/ocr'
import mongoose from 'mongoose'

export interface ITest {
    _id?: mongoose.Types.ObjectId
    userId: mongoose.Types.ObjectId | string
    name: string
    answerKey?: Buffer
    createdAt?: Date
}

export interface ITestWithCount extends Omit<ITest, 'answerKey'> {
    studentCount: number
    hasAnswerKey: boolean
}

export interface ITestStats {
    avg: number
    high: number
    low: number
}

export interface ITestResults {
    test: ITest
    stats: ITestStats
    records: IExamRecord[]
}

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
    _id?: mongoose.Types.ObjectId
    testId: mongoose.Types.ObjectId | string
    studentName: string
    mode: OcrMode
    answerKeyText: string
    studentPaperText: string
    percentage: number
    createdAt?: Date
}
