interface Question {
    number: number
    correctAnswer: string
    studentAnswer: string
    score: 'correct' | 'partial' | 'wrong'
    feedback: string
}

interface Props {
    totalScore: number
    maxScore: number
    percentage: number
    questions: Question[]
}

const SCORE_STYLES: Record<Question['score'], string> = {
    correct: 'bg-[#1a3a2a] text-[#68d391]',
    partial: 'bg-[#3a2e1a] text-[#f6ad55]',
    wrong: 'bg-[#3a1a1a] text-[#fc8181]'
}

export default function ExamResult({ totalScore, maxScore, percentage, questions }: Props) {
    return (
        <div className="flex flex-col gap-4">
            <div className="bg-[#16213e] rounded-lg p-4 flex items-center justify-between">
                <span className="text-[#4cc9f0] font-bold text-lg">
                    {totalScore} / {maxScore}
                </span>
                <span className={[
                    'text-sm font-medium px-3 py-1 rounded',
                    percentage >= 70 ? 'bg-[#1a3a2a] text-[#68d391]'
                    : percentage >= 50 ? 'bg-[#3a2e1a] text-[#f6ad55]'
                    : 'bg-[#3a1a1a] text-[#fc8181]'
                ].join(' ')}>
                    {percentage}%
                </span>
            </div>

            {questions.map(q => (
                <div key={q.number} className="bg-[#16213e] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[#888] text-xs">Question {q.number}</span>
                        <span className={`text-xs rounded px-2 py-0.5 ${SCORE_STYLES[q.score]}`}>
                            {q.score}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                        <div>
                            <p className="text-[#4cc9f0] text-xs mb-1">Correct answer</p>
                            <p className="text-[#ccc]">{q.correctAnswer}</p>
                        </div>
                        <div>
                            <p className="text-[#4cc9f0] text-xs mb-1">Student answer</p>
                            <p className="text-[#ccc]">{q.studentAnswer || '—'}</p>
                        </div>
                    </div>
                    {q.feedback && (
                        <p className="text-[#f6ad55] text-xs mt-2">{q.feedback}</p>
                    )}
                </div>
            ))}
        </div>
    )
}
