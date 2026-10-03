import { useEffect, useRef, useState } from 'react'
import { Modal } from './ui/Modal'
import { useT } from '../i18n'

export interface NotesEditorModalProps {
  open: boolean
  title?: string
  initialValue: string
  placeholder?: string
  onClose: (next: string) => void
}

export function NotesEditorModal({
  open,
  title,
  initialValue,
  placeholder,
  onClose,
}: NotesEditorModalProps) {
  const t = useT()
  const [draft, setDraft] = useState(initialValue)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setDraft(initialValue)
      requestAnimationFrame(() => {
        taRef.current?.focus()
        const len = taRef.current?.value.length ?? 0
        taRef.current?.setSelectionRange(len, len)
      })
    }
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose(draft)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, draft, onClose])

  if (!open) return null

  return (
    <Modal title={title ?? t('dialogs.notes.title')} onClose={() => onClose(draft)} width={680}>
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder ?? t('dialogs.notes.placeholder')}
        className="w-full min-h-[320px] max-h-[60vh] text-sm border border-gray-200 rounded-md p-3 focus:border-pink-400 focus:outline-none resize-y leading-relaxed"
      />
      <p className="mt-2 text-[11px] text-gray-400 text-right">
        {t('dialogs.notes.hint')}
      </p>
    </Modal>
  )
}
