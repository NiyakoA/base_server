import path from 'path'
import { createWorker } from 'tesseract.js'

type OcrWorker = Awaited<ReturnType<typeof createWorker>>

export type PoolWorker = {
    worker: OcrWorker
    busy: boolean
}

const TESSDATA_DIR = path.join(process.cwd(), 'tessdata')
const POOL_SIZE = 3

const pool: PoolWorker[] = []
const waitQueue: Array<(pw: PoolWorker) => void> = []

export const initPool = async (): Promise<void> => {
    for (let i = 0; i < POOL_SIZE; i++) {
        const worker = await createWorker('eng', 1, { cachePath: TESSDATA_DIR })
        pool.push({ worker, busy: false })
    }
}

export const acquire = (): Promise<PoolWorker> => {
    const free = pool.find((pw) => !pw.busy)
    if (free) {
        free.busy = true
        return Promise.resolve(free)
    }
    return new Promise((resolve) => waitQueue.push(resolve))
}

export const release = (pw: PoolWorker): void => {
    if (waitQueue.length > 0) {
        const next = waitQueue.shift()!
        next(pw)
    } else {
        pw.busy = false
    }
}

export const shutdownPool = async (): Promise<void> => {
    await Promise.all(pool.map((pw) => pw.worker.terminate()))
    pool.length = 0
    waitQueue.length = 0
}
