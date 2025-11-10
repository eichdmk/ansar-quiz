import Fastify from 'fastify'
import dotenv from 'dotenv'
import cors from '@fastify/cors'

import authRoutes from './routes/auth.route.js'
import quizRoute from './routes/quiz.route.js'

dotenv.config()

const app = Fastify({ logger: true })


await app.register(import('@fastify/cors'), {
  origin: true
});


await app.register(quizRoute, {prefix: '/api/quiz'})
await app.register(authRoutes, {prefix: '/api/auth'})

// Шаг 3. Добавь префиксованные роуты: admin, auth, public API.
// Пример: await app.register(import('./routes/admin.route.js'), { prefix: '/admin' })

// Шаг 4. Запусти сервер и обработай ошибки старта. Не забудь порт из .env.
// Пример:
const start = async () => {
  try {
    const PORT = process.env.PORT || 3000;
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start()

export default app
