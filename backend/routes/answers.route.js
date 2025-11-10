import { createAnswer, updateAnswer, deleteAnswer, listAnswers } from '../controllers/answers.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function answersRoutes(fastify) {
  fastify.addHook('preHandler', adminGuard)
  fastify.post('/', createAnswer)
  fastify.get('/', listAnswers)
  fastify.get('/:questionId', listAnswers)
  fastify.patch('/:id', updateAnswer)
  fastify.delete('/:id', deleteAnswer)
}

