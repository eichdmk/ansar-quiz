import { createQuestion, listQuestions, deleteQuestion } from '../controllers/questions.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function questionsRoutes(fastify) {
  fastify.addHook('preHandler', adminGuard)
  fastify.post('/', createQuestion)
  fastify.get('/', listQuestions)
  fastify.get('/:gameId', listQuestions)
  fastify.delete('/:id', deleteQuestion)
}