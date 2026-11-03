'use client'

import {
  manualReleaseSchema,
  manualReleasesSchema,
  type ManualReleaseInput,
} from '@/contracts/manual-release'
import { requestJson } from '@/lib/common/api-client'
import { parse } from './client'

export async function fetchManualReleases() {
  return parse(manualReleasesSchema, await requestJson('/api/web/v1/knowbot-manual-releases')).items
}
export async function requestManualRelease(
  draft: string,
  body: ManualReleaseInput,
  csrfToken: string,
) {
  return parse(
    manualReleaseSchema,
    await requestJson(`/api/web/v1/knowbot-drafts/${encodeURIComponent(draft)}/manual-release`, {
      method: 'POST',
      body,
      csrfToken,
    }),
  )
}
