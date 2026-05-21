import { NextFunction, Request, Response } from 'express'
import httpResponse from '../../handlers/httpResponse'
import httpError from '../../handlers/errorHandler/httpError'
import asyncHandler from '../../handlers/async'
import { CustomError } from '../../utils/errors'
import { OcrMode } from '../../services/ocr'
import { gradeExamFiles } from './exam.service'

export default {
    grade: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const files = request.files as Record<string, Express.Multer.File[]> | undefined
            const answerKey = files?.['answerKey']?.[0]
            const studentPaper = files?.['studentPaper']?.[0]

            if (!answerKey || !studentPaper) {
                throw new CustomError('Both answer key and student paper files are required.', 422)
            }

            const mode: OcrMode = (request.body as { mode?: OcrMode } | undefined)?.mode ?? 'printed'
            const result = await gradeExamFiles(answerKey.buffer, studentPaper.buffer, mode)

            httpResponse(response, request, 200, 'Exam graded successfully', result)
        } catch (error) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode)
            } else {
                httpError(next, error, request, 500)
            }
        }
    })
}
