import { createWorker } from 'tesseract.js'
import { extractText, IOcrResult } from '../../services/ocr'

jest.mock('../../handlers/logger', () => ({
    default: { info: jest.fn(), error: jest.fn() }
}))

jest.mock('sharp', () => {
    const instance = {
        greyscale: jest.fn().mockReturnThis(),
        normalise: jest.fn().mockReturnThis(),
        sharpen: jest.fn().mockReturnThis(),
        threshold: jest.fn().mockReturnThis(),
        blur: jest.fn().mockReturnThis(),
        gamma: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        // metadata returns large dimensions so the upscale step is skipped in tests
        metadata: jest.fn().mockResolvedValue({ width: 3000, height: 2000 }),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed'))
    }
    return Object.assign(
        jest.fn(() => instance),
        {
            kernel: { lanczos3: 'lanczos3' }
        }
    )
})

jest.mock('tesseract.js', () => ({
    createWorker: jest.fn(),
    PSM: { SINGLE_BLOCK: '6', SPARSE_TEXT: '11' }
}))

const mockCreateWorker = createWorker as jest.MockedFunction<typeof createWorker>

// Pipelines execute in this order (preprocessing × PSM):
// baseline-psm6, baseline-psm11, binarize-psm6, binarize-psm11,
// denoise-psm6, denoise-psm11, high-contrast-psm6, high-contrast-psm11
// One worker is created per extractText call; setParameters is called before each recognize.
describe('extractText', () => {
    const fakeBuffer = Buffer.from('fake-image')

    afterEach(() => jest.clearAllMocks())

    it('short-circuits and returns the first pipeline that hits >= 85% confidence', async () => {
        // baseline-psm6(60) → baseline-psm11(75) → binarize-psm6(90 ≥ 85, stop)
        const recognize = jest
            .fn()
            .mockResolvedValueOnce({ data: { text: 'baseline-psm6 text', confidence: 60 } })
            .mockResolvedValueOnce({ data: { text: 'baseline-psm11 text', confidence: 75 } })
            .mockResolvedValueOnce({ data: { text: 'binarize-psm6 text', confidence: 90 } })
        const setParameters = jest.fn().mockResolvedValue(undefined)
        const terminate = jest.fn().mockResolvedValue(undefined)
        mockCreateWorker.mockResolvedValue({ recognize, setParameters, terminate } as unknown as Awaited<ReturnType<typeof createWorker>>)

        const result: IOcrResult = await extractText(fakeBuffer)

        expect(result.text).toBe('binarize-psm6 text')
        expect(result.confidence).toBe(90)
        expect(result.pipeline).toBe('binarize-psm6')
        expect(recognize).toHaveBeenCalledTimes(3)
        expect(setParameters).toHaveBeenCalledTimes(3)
    })

    it('runs all 8 pipelines and returns the best when none exceeds threshold', async () => {
        const recognize = jest
            .fn()
            .mockResolvedValueOnce({ data: { text: 'text a', confidence: 50 } }) // baseline-psm6
            .mockResolvedValueOnce({ data: { text: 'text b', confidence: 72 } }) // baseline-psm11
            .mockResolvedValueOnce({ data: { text: 'text c', confidence: 65 } }) // binarize-psm6
            .mockResolvedValueOnce({ data: { text: 'text d', confidence: 40 } }) // binarize-psm11
            .mockResolvedValueOnce({ data: { text: 'text e', confidence: 30 } }) // denoise-psm6
            .mockResolvedValueOnce({ data: { text: 'text f', confidence: 55 } }) // denoise-psm11
            .mockResolvedValueOnce({ data: { text: 'text g', confidence: 60 } }) // high-contrast-psm6
            .mockResolvedValueOnce({ data: { text: 'text h', confidence: 45 } }) // high-contrast-psm11
        const setParameters = jest.fn().mockResolvedValue(undefined)
        const terminate = jest.fn().mockResolvedValue(undefined)
        mockCreateWorker.mockResolvedValue({ recognize, setParameters, terminate } as unknown as Awaited<ReturnType<typeof createWorker>>)

        const result: IOcrResult = await extractText(fakeBuffer)

        expect(result.text).toBe('text b')
        expect(result.confidence).toBe(72)
        expect(result.pipeline).toBe('baseline-psm11')
        expect(recognize).toHaveBeenCalledTimes(8)
        expect(setParameters).toHaveBeenCalledTimes(8)
    })

    it('always terminates the worker — even if a pipeline throws', async () => {
        const recognize = jest.fn().mockRejectedValue(new Error('tesseract failure'))
        const setParameters = jest.fn().mockResolvedValue(undefined)
        const terminate = jest.fn().mockResolvedValue(undefined)
        mockCreateWorker.mockResolvedValue({ recognize, setParameters, terminate } as unknown as Awaited<ReturnType<typeof createWorker>>)

        await expect(extractText(fakeBuffer)).rejects.toThrow('tesseract failure')
        expect(terminate).toHaveBeenCalledTimes(1)
    })
})
