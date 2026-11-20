'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  getFormalVersion,
  sharedIncubationTools,
  chooseToolInstallation,
} from '@/lib/knowbots/formal-methods'
import { expertFromTool, expertFromToolContract } from '@/lib/knowbots/formal-orchestration'

type Reference = { method_id: string; version: number; digest: string }

export function useToolVersion(
  requestId: string,
  ref: Reference | undefined,
  shared: boolean,
  csrfToken: string,
) {
  const version = useQuery({
    queryKey: [
      'expert-source-version',
      requestId,
      shared,
      ref?.method_id,
      ref?.version,
      ref?.digest,
    ],
    enabled: !!ref,
    retry: false,
    queryFn: async () => {
      if (!ref) throw new Error('missing_version')
      if (shared) {
        const item = (await sharedIncubationTools(requestId, null, ref)).items[0]
        if (!item?.interface) throw new Error('missing_version')
        return { draft: expertFromToolContract(ref, item.interface), item }
      }
      const value = await getFormalVersion(ref.method_id, ref.version)
      if (value.digest !== ref.digest) throw new Error('method_integrity')
      return { draft: expertFromTool(value), item: null }
    },
  })
  const item = version.data?.item
  const binding = useMutation({
    mutationFn: async (id: string) => {
      const installation = item?.installations.find((x) => x.asset_id === id)
      if (!installation || !item) throw new Error('missing_installation')
      await chooseToolInstallation(requestId, item.reference, installation, csrfToken)
    },
    onSuccess: () => version.refetch(),
  })
  const proposed =
    version.isSuccess && !version.isFetching && (!shared || item?.selected)
      ? version.data.draft
      : null
  return { version, item, binding, proposed }
}

export function ToolInstallationChoice({
  item,
  pending,
  failed,
  onChoose,
}: {
  item: ReturnType<typeof useToolVersion>['item']
  pending: boolean
  failed: boolean
  onChoose: (id: string) => void
}) {
  const t = useTranslations('formalMethod')
  return (
    <>
      {item && (item.installations.length > 1 || !item.selected) && (
        <label className="block text-sm">
          {t('executionInstallation')}
          <select
            value={item.selected ?? ''}
            disabled={pending}
            onChange={(e) => onChoose(e.target.value)}
          >
            <option value="" disabled>
              {t('chooseInstallation')}
            </option>
            {item.installations.map((x) => (
              <option key={x.asset_id} value={x.asset_id}>
                {x.name}
                {x.account ? ' · ' + x.account : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {failed && <p role="alert">{t('versionUnavailable')}</p>}
    </>
  )
}

// Per-click callbacks are discarded when this preview unmounts or its key changes.
export function AdoptTool({
  requestId,
  item,
  disabled,
  onAdopt,
  onUnavailable,
  label,
}: {
  requestId: string
  item: ReturnType<typeof useToolVersion>['item']
  disabled: boolean
  onAdopt: () => void
  onUnavailable: () => void
  label: string
}) {
  const t = useTranslations('formalMethod')
  const confirm = useMutation({
    mutationKey: ['adopt-tool', requestId],
    mutationFn: async () => {
      if (!item) throw new Error('missing_version')
      const expected = item.installations.find((asset) => asset.asset_id === item.selected)
      const current = (await sharedIncubationTools(requestId, null, item.reference)).items[0]
      if (
        !expected ||
        !current?.interface ||
        current.selected !== expected.asset_id ||
        !current.installations.some(
          (asset) => asset.asset_id === expected.asset_id && asset.revision === expected.revision,
        )
      )
        throw new Error('incubation_binding_changed')
    },
  })
  return (
    <>
      <Button
        type="button"
        disabled={disabled || confirm.isPending}
        onClick={() =>
          item
            ? confirm.mutate(undefined, { onSuccess: onAdopt, onError: onUnavailable })
            : onAdopt()
        }
      >
        {label}
      </Button>
      {confirm.isError && <p role="alert">{t('versionUnavailable')}</p>}
    </>
  )
}
