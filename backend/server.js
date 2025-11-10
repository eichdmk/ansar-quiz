import Fastify from 'fastify'
import dotenv from 'dotenv'
import cors from '@fastify/cors'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { promises as fs } from 'fs'
import { Server as SocketIOServer } from 'socket.io'

import authRoutes from './routes/auth.route.js'
import quizRoute from './routes/quiz.route.js'
import questionsRoute from './routes/questions.route.js'
import answersRoute from './routes/answers.route.js'
import playersRoute from './routes/players.route.js'
import playerAnswersRoute from './routes/playerAnswers.route.js'
import uploadsRoute from './routes/uploads.route.js'
import pool, { verifyDatabaseConnection } from './plugins/db.js'
import { ensureDefaultAdmin } from './services/admin.service.js'

dotenv.config()

const app = Fastify({ logger: true })

const uploadsDir = path.resolve(process.cwd(), 'uploads')
await fs.mkdir(uploadsDir, { recursive: true })

await app.register(cors, { origin: true })
await app.register(fastifyMultipart, {
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
})
await app.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
})

app.decorate('pg', pool)
app.decorate('io', null)


app.addHook('onReady', async function () {
  await verifyDatabaseConnection()
  await ensureDefaultAdmin(this.log)
  const io = new SocketIOServer(this.server, {
    cors: {
      origin: '*',
    },
  })
  this.io = io
  this.server.io = io
  io.on('connection', (socket) => {
    this.log.info({ id: socket.id }, 'Socket.io client connected')
    socket.on('disconnect', (reason) => {
      this.log.info({ id: socket.id, reason }, 'Socket.io client disconnected')
    })
  })
})


await app.register(quizRoute, { prefix: '/api/quiz' })
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(questionsRoute, { prefix: '/api/questions' })
await app.register(answersRoute, { prefix: '/api/answers' })
await app.register(playersRoute, { prefix: '/api/players' })
await app.register(playerAnswersRoute, { prefix: '/api/player-answers' })
await app.register(uploadsRoute, { prefix: '/api/uploads' })


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
