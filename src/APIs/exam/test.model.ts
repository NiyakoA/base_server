import mongoose from 'mongoose'
import { ITest } from './types/exam.interface'

const testSchema = new mongoose.Schema<ITest>({ name: { type: String, required: true, trim: true } }, { timestamps: true })

export default mongoose.model<ITest>('Test', testSchema)
