import { useNavigate } from 'react-router-dom'
import styles from '../Dashboard.module.css'

const TrashIcon = () => (
  <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <path
      d="M6 8.5h12l-.8 9.6a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 8.5Zm3.5-2.5V4.7A1.7 1.7 0 0 1 11.2 3h1.6a1.7 1.7 0 0 1 1.7 1.7V6h4.4M5 6h14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function GameCardActions({
  game,
  isQuestionInPreview,
  pendingGameId,
  navigate,
  handleOpen,
  handleLaunch,
  handleCancelLobby,
  handleStop,
  handleStartQuestion,
  handleNextQuestion,
  handleRestart,
  handleDelete,
}) {
  const isPending = pendingGameId === game.id

  return (
    <div className={styles.cardActions}>
      <button
        type="button"
        className={styles.primaryButton}
        onClick={() => navigate(`/admin/game/${game.id}`)}
        disabled={isPending}
      >
        Вопросы
      </button>
      {game.status === 'draft' && (
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => handleOpen(game)}
          disabled={isPending}
        >
          Открыть комнату
        </button>
      )}
      {game.status === 'ready' && (
        <button
          type="button"
          className={styles.successButton}
          onClick={() => handleLaunch(game)}
          disabled={isPending}
        >
          Запустить
        </button>
      )}
      {game.status === 'ready' && (
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => handleCancelLobby(game)}
          disabled={isPending}
        >
          Отменить комнату
        </button>
      )}
      {game.status === 'running' && (
        <button
          type="button"
          className={styles.warningButton}
          onClick={() => handleStop(game)}
          disabled={isPending}
        >
          Завершить
        </button>
      )}
      {game.status === 'running' && isQuestionInPreview && (
        <button
          type="button"
          className={styles.successButton}
          onClick={() => handleStartQuestion(game)}
          disabled={isPending}
        >
          Старт вопроса
        </button>
      )}
      {game.status === 'running' && (
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => handleNextQuestion(game)}
          disabled={isPending}
        >
          Следующий вопрос
        </button>
      )}
      {game.status === 'finished' && (
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => handleRestart(game)}
          disabled={isPending}
        >
          Перезапустить игру
        </button>
      )}
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={() => handleDelete(game.id)}
        disabled={game.status === 'running' || isPending}
      >
        <TrashIcon />
        Удалить
      </button>
    </div>
  )
}

export default GameCardActions

