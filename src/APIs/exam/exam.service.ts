import { CustomError } from '../../utils/errors'
import { extractText, OcrMode } from '../../services/ocr'
import { gradeExam } from '../../services/grading'
import ExamRecord from './exam.model'
import testRepository from './test.repository'
import { IExamRecord, IExamQuestion, ITestWithCount, ITestResults } from './types/exam.interface'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../../handlers/logger') as { default: typeof import('../../handlers/logger').default }).default

const resolveTestId = async (testId: string | undefined, testName: string | undefined, userId: string): Promise<string> => {
    if (testId) {
        const test = await testRepository.findById(testId, userId)
        if (!test) throw new CustomError('Test not found', 404)
        return testId
    }
    if (testName?.trim()) {
        const test = await testRepository.create(testName.trim(), userId)
        return test._id!.toString()
    }
    throw new CustomError('Either testId or testName is required', 422)
}

export const gradeExamFiles = async (
    answerKeyBuffer: Buffer | null,
    studentPaperBuffer: Buffer,
    mode: OcrMode,
    studentName: string,
    userId: string,
    testId?: string,
    testName?: string
): Promise<IExamRecord & { testId: string }> => {
    if (!studentName?.trim()) throw new CustomError('Student name is required', 422)

    const resolvedTestId = await resolveTestId(testId, testName, userId)

    // Use provided key or fall back to the test's stored key
    let effectiveKeyBuffer: Buffer
    if (answerKeyBuffer) {
        effectiveKeyBuffer = answerKeyBuffer
        await testRepository.saveAnswerKey(resolvedTestId, userId, answerKeyBuffer)
    } else {
        const stored = await testRepository.getAnswerKey(resolvedTestId, userId)
        if (!stored) throw new CustomError('No answer key uploaded for this test — please upload one.', 422)
        effectiveKeyBuffer = stored
    }

    let answerKeyText: string
    let studentPaperText: string

    try {
        const keyResult = await extractText(effectiveKeyBuffer, mode, 'answer_key')
        answerKeyText = keyResult.text
    } catch (err) {
        logger.error('OCR extraction failed for answer key', { meta: { err } })
        const msg = err instanceof CustomError ? err.message : 'Could not extract text from answer key.'
        throw new CustomError(`Answer key: ${msg}`, 422)
    }

    try {
        const paperResult = await extractText(studentPaperBuffer, mode, 'student_paper')
        studentPaperText = paperResult.text
    } catch (err) {
        logger.error('OCR extraction failed for student paper', { meta: { err } })
        const msg = err instanceof CustomError ? err.message : 'Could not extract text from student paper.'
        throw new CustomError(`Student paper: ${msg}`, 422)
    }

    const grading = await gradeExam(answerKeyText, studentPaperText, mode)
    const percentage = grading.maxScore > 0 ? Math.round((grading.totalScore / grading.maxScore) * 100) : 0

    let record
    try {
        record = await ExamRecord.create({
            testId: resolvedTestId,
            studentName: studentName.trim(),
            mode,
            answerKeyText,
            studentPaperText,
            totalScore: grading.totalScore,
            maxScore: grading.maxScore,
            percentage,
            questions: grading.questions
        })
    } catch (err) {
        logger.error('Failed to save exam record', { meta: { err } })
        throw new CustomError('Grading failed — could not save result.', 500)
    }

    return { ...(record.toObject() as IExamRecord), testId: resolvedTestId }
}

export const listTests = async (userId: string): Promise<ITestWithCount[]> => {
    return testRepository.listWithCounts(userId)
}

export const getTestResults = async (testId: string, userId: string): Promise<ITestResults> => {
    const results = await testRepository.getResults(testId, userId)
    if (!results) throw new CustomError('Test not found', 404)
    return results
}

const recomputeScores = (questions: IExamQuestion[]) => {
    const maxScore = questions.length
    const totalScore = questions.reduce((sum, q) => {
        if (q.score === 'correct') return sum + 1
        if (q.score === 'partial') return sum + 0.5
        return sum
    }, 0)
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0
    return { totalScore, maxScore, percentage }
}

export const editExamRecord = async (recordId: string, questions: IExamQuestion[], userId: string): Promise<IExamRecord> => {
    const existing = await ExamRecord.findById(recordId).lean()
    if (!existing) throw new CustomError('Record not found', 404)
    const test = await testRepository.findById(existing.testId.toString(), userId)
    if (!test) throw new CustomError('Record not found', 404)
    const { totalScore, maxScore, percentage } = recomputeScores(questions)
    const record = await ExamRecord.findByIdAndUpdate(
        recordId,
        { $set: { questions, totalScore, maxScore, percentage } },
        { new: true, runValidators: true }
    ).lean()
    if (!record) throw new CustomError('Record not found', 404)
    return record as unknown as IExamRecord
}
