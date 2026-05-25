import mongoose from 'mongoose'
import { ITest } from './types/exam.interface'

const testSchema = new mongoose.Schema<ITest>(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true, trim: true }
    },
    { timestamps: true }
)

export default mongoose.model<ITest>('Test', testSchema)
