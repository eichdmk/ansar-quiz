import { submitAnswer, listPlayerAnswers, requestAnswer, skipQuestion, getQueue, evaluateAnswer, skipPlayerByAdmin } from '../controllers/playerAnswers.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function playerAnswersRoutes(fastify) {
  // Специфичные маршруты должны быть зарегистрированы первыми
  fastify.post('/evaluate', { preHandler: adminGuard }, evaluateAnswer)
  fastify.post('/skip-player', { preHandler: adminGuard }, skipPlayerByAdmin)
  fastify.post('/request-answer', requestAnswer)
  fastify.post('/skip', skipQuestion)
  fastify.post('/', submitAnswer)
  fastify.get('/queue', getQueue)
  fastify.get('/queue/:gameId', getQueue)
  fastify.get('/', { preHandler: adminGuard }, listPlayerAnswers)
  fastify.get('/:playerId', { preHandler: adminGuard }, listPlayerAnswers)
}

