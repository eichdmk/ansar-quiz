import { createQuiz, deleteQuiz, getQuizzes, getQuizHistory, openQuiz, resetQuiz, restartQuiz, startQuiz, stopQuiz, advanceQuizQuestion } from "../controllers/quiz.controller.js";
import { adminGuard } from '../middlware/auth.js'

export default async function quizRoutes(fastify, options) {
    fastify.addHook('preHandler', adminGuard)
    fastify.post('/', createQuiz)

    fastify.get('/', getQuizzes)
    fastify.get('/history', getQuizHistory)

    fastify.delete('/:id', deleteQuiz)

    fastify.post('/:id/open', openQuiz)
    fastify.post('/:id/reset', resetQuiz)
    fastify.post('/:id/restart', restartQuiz)
    fastify.post('/:id/start', startQuiz)
    fastify.post('/:id/stop', stopQuiz)
    fastify.post('/:id/next', advanceQuizQuestion)
}