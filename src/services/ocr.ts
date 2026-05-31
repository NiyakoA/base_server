// src/services/ocr.ts
import { CustomError } from '../utils/errors'

// require() bypasses ts-jest's __importDefault wrapping, which double-nests
// the default export when the Jest mock factory omits __esModule:true.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../handlers/logger') as { default: typeof import('../handlers/logger').default }).default

const TROCR_URL = process.env.TROCR_URL ?? 'http://localhost:5001'

export type OcrMode = 'handwritten' | 'printed'

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

export type DocumentType = 'answer_key' | 'student_paper'

export const extractText = async (
    imageBuffer: Buffer,
    mode: OcrMode = 'handwritten',
    documentType: DocumentType = 'student_paper'
): Promise<IOcrResult> => {
    const form = new FormData()
    form.append('image', new Blob([imageBuffer]), 'image.bin')
    form.append('mode', mode)
    form.append('documentType', documentType)

    let response: Response
    try {
        response = await fetch(`${TROCR_URL}/extract`, { method: 'POST', body: form })
    } catch {
        throw new CustomError('OCR service unavailable', 503)
    }

    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new CustomError(body.error ?? `OCR service error (${response.status})`, response.status === 422 ? 422 : 500)
    }

    const data = (await response.json()) as {
        text: string
        confidence: number
        processingTimeMs: number
        pipeline: string
    }

    logger.info('OCR extraction complete', {
        meta: { confidence: data.confidence, pipeline: data.pipeline, processingTimeMs: data.processingTimeMs, mode }
    })

    return {
        text: data.text,
        confidence: data.confidence,
        processingTimeMs: data.processingTimeMs,
        pipeline: data.pipeline
    }
}

// Runs all files concurrently — throttled naturally by the OCR service's GPU.
export const extractBatch = async (
    files: Array<{ buffer: Buffer; originalname: string }>,
    mode: OcrMode = 'handwritten'
): Promise<IOcrBatchItem[]> => {
    const results = await Promise.all(
        files.map(async ({ buffer, originalname }, index) => {
            const result = await extractText(buffer, mode)
            return { ...result, originalname, index }
        })
    )
    return results.sort((a, b) => a.index - b.index)
}
