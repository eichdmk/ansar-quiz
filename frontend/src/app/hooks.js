import { useDispatch, useSelector } from 'react-redux'
import { useMemo } from 'react'

export const useAppDispatch = () => useDispatch()
export const useAppSelector = useSelector

export const useAsyncStatus = (status) =>
  useMemo(
    () => ({
      isIdle: status === 'idle',
      isLoading: status === 'loading',
      isSuccess: status === 'succeeded',
      isError: status === 'failed',
    }),
    [status],
  )

