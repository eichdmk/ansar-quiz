import { login } from "../controllers/auth.controller.js";
// добавить rate-limit (плагин `@fastify/rate-limit`).

export default async function authRoutes(fastify, options) {
    fastify.post('/', login)
}

