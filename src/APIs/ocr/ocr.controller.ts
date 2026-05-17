import { NextFunction, Request, Response } from 'express'
import httpResponse from '../../handlers/httpResponse'
import httpError from '../../handlers/errorHandler/httpError'
import asyncHandler from '../../handlers/async'
import { CustomError } from '../../utils/errors'
import { extractText } from '../../services/ocr'

export default {
    extract: asyncHandler(async (request: Request, response: Response, next: NextFunction) => {
        try {
            if (!request.file) {
                throw new CustomError('No image file provided. Send a file under the "image" field.', 422)
            }

            const result = await extractText(request.file.buffer)

            httpResponse(response, request, 200, 'Text extracted successfully', result)
        } catch (error) {
            if (error instanceof CustomError) {
                httpError(next, error, request, error.statusCode)
            } else {
                httpError(next, error, request, 500)
            }
        }
    })
}
