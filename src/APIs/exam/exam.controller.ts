import { NextFunction, Request, Response } from 'express'
import httpResponse from '../../handlers/httpResponse'
import httpError from '../../handlers/errorHandler/httpError'
import asyncHandler from '../../handlers/async'
import { CustomError } from '../../utils/errors'
import { OcrMode } from '../../services/ocr'
import { IAuthenticateRequest } from '../../types/types'
import { gradeExamFiles, listTests, getTestResults, editExamRecord } from './exam.service'

export default {
    grade: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const files = request.files as Record<string, Express.Multer.File[]> | undefined
            const answerKey = files?.['answerKey']?.[0]
            const studentPaper = files?.['studentPaper']?.[0]

            if (!studentPaper) {
                throw new CustomError('Student paper file is required.', 422)
            }

            const userId = (request as IAuthenticateRequest).authenticatedUser._id.toString()
            const body = request.body as { mode?: OcrMode; studentName?: string; testId?: string; testName?: string }
            const mode: OcrMode = body.mode ?? 'printed'
            const result = await gradeExamFiles(
                answerKey?.buffer ?? null,
                studentPaper.buffer,
                mode,
                body.studentName ?? '',
                userId,
                body.testId,
                body.testName
            )

            httpResponse(response, request, 200, 'Exam graded successfully', result)
        } catch (error) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode)
            } else {
                httpError(next, error, request, 500)
            }
        }
    }),

    tests: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const userId = (request as IAuthenticateRequest).authenticatedUser._id.toString()
            const tests = await listTests(userId)
            httpResponse(response, request, 200, 'Tests retrieved successfully', tests)
        } catch (error) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode)
            } else {
                httpError(next, error, request, 500)
            }
        }
    }),

    testResults: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const userId = (request as IAuthenticateRequest).authenticatedUser._id.toString()
            const { testId } = request.params
            const results = await getTestResults(testId, userId)
            httpResponse(response, request, 200, 'Test results retrieved successfully', results)
        } catch (error) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode)
            } else {
                httpError(next, error, request, 500)
            }
        }
    }),

    editRecord: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            const userId = (request as IAuthenticateRequest).authenticatedUser._id.toString()
            const { recordId } = request.params
            const { questions } = request.body as { questions: Parameters<typeof editExamRecord>[1] }
            const record = await editExamRecord(recordId, questions, userId)
            httpResponse(response, request, 200, 'Record updated successfully', record)
        } catch (error) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode)
            } else {
                httpError(next, error, request, 500)
            }
        }
    })
}
