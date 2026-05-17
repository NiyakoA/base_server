import path from 'path'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'
import logger from '../handlers/logger'

const TESSDATA_DIR = path.join(process.cwd(), 'tessdata')

export interface IOcrResult {
    text: string
    confidence: number
    processingTimeMs: number
}

const preprocessImage = (buffer: Buffer): Promise<Buffer> => {
    return sharp(buffer)
        .greyscale()
        .normalise()
        .sharpen()
        .toBuffer()
}

export const extractText = async (imageBuffer: Buffer): Promise<IOcrResult> => {
    const start = Date.now()

    const preprocessed = await preprocessImage(imageBuffer)

    const worker = await createWorker('eng', 1, { cachePath: TESSDATA_DIR })
    try {
        const { data } = await worker.recognize(preprocessed)
        const processingTimeMs = Date.now() - start

        logger.info('OCR extraction complete', {
            meta: { confidence: data.confidence, processingTimeMs }
        })

        return {
            text: data.text.trim(),
            confidence: Math.round(data.confidence),
            processingTimeMs
        }
    } finally {
        await worker.terminate()
    }
}
