import {
  createQuestion,
  listQuestions,
  deleteQuestion,
  updateQuestion,
  importQuestions,
  exportQuestions,
} from '../controllers/questions.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function questionsRoutes(fastify) {
  fastify.addHook('preHandler', adminGuard)
  fastify.post('/import', importQuestions)
  fastify.get('/export', exportQuestions)
  fastify.get('/export/:gameId', exportQuestions)
  fastify.post('/', createQuestion)
  fastify.get('/', listQuestions)
  fastify.get('/:gameId', listQuestions)
  fastify.put('/:id', updateQuestion)
  fastify.delete('/:id', deleteQuestion)
}