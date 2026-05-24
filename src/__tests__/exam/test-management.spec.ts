/* eslint-disable @typescript-eslint/no-unsafe-call */
import { gradeExamFiles, listTests, getTestResults, editExamRecord } from '../../APIs/exam/exam.service'

jest.mock('../../services/ocr', () => ({
    extractText: jest.fn().mockResolvedValue({ text: 'sample text', confidence: 0.95 })
}))

jest.mock('../../services/grading', () => ({
    gradeExam: jest.fn().mockResolvedValue({
        totalScore: 2,
        maxScore: 3,
        questions: [
            { number: 1, correctAnswer: 'A', studentAnswer: 'A', score: 'correct', feedback: '' },
            { number: 2, correctAnswer: 'B', studentAnswer: 'B', score: 'correct', feedback: '' },
            { number: 3, correctAnswer: 'C', studentAnswer: 'D', score: 'wrong', feedback: 'Wrong' }
        ]
    })
}))

jest.mock('../../handlers/logger', () => ({
    default: { info: jest.fn(), error: jest.fn() }
}))

const mockTestCreate = jest.fn()
const mockTestFindById = jest.fn()
const mockListWithCounts = jest.fn()
const mockGetResults = jest.fn()

jest.mock('../../APIs/exam/test.repository', () => ({
    default: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        create: (...args: unknown[]) => mockTestCreate(...args),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        findById: (...args: unknown[]) => mockTestFindById(...args),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        listWithCounts: (...args: unknown[]) => mockListWithCounts(...args),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        getResults: (...args: unknown[]) => mockGetResults(...args)
    }
}))

const mockRecordCreate = jest.fn()
const mockRecordFindByIdAndUpdate = jest.fn()

jest.mock('../../APIs/exam/exam.model', () => ({
    default: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        create: (...args: unknown[]) => mockRecordCreate(...args),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        findByIdAndUpdate: (...args: unknown[]) => mockRecordFindByIdAndUpdate(...args)
    }
}))

const buf = Buffer.from('test')

beforeEach(() => {
    jest.clearAllMocks()
    mockRecordCreate.mockResolvedValue({
        toObject: () => ({
            _id: 'rec-1',
            testId: 'test-id',
            studentName: 'Alice',
            totalScore: 2,
            maxScore: 3,
            percentage: 67,
            questions: []
        })
    })
})

describe('gradeExamFiles with test tracking', () => {
    it('creates a new test when testName is provided', async () => {
        mockTestCreate.mockResolvedValue({ _id: 'new-test-id', name: 'Chapter 5' })

        await gradeExamFiles(buf, buf, 'printed', 'Alice', undefined, 'Chapter 5')

        expect(mockTestCreate).toHaveBeenCalledWith('Chapter 5')
        expect(mockRecordCreate).toHaveBeenCalledWith(expect.objectContaining({ studentName: 'Alice', testId: 'new-test-id' }))
    })

    it('uses existing testId when provided', async () => {
        mockTestFindById.mockResolvedValue({ _id: 'existing-id', name: 'Midterm' })

        await gradeExamFiles(buf, buf, 'printed', 'Bob', 'existing-id')

        expect(mockTestCreate).not.toHaveBeenCalled()
        expect(mockRecordCreate).toHaveBeenCalledWith(expect.objectContaining({ testId: 'existing-id', studentName: 'Bob' }))
    })

    it('throws 422 when neither testId nor testName is provided', async () => {
        await expect(gradeExamFiles(buf, buf, 'printed', 'Alice')).rejects.toMatchObject({ statusCode: 422 })
    })

    it('throws 422 when studentName is empty', async () => {
        await expect(gradeExamFiles(buf, buf, 'printed', '')).rejects.toMatchObject({ statusCode: 422 })
    })

    it('throws 404 when testId does not exist', async () => {
        mockTestFindById.mockResolvedValue(null)

        await expect(gradeExamFiles(buf, buf, 'printed', 'Alice', 'bad-id')).rejects.toMatchObject({ statusCode: 404 })
    })
})

describe('listTests', () => {
    it('delegates to testRepository.listWithCounts', async () => {
        const tests = [{ _id: '1', name: 'Quiz', studentCount: 3 }]
        mockListWithCounts.mockResolvedValue(tests)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await listTests()

        expect(result).toEqual(tests)
    })
})

describe('getTestResults', () => {
    it('returns results when test exists', async () => {
        const payload = {
            test: { _id: '1', name: 'Quiz' },
            stats: { avg: 75, high: 95, low: 55 },
            records: []
        }
        mockGetResults.mockResolvedValue(payload)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await getTestResults('1')

        expect(result).toEqual(payload)
    })

    it('throws 404 when test not found', async () => {
        mockGetResults.mockResolvedValue(null)

        await expect(getTestResults('bad-id')).rejects.toMatchObject({ statusCode: 404 })
    })
})

describe('editExamRecord', () => {
    const questions = [
        { number: 1, correctAnswer: 'A', studentAnswer: 'A', score: 'correct' as const, feedback: '' },
        { number: 2, correctAnswer: 'B', studentAnswer: 'B', score: 'correct' as const, feedback: '' },
        { number: 3, correctAnswer: 'C', studentAnswer: 'D', score: 'wrong' as const, feedback: 'Wrong' }
    ]

    it('recomputes totalScore/maxScore/percentage and saves', async () => {
        const updated = { _id: 'rec-1', questions, totalScore: 2, maxScore: 3, percentage: 67 }
        mockRecordFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve(updated) })

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await editExamRecord('rec-1', questions)

        expect(mockRecordFindByIdAndUpdate).toHaveBeenCalledWith(
            'rec-1',
            { $set: { questions, totalScore: 2, maxScore: 3, percentage: 67 } },
            { new: true, runValidators: true }
        )
        expect(result).toEqual(updated)
    })

    it('throws 404 when record not found', async () => {
        mockRecordFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) })

        await expect(editExamRecord('rec-1', questions)).rejects.toMatchObject({ statusCode: 404 })
    })
})
