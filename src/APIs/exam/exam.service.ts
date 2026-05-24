import { CustomError } from '../../utils/errors'
import { extractText, OcrMode } from '../../services/ocr'
import { gradeExam } from '../../services/grading'
import ExamRecord from './exam.model'
import testRepository from './test.repository'
import { IExamRecord, IExamQuestion, ITestWithCount, ITestResults } from './types/exam.interface'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../../handlers/logger') as { default: typeof import('../../handlers/logger').default }).default

const resolveTestId = async (testId?: string, testName?: string): Promise<string> => {
    if (testId) {
        const test = await testRepository.findById(testId)
        if (!test) throw new CustomError('Test not found', 404)
        return testId
    }
    if (testName?.trim()) {
        const test = await testRepository.create(testName.trim())
        return String(test._id)
    }
    throw new CustomError('Either testId or testName is required', 422)
}

export const gradeExamFiles = async (
    answerKeyBuffer: Buffer,
    studentPaperBuffer: Buffer,
    mode: OcrMode,
    studentName: string,
    testId?: string,
    testName?: string
): Promise<IExamRecord> => {
    if (!studentName?.trim()) throw new CustomError('Student name is required', 422)

    const resolvedTestId = await resolveTestId(testId, testName)

    let answerKeyText: string
    let studentPaperText: string

    try {
        const keyResult = await extractText(answerKeyBuffer, mode)
        answerKeyText = keyResult.text
    } catch (err) {
        logger.error('OCR extraction failed for answer key', { meta: { err } })
        throw new CustomError('Could not extract text from answer key.', 422)
    }

    try {
        const paperResult = await extractText(studentPaperBuffer, mode)
        studentPaperText = paperResult.text
    } catch (err) {
        logger.error('OCR extraction failed for student paper', { meta: { err } })
        throw new CustomError('Could not extract text from student paper.', 422)
    }

    const grading = await gradeExam(answerKeyText, studentPaperText)
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

    return record.toObject() as IExamRecord
}

export const listTests = async (): Promise<ITestWithCount[]> => {
    return testRepository.listWithCounts()
}

export const getTestResults = async (testId: string): Promise<ITestResults> => {
    const results = await testRepository.getResults(testId)
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

export const editExamRecord = async (recordId: string, questions: IExamQuestion[]): Promise<IExamRecord> => {
    const { totalScore, maxScore, percentage } = recomputeScores(questions)
    const record = await ExamRecord.findByIdAndUpdate(
        recordId,
        { $set: { questions, totalScore, maxScore, percentage } },
        { new: true, runValidators: true }
    ).lean()
    if (!record) throw new CustomError('Record not found', 404)
    return record as unknown as IExamRecord
}
