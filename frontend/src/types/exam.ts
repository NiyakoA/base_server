export interface ExamQuestion {
    number: number
    correctAnswer: string
    studentAnswer: string
    score: 'correct' | 'partial' | 'wrong'
    feedback: string
}

export interface GradeResult {
    totalScore: number
    maxScore: number
    percentage: number
    questions: ExamQuestion[]
}
