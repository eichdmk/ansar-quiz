import styles from '../Dashboard.module.css'

const PlusIcon = () => (
  <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.7" />
    <path stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M12 8v8M8 12h8" />
  </svg>
)

function CreateGameForm({ name, error, globalError, onChange, onSubmit }) {
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.field}>
        <span>Название нового квиза</span>
        <input
          type="text"
          value={name}
          onChange={onChange}
          placeholder="Например: Топ 5 причин почему js лучше пайтона"
        />
      </label>
      {(error || globalError) && (
        <div className={styles.error}>{error ?? globalError}</div>
      )}
      <button type="submit" className={styles.createButton}>
        <PlusIcon />
        Создать квиз
      </button>
    </form>
  )
}

export default CreateGameForm

