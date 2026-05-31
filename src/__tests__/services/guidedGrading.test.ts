// src/__tests__/services/guidedGrading.test.ts
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: jest.fn() } })) }))
jest.mock('../../handlers/logger', () => ({ default: { info: jest.fn(), error: jest.fn() } }))

import { extractLocalKeywords, scorePages, computeIdf, trimToContextBudget } from '../../services/guidedGrading'
import { IGuidePage } from '../../APIs/exam/types/exam.interface'

const makePage = (pageNumber: number, text: string, source = 'guide.pdf'): IGuidePage => ({ pageNumber, text, source })

describe('extractLocalKeywords', () => {
    it('strips stop words', () => {
        const kw = extractLocalKeywords('What is the process of photosynthesis')
        expect(kw).toContain('photosynthesi') // stemmed
        expect(kw).not.toContain('what')
        expect(kw).not.toContain('the')
        expect(kw).not.toContain('process') // domain generic
    })

    it('deduplicates', () => {
        const kw = extractLocalKeywords('mitochondria mitochondria ATP')
        expect(kw.filter((k) => k.includes('mitochondri')).length).toBe(1)
    })
})

describe('scorePages', () => {
    const pages = [
        makePage(1, 'Mitochondria produce ATP through cellular respiration.'),
        makePage(2, 'Photosynthesis converts sunlight into glucose using chlorophyll.'),
        makePage(3, 'The cell membrane controls what enters and exits the cell.')
    ]
    const idf = computeIdf(pages)

    it('scores highest for most relevant page', () => {
        const keywords = ['mitochondria', 'atp', 'respir']
        const scored = scorePages(keywords, pages, idf)
        const sorted = scored.sort((a, b) => b.score - a.score)
        expect(sorted[0].page.pageNumber).toBe(1)
    })

    it('returns rawHits of 0 for unrelated page', () => {
        const keywords = ['mitochondria', 'atp']
        const scored = scorePages(keywords, pages, idf)
        const p3 = scored.find((s) => s.page.pageNumber === 3)!
        expect(p3.rawHits).toBe(0)
    })
})

describe('trimToContextBudget', () => {
    it('removes pages from the question with the most pages first', () => {
        const bigText = 'x'.repeat(200_000)
        const qPages = [
            { qNum: 1, pages: [makePage(1, bigText), makePage(2, bigText), makePage(3, bigText), makePage(4, bigText)], scores: [4, 3, 2, 1] },
            { qNum: 2, pages: [makePage(5, bigText)], scores: [5] }
        ]
        const result = trimToContextBudget(qPages, 600_000)
        // Q1 had 4 pages × 200K = 800K, Q2 had 1 × 200K = 200K, total 1M > 600K budget
        // Should trim Q1 (most pages) first
        expect(result[0].pages.length).toBeLessThan(4)
        expect(result[1].pages.length).toBe(1) // Q2 untouched
    })

    it('never trims a question below 1 page if it had content', () => {
        const bigText = 'x'.repeat(500_000)
        const qPages = [
            { qNum: 1, pages: [makePage(1, bigText)], scores: [1] },
            { qNum: 2, pages: [makePage(2, bigText)], scores: [1] }
        ]
        const result = trimToContextBudget(qPages, 400_000)
        // Both questions each keep their 1 page even though total > budget
        expect(result[0].pages.length).toBe(1)
        expect(result[1].pages.length).toBe(1)
    })
})
