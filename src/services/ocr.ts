import path from 'path'
import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'

// require() bypasses ts-jest's __importDefault wrapping, which double-nests
// the default export when the Jest mock factory omits __esModule:true.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logger = (require('../handlers/logger') as { default: typeof import('../handlers/logger').default }).default

const TESSDATA_DIR = path.join(process.cwd(), 'tessdata')
const HIGH_CONFIDENCE_THRESHOLD = 85
// Tesseract needs ~300 DPI. Upscale images shorter than this on their longer edge.
const MIN_DIMENSION_PX = 2000

export interface IOcrResult {
    text: string
    confidence: number
    processingTimeMs: number
    pipeline: string
}

type PreprocessFn = (buf: Buffer) => Promise<Buffer>
type Pipeline = { name: string; fn: PreprocessFn; psm: PSM }

const upscale = async (buffer: Buffer): Promise<Buffer> => {
    const meta = await sharp(buffer).metadata()
    const longer = Math.max(meta.width ?? 0, meta.height ?? 0)
    if (longer >= MIN_DIMENSION_PX) return buffer
    const scale = MIN_DIMENSION_PX / longer
    return sharp(buffer)
        .resize({ width: Math.round((meta.width ?? 0) * scale), kernel: sharp.kernel.lanczos3 })
        .toBuffer()
}

const baseline: PreprocessFn = (buf) => sharp(buf).greyscale().normalise().sharpen().toBuffer()
const binarize: PreprocessFn = (buf) => sharp(buf).greyscale().normalise().threshold(128).sharpen().toBuffer()
const denoise: PreprocessFn = (buf) => sharp(buf).greyscale().blur(0.5).normalise().sharpen().toBuffer()
const highContrast: PreprocessFn = (buf) => sharp(buf).greyscale().gamma(1.5).normalise().sharpen().toBuffer()

// Each preprocessing strategy is tried with two PSM modes:
//   PSM 6 — single uniform block of text (good for structured handwriting)
//   PSM 11 — sparse text, find chars anywhere (good for freeform handwriting)
// Pipelines in order: baseline-psm6, baseline-psm11, binarize-psm6, binarize-psm11,
//                     denoise-psm6, denoise-psm11, high-contrast-psm6, high-contrast-psm11
const PIPELINES: Pipeline[] = [
    { name: 'baseline-psm6', fn: baseline, psm: PSM.SINGLE_BLOCK },
    { name: 'baseline-psm11', fn: baseline, psm: PSM.SPARSE_TEXT },
    { name: 'binarize-psm6', fn: binarize, psm: PSM.SINGLE_BLOCK },
    { name: 'binarize-psm11', fn: binarize, psm: PSM.SPARSE_TEXT },
    { name: 'denoise-psm6', fn: denoise, psm: PSM.SINGLE_BLOCK },
    { name: 'denoise-psm11', fn: denoise, psm: PSM.SPARSE_TEXT },
    { name: 'high-contrast-psm6', fn: highContrast, psm: PSM.SINGLE_BLOCK },
    { name: 'high-contrast-psm11', fn: highContrast, psm: PSM.SPARSE_TEXT }
]

export const extractText = async (imageBuffer: Buffer): Promise<IOcrResult> => {
    const start = Date.now()

    const upscaled = await upscale(imageBuffer)
    const worker = await createWorker('eng', 1, { cachePath: TESSDATA_DIR })

    try {
        let best = { text: '', confidence: 0, pipeline: '' }

        for (const { name, fn, psm } of PIPELINES) {
            await worker.setParameters({ tessedit_pageseg_mode: psm })
            const preprocessed = await fn(upscaled)
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
