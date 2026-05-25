import mongoose from 'mongoose'
import TestModel from './test.model'
import ExamRecord from './exam.model'
import { ITest, ITestWithCount, ITestResults, ITestStats, IExamRecord } from './types/exam.interface'

const testRepository = {
    create: async (name: string, userId: string): Promise<ITest> => {
        const doc = await TestModel.create({ name, userId })
        return doc.toObject() as ITest
    },

    findById: async (id: string, userId: string): Promise<ITest | null> => {
        return TestModel.findOne({ _id: id, userId }).lean() as Promise<ITest | null>
    },

    listWithCounts: async (userId: string): Promise<ITestWithCount[]> => {
        const tests = await TestModel.find({ userId }).sort({ createdAt: -1 }).lean()
        const testIds = tests.map((t) => t._id)
        const counts = await ExamRecord.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
            { $match: { testId: { $in: testIds } } },
            { $group: { _id: '$testId', count: { $sum: 1 } } }
        ])
        const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]))
        return tests.map((t) => ({
            ...t,
            studentCount: countMap.get(t._id?.toString() ?? '') ?? 0
        }))
    },

    getResults: async (testId: string, userId: string): Promise<ITestResults | null> => {
        const test = await TestModel.findOne({ _id: testId, userId }).lean()
        if (!test) return null
        const records = await ExamRecord.find({ testId }).sort({ studentName: 1 }).lean()
        const percentages = records.map((r) => r.percentage)
        const stats: ITestStats =
            percentages.length === 0
                ? { avg: 0, high: 0, low: 0 }
                : {
                      avg: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
                      high: Math.max(...percentages),
                      low: Math.min(...percentages)
                  }
        return { test: test as ITest, stats, records: records as IExamRecord[] }
    }
}

export default testRepository
