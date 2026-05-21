import { CustomError } from '../../utils/errors'
import { extractText, OcrMode } from '../../services/ocr'
import { gradeExam } from '../../services/grading'
import ExamRecord from './exam.model'
import { IExamRecord } from './types/exam.interface'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../../handlers/logger') as { default: typeof import('../../handlers/logger').default }).default

export const gradeExamFiles = async (answerKeyBuffer: Buffer, studentPaperBuffer: Buffer, mode: OcrMode): Promise<IExamRecord> => {
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

    const record = await ExamRecord.create({
        mode,
        answerKeyText,
        studentPaperText,
        totalScore: grading.totalScore,
        maxScore: grading.maxScore,
        percentage,
        questions: grading.questions
    })

    return record.toObject() as IExamRecord
}
