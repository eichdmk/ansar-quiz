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
import gameStateRoute from './routes/gameState.route.js'
import pool, { verifyDatabaseConnection } from './plugins/db.js'
import { ensureDefaultAdmin } from './services/admin.service.js'
import { initRedis } from './services/cache.service.js'

dotenv.config()

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
  bodyLimit: 15 * 1024 * 1024, // 15MB
  requestTimeout: 30000, // 30 seconds
  keepAliveTimeout: 72000, // 72 seconds
})

const uploadsDir = path.resolve(process.cwd(), 'uploads')
await fs.mkdir(uploadsDir, { recursive: true })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
})
await app.register(fastifyMultipart, {
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
})
await app.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
})

app.get('/healthz', async () => ({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}))

app.decorate('pg', pool)
app.decorate('io', null)


app.addHook('onReady', async function () {
  await verifyDatabaseConnection()
  await initRedis()
  await ensureDefaultAdmin(this.log)
  const io = new SocketIOServer(this.server, {
    cors: {
      origin: '*',
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 120000,
    pingInterval: 25000,
    maxHttpBufferSize: 2e6,
    perMessageDeflate: true,
    allowRequest: (req, callback) => {
      // Можно добавить проверку origin для безопасности
      callback(null, true)
    },
  })
  this.io = io
  this.server.io = io
  io.on('connection', (socket) => {
    this.log.info({ id: socket.id }, 'Socket.io client connected')
    
    // Инициализируем множество присоединенных комнат
    socket.data.joinedRooms = new Set()
    
    socket.on('join:game', async ({ gameId, role, playerId }) => {
      if (!gameId || !role) {
        this.log.warn({ id: socket.id, gameId, role }, 'Invalid join:game request')
        return
      }
      
      const gameRoom = `game:${gameId}`
      const adminRoom = `game:${gameId}:admin`
      
      try {
        // Присоединяем к общей комнате игры
        await socket.join(gameRoom)
        socket.data.joinedRooms.add(gameRoom)
        this.log.info({ id: socket.id, gameId, role, room: gameRoom }, 'Socket joined game room')
        
        // Если роль - администратор, присоединяем к admin комнате
        if (role === 'admin') {
          await socket.join(adminRoom)
          socket.data.joinedRooms.add(adminRoom)
          this.log.info({ id: socket.id, gameId, room: adminRoom }, 'Socket joined admin room')
        }
        
        // Сохраняем информацию о присоединении
        socket.data.gameId = gameId
        socket.data.role = role
        if (playerId) {
          socket.data.playerId = playerId
        }
      } catch (error) {
        this.log.error({ id: socket.id, gameId, error }, 'Error joining game room')
      }
    })
    
    socket.on('leave:game', async ({ gameId }) => {
      if (!gameId) {
        this.log.warn({ id: socket.id, gameId }, 'Invalid leave:game request')
        return
      }
      
      const gameRoom = `game:${gameId}`
      const adminRoom = `game:${gameId}:admin`
      
      try {
        await socket.leave(gameRoom)
        socket.data.joinedRooms.delete(gameRoom)
        this.log.info({ id: socket.id, gameId, room: gameRoom }, 'Socket left game room')
        
        await socket.leave(adminRoom)
        socket.data.joinedRooms.delete(adminRoom)
        this.log.info({ id: socket.id, gameId, room: adminRoom }, 'Socket left admin room')
        
        // Очищаем данные, если выходим из текущей игры
        if (socket.data.gameId === gameId) {
          delete socket.data.gameId
          delete socket.data.role
          delete socket.data.playerId
        }
      } catch (error) {
        this.log.error({ id: socket.id, gameId, error }, 'Error leaving game room')
      }
    })
    
    socket.on('disconnect', (reason) => {
      this.log.info({ id: socket.id, reason, rooms: Array.from(socket.data.joinedRooms || []) }, 'Socket.io client disconnected')
      // Socket.IO автоматически исключит сокет из всех комнат при disconnect
      socket.data.joinedRooms.clear()
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
await app.register(gameStateRoute, { prefix: '/api/game-state' })


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
