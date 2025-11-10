import Fastify from 'fastify'
import dotenv from 'dotenv'
import cors from '@fastify/cors'

import authRoutes from './routes/auth.route.js'
import quizRoute from './routes/quiz.route.js'
import questionsRoute from './routes/questions.route.js'
import answersRoute from './routes/answers.route.js'
import playersRoute from './routes/players.route.js'
import playerAnswersRoute from './routes/playerAnswers.route.js'
import pool, { verifyDatabaseConnection } from './plugins/db.js'
import { ensureDefaultAdmin } from './services/admin.service.js'

dotenv.config()

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })

app.decorate('pg', pool)


app.addHook('onReady', async function () {
  await verifyDatabaseConnection()
  await ensureDefaultAdmin(this.log)
})


await app.register(quizRoute, { prefix: '/api/quiz' })
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(questionsRoute, { prefix: '/api/questions' })
await app.register(answersRoute, { prefix: '/api/answers' })
await app.register(playersRoute, { prefix: '/api/players' })
await app.register(playerAnswersRoute, { prefix: '/api/player-answers' })


const start = async () => {
  try {
    const PORT = Number(process.env.PORT) || 3000
    const HOST = process.env.HOST || '0.0.0.0'

    await app.listen({ port: PORT, host: HOST })
    console.log(`Сервер запущен на http://${HOST}:${PORT}`)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

start()

export default app
