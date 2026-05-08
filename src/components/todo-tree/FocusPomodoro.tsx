import { useEffect, useMemo, useRef, useState } from 'react'

const PRESET_MINUTES = [25, 15, 5] as const
const TICK_MS = 500

function toClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function FocusPomodoro() {
  const [durationMinutes, setDurationMinutes] = useState<number>(25)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  const endsAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isRunning) {
      return
    }

    const timerId = window.setInterval(() => {
      if (endsAtRef.current === null) {
        return
      }

      const secs = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
      setRemainingSeconds(secs)

      if (secs === 0) {
        window.clearInterval(timerId)
        setIsRunning(false)
        setSessionsCompleted((count) => count + 1)
        endsAtRef.current = null
      }
    }, TICK_MS)

    return () => window.clearInterval(timerId)
  }, [isRunning])

  const isFinished = remainingSeconds === 0
  const timerLabel = useMemo(
    () => toClock(remainingSeconds),
    [remainingSeconds],
  )

  const applyPreset = (minutes: number) => {
    setDurationMinutes(minutes)
    setRemainingSeconds(minutes * 60)
    setIsRunning(false)
    endsAtRef.current = null
  }

  const startOrResume = () => {
    const seconds = isFinished ? durationMinutes * 60 : remainingSeconds
    endsAtRef.current = Date.now() + seconds * 1000
    if (isFinished) {
      setRemainingSeconds(durationMinutes * 60)
    }
    setIsRunning(true)
  }

  const pause = () => {
    setIsRunning(false)
    endsAtRef.current = null
  }

  const reset = () => {
    setIsRunning(false)
    setRemainingSeconds(durationMinutes * 60)
    endsAtRef.current = null
  }

  return (
    <div className="focus-pomodoro" aria-label="Pomodoro timer">
      <div className="focus-pomodoro-row">
        <div>
          <div className="focus-pomodoro-kicker">Pomodoro</div>
          <div className={`focus-pomodoro-time${isFinished ? ' done' : ''}`}>
            {timerLabel}
          </div>
        </div>
        <div className="focus-pomodoro-presets">
          {PRESET_MINUTES.map((minutes) => (
            <button
              key={minutes}
              className={`focus-preset${durationMinutes === minutes ? ' active' : ''}`}
              onClick={() => applyPreset(minutes)}
            >
              {minutes}m
            </button>
          ))}
        </div>
      </div>

      <div className="focus-pomodoro-controls">
        <button
          className="focus-pomo-btn primary"
          onClick={startOrResume}
          disabled={isRunning}
        >
          {isRunning ? 'Running' : isFinished ? 'Restart' : 'Start'}
        </button>
        <button className="focus-pomo-btn" onClick={pause}>
          Pause
        </button>
        <button className="focus-pomo-btn" onClick={reset}>
          Reset
        </button>
      </div>

      <div className="focus-pomodoro-foot">
        Sessions completed today: {sessionsCompleted}
      </div>
    </div>
  )
}
