import {
  createAnswer,
  updateAnswer,
  deleteAnswer,
  listAnswers,
} from '../controllers/answers.controller.js'

export default async function answersRoutes(fastify) {
  fastify.post('/', createAnswer)
  fastify.get('/', listAnswers)
  fastify.get('/:questionId', listAnswers)
  fastify.patch('/:id', updateAnswer)
  fastify.delete('/:id', deleteAnswer)
}

