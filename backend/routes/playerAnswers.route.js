import { submitAnswer, listPlayerAnswers, requestAnswer, skipQuestion, getQueue } from '../controllers/playerAnswers.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function playerAnswersRoutes(fastify) {
  fastify.post('/', submitAnswer)
  fastify.post('/request-answer', requestAnswer)
  fastify.post('/skip', skipQuestion)
  fastify.get('/queue', getQueue)
  fastify.get('/queue/:gameId', getQueue)
  fastify.get('/', { preHandler: adminGuard }, listPlayerAnswers)
  fastify.get('/:playerId', { preHandler: adminGuard }, listPlayerAnswers)
}

