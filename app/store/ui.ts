'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// 界面设置（SDD 0037）：左边导航收没收起、右边对照栏多宽，记在浏览器里；手机抽屉开没开不记。
type UiState = {
  sidebarCollapsed: boolean
  mobileNavigationOpen: boolean
  sidePanelWidth: number
  setSidebarCollapsed(value: boolean): void
  setMobileNavigationOpen(value: boolean): void
  setSidePanelWidth(value: number): void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavigationOpen: false,
      sidePanelWidth: 384,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileNavigationOpen: (mobileNavigationOpen) => set({ mobileNavigationOpen }),
      setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
    }),
    {
      name: 'sunmoonai-knowlab-web-ui-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ sidebarCollapsed, sidePanelWidth }) => ({ sidebarCollapsed, sidePanelWidth }),
    },
  ),
)
