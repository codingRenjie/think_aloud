import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRow = {
  0: { transcript: string }
  isFinal?: boolean
}

type RecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort?: () => void
  onerror: ((ev: Event) => void) | null
  onend: (() => void) | null
  onresult: ((ev: { resultIndex: number; results: ArrayLike<SpeechRow> }) => void) | null
}

type RecognitionConstructor = new () => RecognitionInstance

function getSpeechRecognitionCtor(): RecognitionConstructor | null {
  const w = window as Window & {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

const MAX_AUTO_RESTART = 24

export function useSpeechRecognition() {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<RecognitionInstance | null>(null)
  /** 当前一次「语音」会话累加的定稿文字（不含正在识别的 interim） */
  const bufferRef = useRef('')
  /** 与界面同步的完整预览：已定稿 + 当前 interim，结束时会用于 resolve */
  const previewRef = useRef('')
  const [liveTranscript, setLiveTranscript] = useState('')
  /** 用户点了「停止」则为 true，onend 不再自动 restart */
  const userStopRef = useRef(false)
  const restartCountRef = useRef(0)
  const sessionIdRef = useRef(0)
  const pendingRef = useRef<{
    resolve: (s: string) => void
    reject: (e: Error) => void
  } | null>(null)

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()))
  }, [])

  const finalizeSession = useCallback((rejectError?: Error) => {
    const p = pendingRef.current
    pendingRef.current = null
    recRef.current = null
    setListening(false)
    restartCountRef.current = 0
    const out = previewRef.current.trim()
    setLiveTranscript('')
    previewRef.current = ''
    if (rejectError) {
      p?.reject(rejectError)
      return
    }
    p?.resolve(out)
  }, [])

  const cancel = useCallback(() => {
    userStopRef.current = true
    const r = recRef.current
    try {
      r?.stop()
    } catch {
      /* ignore */
    }
    /** stop 会异步触发 onend，在 onend 里 resolve；若实例已死则立刻收尾 */
    if (!r) {
      finalizeSession()
    }
  }, [finalizeSession])

  const listenOnce = useCallback((): Promise<string> => {
    const SR = getSpeechRecognitionCtor()
    if (!SR) {
      return Promise.reject(new Error('浏览器不支持语音识别'))
    }

    return new Promise((resolve, reject) => {
      try {
        const prevPending = pendingRef.current
        const prevOut = previewRef.current.trim()
        pendingRef.current = null
        userStopRef.current = true
        try {
          recRef.current?.stop()
        } catch {
          /* ignore */
        }
        recRef.current = null
        if (prevPending) {
          prevPending.resolve(prevOut)
        }

        sessionIdRef.current += 1
        const sid = sessionIdRef.current

        bufferRef.current = ''
        previewRef.current = ''
        setLiveTranscript('')
        userStopRef.current = false
        restartCountRef.current = 0
        pendingRef.current = { resolve, reject }

        const r = new SR()
        r.lang = 'zh-CN'
        r.interimResults = true
        r.maxAlternatives = 1
        r.continuous = true
        recRef.current = r
        setListening(true)

        r.onresult = (ev) => {
          if (sessionIdRef.current !== sid) return
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const row = ev.results[i]
            /* 只跳过明确标成 interim 的片段，避免叠字 */
            if (r.interimResults && row.isFinal === false) continue
            const piece = row[0]?.transcript ?? ''
            bufferRef.current += piece
          }
          let interimSuffix = ''
          for (let i = 0; i < ev.results.length; i++) {
            const row = ev.results[i]
            if (row.isFinal === false) {
              interimSuffix += row[0]?.transcript ?? ''
            }
          }
          const preview = bufferRef.current + interimSuffix
          previewRef.current = preview
          setLiveTranscript(preview)
        }

        r.onerror = (ev: Event) => {
          if (sessionIdRef.current !== sid) return
          const err = ev as ErrorEvent & { error?: string }
          const code = err.error || ''
          /* aborted 常发生在主动 stop，交给 onend */
          if (code === 'aborted') return
          finalizeSession(new Error(code || '语音识别出错'))
        }

        r.onend = () => {
          if (sessionIdRef.current !== sid) return

          if (userStopRef.current) {
            finalizeSession()
            return
          }

          /* Chrome 常在短暂静音后结束会话；未点「停止」时自动续听 */
          if (restartCountRef.current >= MAX_AUTO_RESTART) {
            finalizeSession()
            return
          }
          restartCountRef.current += 1
          try {
            r.start()
          } catch {
            finalizeSession()
          }
        }

        r.start()
      } catch (e) {
        finalizeSession(e instanceof Error ? e : new Error('无法启动语音识别'))
      }
    })
  }, [finalizeSession])

  useEffect(() => () => {
    userStopRef.current = true
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    recRef.current = null
    pendingRef.current = null
    setListening(false)
    setLiveTranscript('')
    previewRef.current = ''
  }, [])

  return { supported, listening, liveTranscript, listenOnce, cancel }
}
