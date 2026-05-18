import { Router } from 'express'
import ocrController from './ocr.controller'
import authenticate from '../../middlewares/authenticate'
import upload from '../../middlewares/upload'
import rateLimiter from '../../middlewares/rateLimiter'

const router = Router()

router.route('/ocr/extract').post(rateLimiter, authenticate, upload.single('image'), ocrController.extract)

export default router
