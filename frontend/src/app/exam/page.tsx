'use client'

import { useState } from 'react'
import { apiUpload } from '@/lib/api'
import ExamResult from '@/components/ExamResult'
import { GradeResult } from '@/types/exam'

type OcrMode = 'handwritten' | 'printed'

const ERROR_MESSAGES: Record<number, string> = {
    413: 'File too large — max 10 MB',
    422: 'Could not process files — ensure both are clear and readable',
    503: 'Grading service unavailable — make sure the Python OCR service is running',
    500: 'Grading failed'
}

export default function ExamPage() {
    const [answerKey, setAnswerKey] = useState<File | null>(null)
    const [studentPaper, setStudentPaper] = useState<File | null>(null)
    const [mode, setMode] = useState<OcrMode>('printed')
    const [result, setResult] = useState<GradeResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleGrade() {
        if (!answerKey || !studentPaper) return
        setError(null)
        setResult(null)
        setLoading(true)

        try {
            const form = new FormData()
            form.append('answerKey', answerKey)
            form.append('studentPaper', studentPaper)
            form.append('mode', mode)
            const res = await apiUpload<GradeResult>('/v1/exam/grade', form)
            setResult(res.data)
        } catch (err) {
            const status = (err as Error & { status?: number }).status ?? 500
            setError(ERROR_MESSAGES[status] ?? ERROR_MESSAGES[500])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="bg-[#16213e] rounded-lg px-4 py-3 mb-6">
                <span className="text-[#4cc9f0] font-bold">✦ Exam Grader</span>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex gap-2">
                    {(['printed', 'handwritten'] as OcrMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            disabled={loading}
                            className={[
                                'px-4 py-1.5 rounded text-sm font-medium transition-colors',
                                mode === m
                                    ? 'bg-[#4cc9f0] text-[#0f0e17]'
                                    : 'bg-[#16213e] text-[#aaa] hover:text-[#4cc9f0]'
                            ].join(' ')}
                        >
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: 'Answer Key', file: answerKey, set: setAnswerKey },
                        { label: 'Student Paper', file: studentPaper, set: setStudentPaper }
                    ].map(({ label, file, set }) => (
                        <label
                            key={label}
                            className={[
                                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                                file ? 'border-[#4cc9f0] bg-[#0f3460]/20' : 'border-[#4cc9f0]/40 hover:border-[#4cc9f0]'
                            ].join(' ')}
                        >
                            <div className="text-2xl mb-2">📄</div>
                            <p className="text-sm text-[#4cc9f0] font-medium mb-1">{label}</p>
                            <p className="text-xs text-[#555] truncate">
                                {file ? file.name : 'Click to upload'}
                            </p>
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/tiff,application/pdf"
                                className="hidden"
                                disabled={loading}
                                onChange={e => set(e.target.files?.[0] ?? null)}
                            />
                        </label>
                    ))}
                </div>

                <button
                    onClick={handleGrade}
                    disabled={!answerKey || !studentPaper || loading}
                    className="bg-[#4cc9f0] text-[#0f0e17] font-semibold py-2 px-6 rounded transition-opacity disabled:opacity-40"
                >
                    {loading ? 'Grading...' : 'Grade'}
                </button>

                {error && <p className="text-center text-sm text-[#e94560]">{error}</p>}
                {result && <ExamResult {...result} />}
            </div>
        </div>
    )
}
