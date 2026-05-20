// src/services/ocr.ts
import { CustomError } from '../utils/errors'

// require() bypasses ts-jest's __importDefault wrapping, which double-nests
// the default export when the Jest mock factory omits __esModule:true.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../handlers/logger') as { default: typeof import('../handlers/logger').default }).default

const TROCR_URL = process.env.TROCR_URL ?? 'http://localhost:5001'

export interface IOcrResult {
    text: string
    confidence: number
    processingTimeMs: number
    pipeline: string
}

export interface IOcrBatchItem extends IOcrResult {
    originalname: string
    index: number
}

export const extractText = async (imageBuffer: Buffer): Promise<IOcrResult> => {
    const form = new FormData()
    form.append('image', new Blob([imageBuffer]), 'image.bin')

    let response: Response
    try {
        response = await fetch(`${TROCR_URL}/extract`, { method: 'POST', body: form })
    } catch {
        throw new CustomError('OCR service unavailable', 503)
    }

    if (response.status === 422) {
        throw new CustomError('No image provided', 422)
    }

    if (!response.ok) {
        throw new CustomError('Extraction failed', 500)
    }

    const data = (await response.json()) as { text: string; confidence: number; processingTimeMs: number }

    logger.info('OCR extraction complete', {
        meta: { confidence: data.confidence, pipeline: 'trocr', processingTimeMs: data.processingTimeMs }
    })

    return {
        text: data.text,
        confidence: data.confidence,
        processingTimeMs: data.processingTimeMs,
        pipeline: 'trocr'
    }
}

// Runs all files concurrently — throttled naturally by the TrOCR service's GPU.
export const extractBatch = async (files: Array<{ buffer: Buffer; originalname: string }>): Promise<IOcrBatchItem[]> => {
    const results = await Promise.all(
        files.map(async ({ buffer, originalname }, index) => {
            const result = await extractText(buffer)
            return { ...result, originalname, index }
        })
    )
    return results.sort((a, b) => a.index - b.index)
}
