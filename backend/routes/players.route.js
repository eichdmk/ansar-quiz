import { createPlayer, listPlayers, updatePlayerScore, deletePlayer } from '../controllers/players.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function playersRoutes(fastify) {
  fastify.post('/', createPlayer)
  fastify.get('/', { preHandler: adminGuard }, listPlayers)
  fastify.get('/:gameId', { preHandler: adminGuard }, listPlayers)
  fastify.patch('/:id/score', { preHandler: adminGuard }, updatePlayerScore)
  fastify.delete('/:id', { preHandler: adminGuard }, deletePlayer)
}

