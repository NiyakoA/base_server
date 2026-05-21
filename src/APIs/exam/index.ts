import { Router } from 'express'
import examController from './exam.controller'
import upload from '../../middlewares/upload'
import rateLimiter from '../../middlewares/rateLimiter'

const router = Router()

router.route('/exam/grade').post(
    rateLimiter,
    upload.fields([
        { name: 'answerKey', maxCount: 1 },
        { name: 'studentPaper', maxCount: 1 }
    ]),
    examController.grade
)

export default router
