import { createPlayer, listPlayers, updatePlayerScore, deletePlayer } from '../controllers/players.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function playersRoutes(fastify) {
  fastify.addHook('preHandler', adminGuard)
  fastify.post('/', createPlayer)
  fastify.get('/', listPlayers)
  fastify.get('/:gameId', listPlayers)
  fastify.patch('/:id/score', updatePlayerScore)
  fastify.delete('/:id', deletePlayer)
}

