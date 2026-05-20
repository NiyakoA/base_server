import { initRateLimiter } from '../config/rate-limiter'
import logger from '../handlers/logger'
import database from '../services/database'
import { initPool } from '../services/ocr-pool'

export async function bootstrap(): Promise<void> {
    try {
        const connection = await database.connect()
        logger.info(`Database connection established`, {
            meta: { CONNECTION_NAME: connection.name }
        })

        initRateLimiter(connection)
        logger.info(`Rate limiter initiated`)

        await initPool()
        logger.info(`OCR worker pool initialized`, { meta: {} })
    } catch (error) {
        logger.error(`Error during bootstrap:`, { meta: error })
        throw error
    }
}
