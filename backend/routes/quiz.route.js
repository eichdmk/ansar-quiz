import { createQuiz, deleteQuiz, getQuizzes } from "../controllers/quiz.controller.js";

export default async function (fastify, options) {
    fastify.post('/', createQuiz)

    fastify.get('/', getQuizzes)

    fastify.delete('/:id', deleteQuiz)


}