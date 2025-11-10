import { setupAdmin, login } from '../controllers/auth.controller.js'

export default async function authRoutes(fastify) {

  fastify.post('/setup-admin', setupAdmin)

  fastify.post('/login', login)
}
