import crypto from 'crypto'
import path from 'path'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import sharp from 'sharp'

const uploadsDir = path.resolve(process.cwd(), 'uploads')
const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

async function drainStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve)
    stream.on('error', reject)
    stream.resume()
  })
}

export async function uploadQuestionImage(request, reply) {
  const file = await request.file()
  if (!file) {
    reply.code(400).send({ message: 'Файл не найден' })
    return
  }
  if (!allowedTypes.has(file.mimetype)) {
    await drainStream(file.file)
    reply.code(400).send({ message: 'Неподдерживаемый формат' })
    return
  }
  const filename = `${Date.now()}-${crypto.randomUUID()}.webp`
  const targetPath = path.join(uploadsDir, filename)
  const transformer = sharp()
    .rotate()
    .webp({
      quality: 80,
      smartSubsample: true,
    })
  const writeStream = createWriteStream(targetPath)
  try {
    await pipeline(file.file, transformer, writeStream)
    reply.code(201).send({
      path: `/uploads/${filename}`,
      filename,
      mimetype: 'image/webp',
    })
  } catch (error) {
    await drainStream(file.file)
    reply.log.error(error)
    reply.code(500).send({
      message: 'Ошибка загрузки файла',
      detail: error.message,
    })
  }
}

