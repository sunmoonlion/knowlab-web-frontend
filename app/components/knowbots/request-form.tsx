'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { CaseIn, ExpectationIn, KnowbotRequestIn, SixAnswers } from '@/contracts/knowbots'
import { useRouter } from '@/i18n/navigation'
import { ApiClientError } from '@/lib/common/api-client'
import { fetchRuntimes, submitRequest } from '@/lib/knowbots/client'

import { MY_REQUESTS_KEY } from './my-requests'

const QUESTIONS = ['solves', 'not_solves', 'inputs', 'steps', 'outputs', 'correctness'] as const
const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'

type ExpectationDraft = {
  artifact: string
  path: string
  kind: ExpectationIn['kind']
  value: string
  tolerance: string
}
type CaseDraft = { question: string; expectations: ExpectationDraft[] }

const emptyCase = (): CaseDraft => ({ question: '', expectations: [] })
const emptyExpectation = (): ExpectationDraft => ({
  artifact: '',
  path: '',
  kind: 'equals',
  value: '',
  tolerance: '',
})

function toCases(cases: CaseDraft[]): CaseIn[] {
  return cases.map((c, i) => ({
    case_id: `c${i + 1}`,
    input: { question: c.question.trim() },
    expectations: c.expectations.map((e) =>
      e.kind === 'approx'
        ? {
            artifact: e.artifact.trim(),
            path: e.path.trim(),
            kind: e.kind,
            value: Number(e.value),
            tolerance: Number(e.tolerance),
          }
        : { artifact: e.artifact.trim(), path: e.path.trim(), kind: e.kind, value: e.value },
    ),
  }))
}

// 提交一个想法（SDD 0027）：方法用六问或一份 skill 写清楚，选运行方，给验收用例，同意数据用于测试。
// 方法只来自用户（C-L1）；我们据此做成草稿、测试，测试通过后出现在 knowmart「我的分身」。
export function RequestForm({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('knowbotRequests')
  const router = useRouter()
  const queryClient = useQueryClient()
  const runtimes = useQuery({ queryKey: ['web', 'knowbot-runtimes'], queryFn: fetchRuntimes })
  const [title, setTitle] = useState('')
  const [runtime, setRuntime] = useState('')
  const [kind, setKind] = useState<'six_questions' | 'skill'>('six_questions')
  const [answers, setAnswers] = useState<SixAnswers>({
    solves: '',
    not_solves: '',
    inputs: '',
    steps: '',
    outputs: '',
    correctness: '',
  })
  const [skill, setSkill] = useState('')
  const [cases, setCases] = useState<CaseDraft[]>([emptyCase()])
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosenRuntime = runtime || (runtimes.data?.length === 1 ? runtimes.data[0] : '')
  const submit = useMutation({
    mutationFn: () => {
      const body: KnowbotRequestIn = {
        title: title.trim(),
        runtime: chosenRuntime,
        idea: kind === 'skill' ? { kind, skill } : { kind, answers },
        cases: toCases(cases),
        consent_test_data: true,
      }
      return submitRequest(body, csrfToken)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_REQUESTS_KEY })
      router.push('/knowbots')
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && (e.status === 400 || e.status === 422)
          ? t('form.invalid')
          : t('form.failed'),
      ),
  })

  const updateCase = (index: number, next: CaseDraft) =>
    setCases(cases.map((c, i) => (i === index ? next : c)))

  return (
    <form
      className="mt-6 max-w-3xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        submit.mutate()
      }}
    >
      <label className="block text-sm font-medium">
        {t('form.title')}
        <input
          className={FIELD}
          value={title}
          maxLength={80}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="block text-sm font-medium">
        {t('form.runtime')}
        <select
          className={FIELD}
          value={chosenRuntime}
          required
          onChange={(e) => setRuntime(e.target.value)}
        >
          <option value="" disabled>
            {runtimes.isPending ? t('loading') : t('form.chooseRuntime')}
          </option>
          {(runtimes.data ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('form.method')}</legend>
        <div className="flex gap-4 text-sm">
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'six_questions'}
              onChange={() => setKind('six_questions')}
            />{' '}
            {t('form.sixQuestions')}
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'skill'}
              onChange={() => setKind('skill')}
            />{' '}
            {t('form.skill')}
          </label>
        </div>
        {kind === 'six_questions' ? (
          QUESTIONS.map((q) => (
            <label key={q} className="block text-sm">
              {t(`form.q.${q}`)}
              <textarea
                className={FIELD}
                rows={q === 'steps' ? 6 : 2}
                required
                value={answers[q]}
                onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
              />
            </label>
          ))
        ) : (
          <label className="block text-sm">
            {t('form.skillText')}
            <textarea
              className={FIELD}
              rows={12}
              required
              maxLength={20000}
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
            />
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">{t('form.cases')}</legend>
        <p className="text-muted-foreground text-sm">{t('form.casesHint')}</p>
        {cases.map((c, i) => (
          <CaseEditor
            key={i}
            index={i}
            value={c}
            onChange={(next) => updateCase(i, next)}
            onRemove={cases.length > 1 ? () => setCases(cases.filter((_, j) => j !== i)) : null}
          />
        ))}
        {cases.length < 50 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCases([...cases, emptyCase()])}
          >
            {t('form.addCase')}
          </Button>
        ) : null}
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t('form.consent')}</span>
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!consent || !chosenRuntime || submit.isPending}>
        {t('form.submit')}
      </Button>
    </form>
  )
}

type CaseEditorProps = {
  index: number
  value: CaseDraft
  onChange: (next: CaseDraft) => void
  onRemove: (() => void) | null
}

function CaseEditor({ index, value, onChange, onRemove }: CaseEditorProps) {
  const t = useTranslations('knowbotRequests')
  const setExpectation = (j: number, next: ExpectationDraft) =>
    onChange({ ...value, expectations: value.expectations.map((e, k) => (k === j ? next : e)) })
  return (
    <div className="space-y-2 rounded-md border p-3">
      <label className="block text-sm">
        {t('form.question', { n: index + 1 })}
        <textarea
          className={FIELD}
          rows={2}
          required
          maxLength={4000}
          value={value.question}
          onChange={(e) => onChange({ ...value, question: e.target.value })}
        />
      </label>
      {value.expectations.map((e, j) => (
        <div key={j} className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
          <input
            aria-label={t('form.artifact')}
            placeholder={t('form.artifact')}
            className={FIELD}
            required
            value={e.artifact}
            onChange={(x) => setExpectation(j, { ...e, artifact: x.target.value })}
          />
          <input
            aria-label={t('form.path')}
            placeholder={t('form.path')}
            className={FIELD}
            required
            value={e.path}
            onChange={(x) => setExpectation(j, { ...e, path: x.target.value })}
          />
          <select
            aria-label={t('form.kind')}
            className={FIELD}
            value={e.kind}
            onChange={(x) =>
              setExpectation(j, { ...e, kind: x.target.value as ExpectationIn['kind'] })
            }
          >
            <option value="equals">{t('form.kinds.equals')}</option>
            <option value="approx">{t('form.kinds.approx')}</option>
            <option value="contains">{t('form.kinds.contains')}</option>
          </select>
          <input
            aria-label={t('form.value')}
            placeholder={t('form.value')}
            className={FIELD}
            required
            inputMode={e.kind === 'approx' ? 'decimal' : undefined}
            value={e.value}
            onChange={(x) => setExpectation(j, { ...e, value: x.target.value })}
          />
          {e.kind === 'approx' ? (
            <input
              aria-label={t('form.tolerance')}
              placeholder={t('form.tolerance')}
              className={FIELD}
              required
              inputMode="decimal"
              value={e.tolerance}
              onChange={(x) => setExpectation(j, { ...e, tolerance: x.target.value })}
            />
          ) : null}
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ ...value, expectations: [...value.expectations, emptyExpectation()] })
          }
        >
          {t('form.addExpectation')}
        </Button>
        {onRemove ? (
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            {t('form.removeCase')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
