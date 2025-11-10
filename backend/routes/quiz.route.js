import { createQuiz, deleteQuiz, getQuizzes } from '../controllers/quiz.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function quizRoutes(fastify) {
  fastify.addHook('preHandler', adminGuard)
  fastify.post('/', createQuiz)
  fastify.get('/', getQuizzes)
  fastify.delete('/:id', deleteQuiz)
}