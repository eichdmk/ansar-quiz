import { submitAnswer, listPlayerAnswers } from '../controllers/playerAnswers.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function playerAnswersRoutes(fastify) {
  fastify.post('/', submitAnswer)
  fastify.get('/', { preHandler: adminGuard }, listPlayerAnswers)
  fastify.get('/:playerId', { preHandler: adminGuard }, listPlayerAnswers)
}

