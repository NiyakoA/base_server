export interface ExamQuestion {
    number: number
    correctAnswer: string
    studentAnswer: string
    score: 'correct' | 'partial' | 'wrong'
    feedback: string
}

export interface GradeResult {
    testId: string
    totalScore: number
    maxScore: number
    percentage: number
    questions: ExamQuestion[]
}

export interface TestItem {
    _id: string
    name: string
    studentCount: number
    hasAnswerKey: boolean
    createdAt?: string
}

export interface ExamRecord {
    _id: string
    testId: string
    studentName: string
    totalScore: number
    maxScore: number
    percentage: number
    questions: ExamQuestion[]
    createdAt?: string
}

export interface TestStats {
    avg: number
    high: number
    low: number
}

export interface TestResults {
    test: { _id: string; name: string }
    stats: TestStats
    records: ExamRecord[]
}
