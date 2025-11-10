import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

export async function adminGuard(request, reply) {
  const authorization = request.headers.authorization
  let token = null
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    token = authorization.slice(7).trim()
  }
  if (!token && typeof request.headers['x-access-token'] === 'string') {
    token = request.headers['x-access-token']
  }
  if (!token) {
    reply.code(401).send({ message: 'Unauthorized' })
    return
  }
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT secret is not configured')
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    request.user = payload
  } catch (error) {
    request.log.error(error)
    reply.code(401).send({ message: 'Unauthorized' })
    return
  }
}