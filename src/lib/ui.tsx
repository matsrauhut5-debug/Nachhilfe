import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/* ---------- Toast ---------- */

const ToastContext = createContext<(msg: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const toast = useCallback((m: string) => {
    setMsg(m)
    setShow(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShow(false), 2600)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast" role="status" aria-live="polite" className={show ? 'show' : ''}>
        {msg}
      </div>
    </ToastContext.Provider>
  )
}

/* ---------- Modal ---------- */

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const last = document.activeElement as HTMLElement | null
    document.body.classList.add('noscroll')
    const first = box.current?.querySelector<HTMLElement>('[autofocus], input, button.primary, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('noscroll')
      last?.focus?.()
    }
  }, [onClose])

  return (
    <div id="modal">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" ref={box}>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog(props: {
  title: string
  text: ReactNode
  okLabel: string
  danger?: boolean
  onOk: () => void | Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  async function ok() {
    setBusy(true)
    await props.onOk()
    setBusy(false)
    props.onClose()
  }
  return (
    <Modal onClose={props.onClose}>
      <h3>{props.title}</h3>
      <p className="muted" style={{ margin: '0 0 18px' }}>{props.text}</p>
      <div className="actions">
        <button className="btn ghost" onClick={props.onClose}>Back</button>
        <button className={'btn ' + (props.danger ? 'danger' : 'primary')} onClick={ok} disabled={busy}>
          {busy ? 'One moment …' : props.okLabel}
        </button>
      </div>
    </Modal>
  )
}
