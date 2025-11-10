import {
  createQuestion,
  listQuestions,
  deleteQuestion,
} from '../controllers/questions.controller.js'

export default async function questionsRoutes(fastify) {
  fastify.post('/', createQuestion)
  fastify.get('/', listQuestions)
  fastify.get('/:gameId', listQuestions)
  fastify.delete('/:id', deleteQuestion)
}