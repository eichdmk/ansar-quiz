import styles from './App.module.css'

const ShieldIcon = () => (
  <svg
    className={styles.icon}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    strokeWidth="1.8"
    stroke="currentColor"
    fill="none"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5l7.5 2.5V12c0 4.2-3 6.9-7.5 9-4.5-2.1-7.5-4.8-7.5-9V7l7.5-2.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
  </svg>
)

const UsersIcon = () => (
  <svg
    className={styles.icon}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    strokeWidth="1.8"
    stroke="currentColor"
    fill="none"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 19a6 6 0 0116 0" />
    <circle cx="12" cy="7" r="2.5" />
    <circle cx="5.5" cy="9.5" r="1.5" />
    <circle cx="18.5" cy="9.5" r="1.5" />
  </svg>
)

function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandTitle}>Ansar Quiz</span>
          <span className={styles.brandSubtitle}>
            обучающая платформа для интерактивных викторин
          </span>
        </div>

        <button type="button" className={styles.primaryButton}>
          Войти как администратор
        </button>
      </header>

      <main className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <ShieldIcon />
            <h2>Что делает администратор</h2>
          </div>
          <p className={styles.cardText}>
            Создаёт квизы, наполняет их вопросами и запускает игру для группы.
            Все настройки и управление находятся на отдельной панели.
          </p>
          <ul className={styles.featureList}>
            <li>Авторизационный экран и защита токеном</li>
            <li>Создание игр, вопросов и вариантов ответов</li>
            <li>Мониторинг очков и лидеров в реальном времени</li>
          </ul>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <UsersIcon />
            <h2>Что видит ученик</h2>
          </div>
          <p className={styles.cardText}>
            Подключается по QR-коду, вводит имя и сразу отвечает на вопросы на
            телефоне. После ответа мгновенно переходит к следующему.
          </p>
          <ul className={styles.featureList}>
            <li>Сканирует QR и подключается к текущей игре</li>
            <li>Отвечает на вопросы без ожидания таймера</li>
            <li>Следит за своим местом на лидерборде</li>
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
