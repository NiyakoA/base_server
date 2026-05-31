'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/auth'
import { apiFetch, apiUpload } from '@/lib/api'
import ExamResult from '@/components/ExamResult'
import { GradeResult, TestItem } from '@/types/exam'

type OcrMode = 'handwritten' | 'printed'

const ERROR_MESSAGES: Record<number, string> = {
    413: 'File too large — max 10 MB',
    422: 'Could not process files — ensure both are clear and readable',
    503: 'Grading service unavailable — make sure the Python OCR service is running',
    500: 'Grading failed'
}

export default function ExamPage() {
    const { user, loading } = useAuth()

    const [tests, setTests] = useState<TestItem[]>([])
    const [testsError, setTestsError] = useState<string | null>(null)
    const [selectedTestId, setSelectedTestId] = useState<string>('')
    const [newTestName, setNewTestName] = useState<string>('')

    const [studentName, setStudentName] = useState<string>('')
    const [answerKey, setAnswerKey] = useState<File | null>(null)
    const [studentPaper, setStudentPaper] = useState<File | null>(null)
    const [mode, setMode] = useState<OcrMode>('printed')
    const [result, setResult] = useState<GradeResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [grading, setGrading] = useState(false)

    useEffect(() => {
        if (!loading && !user) window.location.href = '/login'
    }, [user, loading])

    const loadTests = () => {
        apiFetch<TestItem[]>('/v1/exam/tests')
            .then(res => {
                setTests(res.data)
                setTestsError(null)
            })
            .catch((err: Error & { status?: number }) => {
                if (err.status === 401) { window.location.href = '/login'; return }
                setTestsError('Could not load tests — you can still create a new one below')
            })
    }

    useEffect(() => {
        if (user) loadTests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])

    const selectedTest = tests.find(t => t._id === selectedTestId) ?? null
    const isNewTest = selectedTestId === '__new__'
    const testReady = selectedTestId !== '' && (!isNewTest || newTestName.trim() !== '')
    // Answer key is optional when the selected test already has one saved
    const keyReady = answerKey !== null || (!isNewTest && selectedTest?.hasAnswerKey === true)
    const canGrade = testReady && studentName.trim() !== '' && keyReady && studentPaper !== null && !grading

    async function handleGrade() {
        if (!canGrade || !studentPaper) return
        setError(null)
        setResult(null)
        setGrading(true)
        try {
            const form = new FormData()
            if (answerKey) form.append('answerKey', answerKey)
            form.append('studentPaper', studentPaper)
            form.append('mode', mode)
            form.append('studentName', studentName.trim())
            if (isNewTest) {
                form.append('testName', newTestName.trim())
            } else {
                form.append('testId', selectedTestId)
            }
            const res = await apiUpload<GradeResult>('/v1/exam/grade', form)
            setResult(res.data)
            setStudentName('')
            setStudentPaper(null)
            setAnswerKey(null)
            // Auto-select the test so subsequent students go to the same test
            setSelectedTestId(res.data.testId)
            setNewTestName('')
            loadTests()
        } catch (err) {
            const e = err as Error & { status?: number }
            const status = e.status ?? 500
            if (status === 401) {
                window.location.href = '/login'
                return
            }
            setError(e.message && e.message !== 'Internal Server Error' ? e.message : (ERROR_MESSAGES[status] ?? ERROR_MESSAGES[500]))
        } finally {
            setGrading(false)
        }
    }

    if (loading || !user) return null

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
                            disabled={grading}
                            className={[
                                'px-4 py-1.5 rounded text-sm font-medium transition-colors',
                                mode === m ? 'bg-[#4cc9f0] text-[#0f0e17]' : 'bg-[#16213e] text-[#aaa] hover:text-[#4cc9f0]'
                            ].join(' ')}
                        >
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                    ))}
                </div>

                {testsError && <p className="text-xs text-[#e94560]">{testsError}</p>}
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-[#aaa]">Test</label>
                    <select
                        value={selectedTestId}
                        onChange={e => { setSelectedTestId(e.target.value); setAnswerKey(null) }}
                        disabled={grading}
                        className="bg-[#16213e] text-[#ccc] border border-[#4cc9f0]/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#4cc9f0] disabled:opacity-40"
                    >
                        <option value="">— select a test —</option>
                        {tests.map(t => (
                            <option key={t._id} value={t._id}>{t.name}</option>
                        ))}
                        <option value="__new__">New test…</option>
                    </select>
                    {isNewTest && (
                        <input
                            type="text"
                            placeholder="New test name"
                            value={newTestName}
                            onChange={e => setNewTestName(e.target.value)}
                            disabled={grading}
                            className="bg-[#16213e] text-[#ccc] border border-[#4cc9f0]/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#4cc9f0] placeholder-[#555] disabled:opacity-40"
                        />
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm text-[#aaa]">Student Name</label>
                    <input
                        type="text"
                        placeholder="Enter student name"
                        value={studentName}
                        onChange={e => setStudentName(e.target.value)}
                        disabled={grading}
                        className="bg-[#16213e] text-[#ccc] border border-[#4cc9f0]/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#4cc9f0] placeholder-[#555] disabled:opacity-40"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Answer Key — optional if test already has one saved */}
                    <label
                        className={[
                            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                            answerKey
                                ? 'border-[#4cc9f0] bg-[#0f3460]/20'
                                : selectedTest?.hasAnswerKey
                                    ? 'border-[#4cc9f0]/60 bg-[#0f3460]/10'
                                    : 'border-[#4cc9f0]/40 hover:border-[#4cc9f0]'
                        ].join(' ')}
                    >
                        <div className="text-2xl mb-2">📄</div>
                        <p className="text-sm text-[#4cc9f0] font-medium mb-1">Answer Key</p>
                        <p className="text-xs text-[#555] truncate">
                            {answerKey
                                ? answerKey.name
                                : selectedTest?.hasAnswerKey
                                    ? '✓ Saved — drop to replace'
                                    : 'Click to upload'}
                        </p>
                        <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.tiff,.pdf,image/png,image/jpeg,image/webp,image/tiff,application/pdf"
                            className="hidden"
                            disabled={grading}
                            onChange={e => setAnswerKey(e.target.files?.[0] ?? null)}
                        />
                    </label>

                    {/* Student Paper */}
                    <label
                        className={[
                            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                            studentPaper ? 'border-[#4cc9f0] bg-[#0f3460]/20' : 'border-[#4cc9f0]/40 hover:border-[#4cc9f0]'
                        ].join(' ')}
                    >
                        <div className="text-2xl mb-2">📄</div>
                        <p className="text-sm text-[#4cc9f0] font-medium mb-1">Student Paper</p>
                        <p className="text-xs text-[#555] truncate">{studentPaper ? studentPaper.name : 'Click to upload'}</p>
                        <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.tiff,.pdf,image/png,image/jpeg,image/webp,image/tiff,application/pdf"
                            className="hidden"
                            disabled={grading}
                            onChange={e => setStudentPaper(e.target.files?.[0] ?? null)}
                        />
                    </label>
                </div>

                <button
                    onClick={handleGrade}
                    disabled={!canGrade}
                    className="bg-[#4cc9f0] text-[#0f0e17] font-semibold py-2 px-6 rounded transition-opacity disabled:opacity-40"
                >
                    {grading ? 'Grading...' : 'Grade'}
                </button>

                {error && <p className="text-center text-sm text-[#e94560]">{error}</p>}
                {result && <ExamResult {...result} />}
            </div>
        </div>
    )
}
