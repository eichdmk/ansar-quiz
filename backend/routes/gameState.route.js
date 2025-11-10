import { getCurrentGameQuestion } from '../controllers/gameState.controller.js'

export default async function gameStateRoutes(fastify) {
  fastify.get('/:id/current-question', getCurrentGameQuestion)
}
