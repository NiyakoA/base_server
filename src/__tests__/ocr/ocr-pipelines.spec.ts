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
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed'))
        // extra methods for the 4 pipeline variants (used in Task 2 implementation)
    }
    return jest.fn(() => instance)
})

jest.mock('tesseract.js', () => ({ createWorker: jest.fn() }))

const mockCreateWorker = createWorker as jest.MockedFunction<typeof createWorker>

describe('extractText', () => {
    // Pipelines execute in this order: ['baseline', 'binarize', 'denoise', 'high-contrast']
    // One worker is created per extractText call and reused across all pipelines.
    const fakeBuffer = Buffer.from('fake-image')

    afterEach(() => jest.clearAllMocks())

    it('short-circuits and returns the first pipeline that hits >= 85% confidence', async () => {
        const recognize = jest.fn()
            .mockResolvedValueOnce({ data: { text: 'baseline text', confidence: 60 } })
            .mockResolvedValueOnce({ data: { text: 'binarize text', confidence: 75 } })
            .mockResolvedValueOnce({ data: { text: 'denoise text', confidence: 90 } })
            .mockResolvedValueOnce({ data: { text: 'high text', confidence: 50 } })
        const terminate = jest.fn().mockResolvedValue(undefined)
        mockCreateWorker.mockResolvedValue({ recognize, terminate } as unknown as Awaited<ReturnType<typeof createWorker>>)

        const result: IOcrResult = await extractText(fakeBuffer)

        expect(result.text).toBe('denoise text')
        expect(result.confidence).toBe(90)
        expect(result.pipeline).toBe('denoise')
        expect(recognize).toHaveBeenCalledTimes(3) // baseline(60) → binarize(75) → denoise(90 ≥ 85, stop)
    })

    it('runs all pipelines and returns the best when none exceeds threshold', async () => {
        const recognize = jest.fn()
            .mockResolvedValueOnce({ data: { text: 'text a', confidence: 50 } })
            .mockResolvedValueOnce({ data: { text: 'text b', confidence: 72 } })
            .mockResolvedValueOnce({ data: { text: 'text c', confidence: 65 } })
            .mockResolvedValueOnce({ data: { text: 'text d', confidence: 40 } })
        const terminate = jest.fn().mockResolvedValue(undefined)
        mockCreateWorker.mockResolvedValue({ recognize, terminate } as unknown as Awaited<ReturnType<typeof createWorker>>)

        const result: IOcrResult = await extractText(fakeBuffer)

        expect(result.text).toBe('text b')
        expect(result.confidence).toBe(72)
        expect(result.pipeline).toBe('binarize')
        expect(recognize).toHaveBeenCalledTimes(4)
    })

    it('always terminates the worker — even if a pipeline throws', async () => {
        const recognize = jest.fn().mockRejectedValue(new Error('tesseract failure'))
        const terminate = jest.fn().mockResolvedValue(undefined)
        mockCreateWorker.mockResolvedValue({ recognize, terminate } as unknown as Awaited<ReturnType<typeof createWorker>>)

        await expect(extractText(fakeBuffer)).rejects.toThrow('tesseract failure')
        expect(terminate).toHaveBeenCalledTimes(1)
    })
})
