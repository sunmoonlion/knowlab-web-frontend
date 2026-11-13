'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CrossAppLink } from '@/components/common/cross-app-link'
import type { Step } from '@/contracts/workdraft'
import { fetchMethodCapabilities } from '@/lib/knowbots/client'

type Requirements = NonNullable<Step['advanced']['managed_capabilities']>

export function ManagedCapabilitiesEditor({
  requestId,
  value,
  onChange,
}: {
  requestId?: string
  value: Requirements | null | undefined
  onChange: (value: Requirements | null) => void
}) {
  const t = useTranslations('workdraft.managed')
  const [open, setOpen] = useState(false)
  const catalog = useQuery({
    queryKey: ['method-capabilities', requestId],
    queryFn: () => fetchMethodCapabilities(requestId!),
    enabled: open && !!requestId,
    staleTime: 30000,
  })
  const current = value ?? { tools: [], skills: [] }
  const requiredBySkill = (tool: Requirements['tools'][number]) =>
    current.skills.some((skill) =>
      skill.required_tools?.some(
        (required) => required.url === tool.url && required.name === tool.name,
      ),
    )
  return (
    <section className="space-y-3 rounded border p-3">
      <h4 className="font-medium">{t('title')}</h4>
      <p className="text-muted-foreground text-sm">{t('hint')}</p>
      {current.tools.map((tool) => (
        <div key={`${tool.url}:${tool.name}`} className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-words">
            {tool.name}
            <small className="text-muted-foreground block break-all">{tool.url}</small>
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={requiredBySkill(tool)}
            title={requiredBySkill(tool) ? t('requiredBySkill') : undefined}
            onClick={() =>
              onChange({
                ...current,
                tools: current.tools.filter(
                  (item) => item.url !== tool.url || item.name !== tool.name,
                ),
              })
            }
          >
            {t('remove')}
          </Button>
        </div>
      ))}
      {current.skills.map((skill) => (
        <div key={skill.name} className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-words">
            {skill.name} · {skill.version}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...current,
                skills: current.skills.filter((item) => item.name !== skill.name),
              })
            }
          >
            {t('remove')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={!requestId}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t('choose')}
      </Button>
      {open ? (
        <div className="space-y-3">
          <div className="flex gap-3">
            <CrossAppLink to="knowbench.settings" className="underline">
              {t('manage')}
            </CrossAppLink>
            <Button type="button" variant="outline" onClick={() => void catalog.refetch()}>
              {t('reload')}
            </Button>
          </div>
          {catalog.isPending ? <p role="status">{t('loading')}</p> : null}
          {catalog.isError ? <p role="alert">{t('unavailable')}</p> : null}
          {catalog.data ? (
            <>
              <fieldset className="space-y-2">
                <legend className="font-medium">MCP</legend>
                {catalog.data.tools.map((tool) => {
                  const selected = current.tools.some(
                    (item) => item.url === tool.url && item.name === tool.name,
                  )
                  return (
                    <label
                      key={`${tool.url}:${tool.name}`}
                      className="flex items-start gap-2 rounded border p-2"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={
                          requiredBySkill(tool) || (!selected && current.tools.length >= 30)
                        }
                        onChange={(e) =>
                          onChange({
                            ...current,
                            tools: e.target.checked
                              ? [...current.tools, { url: tool.url, name: tool.name }]
                              : current.tools.filter(
                                  (item) => item.url !== tool.url || item.name !== tool.name,
                                ),
                          })
                        }
                      />
                      <span className="min-w-0 break-words">
                        {tool.service_name} · {tool.name}
                        <small className="text-muted-foreground block">{tool.description}</small>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="font-medium">Skill</legend>
                {catalog.data.skills.map((skill) => {
                  const requiredTools = skill.required_tools ?? []
                  const combinedTools = [...current.tools]
                  for (const tool of requiredTools) {
                    if (
                      !combinedTools.some(
                        (item) => item.url === tool.url && item.name === tool.name,
                      )
                    ) {
                      combinedTools.push(tool)
                    }
                  }
                  const selected = current.skills.some(
                    (item) =>
                      item.name === skill.name &&
                      item.digest === skill.digest &&
                      item.version === skill.version,
                  )
                  return (
                    <label
                      key={`${skill.name}:${skill.version}:${skill.digest}`}
                      className="flex items-start gap-2 rounded border p-2"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={
                          !selected &&
                          (skill.unresolved_dependencies ||
                            combinedTools.length > 30 ||
                            (current.skills.length >= 10 &&
                              !current.skills.some((item) => item.name === skill.name)))
                        }
                        onChange={(e) =>
                          onChange({
                            ...current,
                            tools: e.target.checked ? combinedTools : current.tools,
                            skills: [
                              ...current.skills.filter((item) => item.name !== skill.name),
                              ...(e.target.checked
                                ? [
                                    {
                                      name: skill.name,
                                      version: skill.version,
                                      digest: skill.digest,
                                      ...(requiredTools.length
                                        ? { required_tools: requiredTools }
                                        : {}),
                                    },
                                  ]
                                : []),
                            ],
                          })
                        }
                      />
                      <span className="min-w-0 break-words">
                        {skill.name} · {skill.version}
                        <small className="text-muted-foreground block">{skill.description}</small>
                        {requiredTools.length ? (
                          <small className="text-muted-foreground block">
                            {t('declaresTools', {
                              tools: requiredTools
                                .map((tool) => `${tool.name} (${tool.url})`)
                                .join(', '),
                            })}
                          </small>
                        ) : null}
                        {skill.unresolved_dependencies ? (
                          <small className="text-destructive block">
                            {t('unresolvedDependencies')}
                          </small>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </fieldset>
              {!catalog.data.tools.length && !catalog.data.skills.length ? (
                <p>{t('empty')}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
