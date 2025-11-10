import { uploadQuestionImage } from '../controllers/uploads.controller.js'
import { adminGuard } from '../middlware/auth.js'

export default async function uploadsRoute(fastify) {
  fastify.post('/question-image', { preHandler: adminGuard }, uploadQuestionImage)
}

