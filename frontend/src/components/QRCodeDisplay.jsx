import { QRCodeSVG } from 'qrcode.react'
import { useMemo } from 'react'
import styles from './QRCodeDisplay.module.css'

function QRCodeDisplay({ gameId, className = '', size = 200 }) {
  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return ''
    }
    const baseUrl = window.location.origin
    return `${baseUrl}/player?gameId=${gameId}`
  }, [gameId])

  if (!gameId) {
    return null
  }

  return (
    <div className={`${styles.qrCodeContainer} ${className}`}>
      <div className={styles.qrCodeWrapper}>
        <QRCodeSVG
          value={joinUrl}
          size={size}
          level="H"
          includeMargin={true}
          className={styles.qrCode}
        />
      </div>
      <div className={styles.qrCodeInfo}>
        <p className={styles.qrCodeTitle}>Сканируйте QR-код</p>
        <p className={styles.qrCodeDescription}>
          Ученики могут отсканировать этот код, чтобы автоматически подключиться к игре
        </p>
        <p className={styles.qrCodeCode}>Код игры: <strong>{gameId}</strong></p>
      </div>
    </div>
  )
}

export default QRCodeDisplay

