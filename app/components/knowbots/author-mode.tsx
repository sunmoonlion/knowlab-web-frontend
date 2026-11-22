'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { FormalDraft } from '@/contracts/formal-methods'

const AuthorMode = createContext(false)
export const useDeveloperMode = () => useContext(AuthorMode)
const modeChanged = 'knowlab-author-mode-change'
function subscribe(notify: () => void) {
  window.addEventListener(modeChanged, notify)
  window.addEventListener('storage', notify)
  return () => {
    window.removeEventListener(modeChanged, notify)
    window.removeEventListener('storage', notify)
  }
}
const serverDefault = () => false

export function AuthorModePanel({ scope, children }: { scope: string; children: ReactNode }) {
  const t = useTranslations('workdraft')
  const key = 'knowlab.author-mode.' + scope
  const [fallback, setFallback] = useState<boolean>()
  const remembered = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(key) === 'developer'
      } catch {
        return false
      }
    },
    serverDefault,
  )
  const enabled = fallback ?? remembered
  return (
    <AuthorMode.Provider value={enabled}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={(event) => {
            const next = event.target.checked
            try {
              if (next) sessionStorage.setItem(key, 'developer')
              else sessionStorage.removeItem(key)
              setFallback(undefined)
              window.dispatchEvent(new Event(modeChanged))
            } catch {
              setFallback(next)
            }
          }}
        />
        {t('developerMode')}
      </label>
      {children}
    </AuthorMode.Provider>
  )
}

export function SavedMethodSummary({ draft }: { draft: FormalDraft }) {
  const declaration = draft.definition.capability_declaration
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{declaration.title}</h2>
      <p>{declaration.purpose}</p>
      <p className="whitespace-pre-wrap">{draft.definition.procedure.instructions}</p>
    </section>
  )
}
