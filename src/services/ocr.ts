import path from 'path'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../handlers/logger') as { default: typeof import('../handlers/logger').default }).default

const TESSDATA_DIR = path.join(process.cwd(), 'tessdata')
const HIGH_CONFIDENCE_THRESHOLD = 85

export interface IOcrResult {
    text: string
    confidence: number
    processingTimeMs: number
    pipeline: string
}

type Pipeline = { name: string; fn: (buf: Buffer) => Promise<Buffer> }

const PIPELINES: Pipeline[] = [
    {
        name: 'baseline',
        fn: (buf) => sharp(buf).greyscale().normalise().sharpen().toBuffer()
    },
    {
        name: 'binarize',
        fn: (buf) => sharp(buf).greyscale().normalise().threshold(128).sharpen().toBuffer()
    },
    {
        name: 'denoise',
        fn: (buf) => sharp(buf).greyscale().blur(0.5).normalise().sharpen().toBuffer()
    },
    {
        name: 'high-contrast',
        fn: (buf) => sharp(buf).greyscale().gamma(1.5).normalise().sharpen().toBuffer()
    }
]

export const extractText = async (imageBuffer: Buffer): Promise<IOcrResult> => {
    const start = Date.now()
    const worker = await createWorker('eng', 1, { cachePath: TESSDATA_DIR })

    try {
        let best = { text: '', confidence: 0, pipeline: '' }

        for (const { name, fn } of PIPELINES) {
            const preprocessed = await fn(imageBuffer)
            const { data } = await worker.recognize(preprocessed)
            const confidence = Math.round(data.confidence)

            if (confidence > best.confidence) {
                best = { text: data.text.trim(), confidence, pipeline: name }
            }

            if (best.confidence >= HIGH_CONFIDENCE_THRESHOLD) break
        }

        const processingTimeMs = Date.now() - start

        logger.info('OCR extraction complete', {
            meta: { confidence: best.confidence, pipeline: best.pipeline, processingTimeMs }
        })

        return { ...best, processingTimeMs }
    } finally {
        await worker.terminate()
    }
}
