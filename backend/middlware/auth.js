
// Реализуй проверку токена администратора.
// 1. Экспортируй функцию preHandler: async function adminGuard(request, reply).
// 2. Достань токен из заголовков/куки.
// 3. Вызови fastify.jwt.verify(token) и положи payload в request.user.
// 4. Обработай ошибки: reply.code(401).send({ message: 'Unauthorized' }).


