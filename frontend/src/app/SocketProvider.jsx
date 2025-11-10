import { createContext, useContext, useEffect } from 'react'
import { socket } from './socket.js'

const SocketContext = createContext(socket)

export function SocketProvider({ children }) {
  useEffect(() => {
    if (!socket.connected) {
      socket.connect()
    }
    return () => {
      socket.removeAllListeners()
    }
  }, [])

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}

export const useSocket = () => useContext(SocketContext)
