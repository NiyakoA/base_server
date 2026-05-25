import { Router } from 'express'
import examController from './exam.controller'
import upload from '../../middlewares/upload'
import rateLimiter from '../../middlewares/rateLimiter'
import authenticate from '../../middlewares/authenticate'

const router = Router()

router.route('/exam/grade').post(
    rateLimiter,
    authenticate,
    upload.fields([
        { name: 'answerKey', maxCount: 1 },
        { name: 'studentPaper', maxCount: 1 }
    ]),
    examController.grade
)

router.route('/exam/tests').get(rateLimiter, authenticate, examController.tests)

router.route('/exam/tests/:testId/results').get(rateLimiter, authenticate, examController.testResults)

router.route('/exam/records/:recordId').patch(rateLimiter, authenticate, examController.editRecord)

export default router
