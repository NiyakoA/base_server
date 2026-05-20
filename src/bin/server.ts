import app from '../app'
import { bootstrap } from '../bootstrap'
import config from '../config/config'
import logger from '../handlers/logger'
import { shutdownPool } from '../services/ocr-pool'

const server = app.listen(config.PORT)

void (async () => {
    try {
        await bootstrap().then(() => {
            logger.info(`Application started on port ${config.PORT}`, {
                meta: { SERVER_URL: config.SERVER_URL }
            })
        })
    } catch (error) {
        logger.error(`Error starting server:`, { meta: error })
        server.close((err) => {
            if (err) logger.error(`error`, { meta: error })
            process.exit(1)
        })
    }
})()

const shutdown = async () => {
    logger.info('Shutting down OCR worker pool...', { meta: {} })
    await shutdownPool()
    server.close(() => process.exit(0))
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
