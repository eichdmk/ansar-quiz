import styles from '../Dashboard.module.css'

function MultipleChoiceQueuePanel({
  queue,
  gameId,
  questionId,
  pendingGameId,
  onSkipPlayer,
}) {
  if (!queue || queue.length === 0) {
    return null
  }

  const isPending = pendingGameId === gameId

  return (
    <div className={styles.answerStats}>
      <span className={styles.answerStatsTitle}>Очередь ответов ({queue.length})</span>
      <div className={styles.queueList}>
        {queue.map((item, idx) => (
          <div key={item.playerId} className={styles.queueItem}>
            <span className={styles.queuePosition}>{idx + 1}.</span>
            <span className={styles.queuePlayerName}>{item.username}</span>
            {item.groupName && (
              <span className={styles.queueGroupName}>({item.groupName})</span>
            )}
            {/* Показываем автоматически определенный результат */}
            {item.isCorrect === true && (
              <span className={styles.queueStatusCorrect}>✓ Правильно</span>
            )}
            {item.isCorrect === false && (
              <span className={styles.queueStatusWrong}>✗ Неправильно</span>
            )}
            {/* Кнопка пропуска доступна для:
                - Игроков, которые еще не ответили (isCorrect === null)
                - Игроков, которые ответили неправильно (isCorrect === false)
                Это позволяет админу исключить игрока из текущего раунда */}
            {(item.isCorrect === null || item.isCorrect === false) && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => onSkipPlayer(gameId, item.playerId, questionId)}
                disabled={isPending}
                style={{ marginLeft: 'auto' }}
              >
                ⏭ Пропустить
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default MultipleChoiceQueuePanel

