import styles from '../Dashboard.module.css'

function GameCardHeader({ game }) {
  const statusText = 
    game.status === 'running'
      ? 'В процессе'
      : game.status === 'finished'
        ? 'Завершена'
        : game.status === 'ready'
          ? 'Комната открыта'
          : 'Черновик'

  return (
    <>
      <div className={styles.cardHeaderRow}>
        <h3>{game.name}</h3>
        <span className={`${styles.statusBadge} ${styles[`status_${game.status}`]}`}>
          {statusText}
        </span>
      </div>
      <span className={styles.cardMeta}>
        Создано{' '}
        {new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(game.created_at))}
      </span>
    </>
  )
}

export default GameCardHeader

