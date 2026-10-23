'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type {
  CaseIn,
  ExpectationIn,
  IdeaIn,
  KnowbotRequestIn,
  SixAnswers,
  Version,
} from '@/contracts/knowbots'
import { useRouter } from '@/i18n/navigation'
import { ApiClientError } from '@/lib/common/api-client'
import { fetchRuntimes, reviseRequest, submitRequest } from '@/lib/knowbots/client'

import { KEY } from './shared'

const QUESTIONS = ['solves', 'not_solves', 'inputs', 'steps', 'outputs', 'correctness'] as const
const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'

type ExpectationDraft = {
  artifact: string
  path: string
  kind: ExpectationIn['kind']
  value: string
  tolerance: string
}
// answers：开步前提问预先给好的答案（改创意时照原样带上）
type CaseDraft = {
  question: string
  expectations: ExpectationDraft[]
  answers?: Record<string, string>
}

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
    input:
      c.answers && Object.keys(c.answers).length > 0
        ? { question: c.question.trim(), answers: c.answers }
        : { question: c.question.trim() },
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

/** 改创意时从上一版带过来的用例。 */
function fromVersion(version: Version): CaseDraft[] {
  return version.cases.map((raw) => {
    const input = (raw.input ?? {}) as { question?: unknown; answers?: unknown }
    const expectations = Array.isArray(raw.expectations)
      ? (raw.expectations as Record<string, unknown>[])
      : []
    const answers =
      input.answers && typeof input.answers === 'object'
        ? (input.answers as Record<string, string>)
        : undefined
    return {
      question: typeof input.question === 'string' ? input.question : '',
      answers,
      expectations: expectations.map((e) => ({
        artifact: String(e.artifact ?? ''),
        path: String(e.path ?? ''),
        kind: (['equals', 'approx', 'contains'].includes(String(e.kind))
          ? e.kind
          : 'equals') as ExpectationIn['kind'],
        value: String(e.value ?? ''),
        tolerance: e.tolerance == null ? '' : String(e.tolerance),
      })),
    }
  })
}

const NO_ANSWERS: SixAnswers = {
  solves: '',
  not_solves: '',
  inputs: '',
  steps: '',
  outputs: '',
  correctness: '',
}

// 提交一个创意（SDD 0027、0037）：方法用六问或一份 skill 写清楚，选运行方，给验收用例，同意数据用于
// 测试。方法只来自用户（C-L1）；我们受理后孵化准专家、测试，测试通过即是专家，你同意、我们审过才上架。
// 给了 revise 就是改创意：名称、运行方不变，从上一版带过来改，交了出一个新版本。
export function RequestForm({
  csrfToken,
  revise,
}: {
  csrfToken: string
  revise?: { requestId: string; version: Version }
}) {
  const t = useTranslations('knowbotRequests')
  const router = useRouter()
  const queryClient = useQueryClient()
  const runtimes = useQuery({
    queryKey: ['web', 'knowbot-runtimes'],
    queryFn: fetchRuntimes,
    enabled: !revise,
  })
  const before = revise?.version.idea
  const [title, setTitle] = useState('')
  const [runtime, setRuntime] = useState('')
  const [kind, setKind] = useState<'six_questions' | 'skill'>(before?.kind ?? 'six_questions')
  const [answers, setAnswers] = useState<SixAnswers>(
    before?.kind === 'six_questions' ? before.answers : NO_ANSWERS,
  )
  const [skill, setSkill] = useState(before?.kind === 'skill' ? before.skill : '')
  const [cases, setCases] = useState<CaseDraft[]>(
    revise ? fromVersion(revise.version) : [emptyCase()],
  )
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosenRuntime = runtime || (runtimes.data?.length === 1 ? runtimes.data[0] : '')
  const submit = useMutation({
    mutationFn: async () => {
      const idea: IdeaIn = kind === 'skill' ? { kind, skill } : { kind, answers }
      const revision = { idea, cases: toCases(cases), consent_test_data: true as const }
      if (revise) {
        await reviseRequest(revise.requestId, revision, csrfToken)
        return revise.requestId
      }
      const body: KnowbotRequestIn = { title: title.trim(), runtime: chosenRuntime, ...revision }
      return submitRequest(body, csrfToken)
    },
    onSuccess: async (requestId) => {
      await queryClient.invalidateQueries({ queryKey: KEY })
      router.push(`/applications?item=${requestId}`)
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
      {revise ? null : (
        <>
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
        </>
      )}

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
      <Button type="submit" disabled={!consent || (!revise && !chosenRuntime) || submit.isPending}>
        {revise ? t('form.submitRevision') : t('form.submit')}
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
