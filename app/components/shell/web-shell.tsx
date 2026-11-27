'use client'

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LogoutButton } from '@/components/auth/logout-button'
import { SignedInAs } from '@/components/auth/signed-in-as'
import { Link, usePathname } from '@/i18n/navigation'
import { findNavigationItem, webNavigation, type WebNavigationItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui'

type WebShellProps = {
  children: React.ReactNode
  locale: string
  csrfToken: string
  userLabel: string
  email?: string | null
}

export function WebShell({ children, locale, csrfToken, userLabel, email }: WebShellProps) {
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  const pathname = usePathname()
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const mobileOpen = useUiStore((state) => state.mobileNavigationOpen)
  const setMobileOpen = useUiStore((state) => state.setMobileNavigationOpen)
  const current = findNavigationItem(pathname)
  return (
    <div className="bg-background flex min-h-screen" data-route-class="authenticated-workspace">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          aria-label={t('closeMenu')}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:transition-[width]',
          collapsed ? 'lg:w-16' : 'lg:w-56',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-md text-sm font-semibold"
          >
            K
          </span>
          <strong className={cn('truncate', collapsed && 'lg:hidden')}>knowlab</strong>
        </div>
        <nav aria-label={t('mainNavigation')} className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <div className="flex flex-col gap-1" data-testid="nav-group-primary">
            {webNavigation.map((item) => (
              <NavigationLink
                key={item.key}
                item={item}
                label={t(item.key)}
                active={item.key === current?.key}
                collapsed={collapsed}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>

        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="hover:bg-accent rounded-md p-1.5 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t('openMenu')}
            >
              <Menu aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              className="hover:bg-accent hidden rounded-md p-1.5 lg:inline-flex"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? t('expandMenu') : t('collapseMenu')}
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden className="size-5" />
              ) : (
                <PanelLeftClose aria-hidden className="size-5" />
              )}
            </button>
            {current ? (
              <span className="text-muted-foreground truncate text-sm font-medium">
                {t(current.key)}
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <SignedInAs label={tAuth('signedInAs', { name: userLabel })} email={email} />
            <LogoutButton
              csrfToken={csrfToken}
              locale={locale}
              label={tAuth('logout')}
              errorLabel={tAuth('logoutFailed')}
            />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8" data-locale={locale}>
          {children}
        </main>
      </div>
    </div>
  )
}

function NavigationLink({
  item,
  label,
  active,
  collapsed,
  onNavigate,
}: {
  item: WebNavigationItem
  label: string
  active: boolean
  collapsed: boolean
  onNavigate(): void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.path}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
          : 'hover:bg-sidebar-accent',
        collapsed && 'lg:justify-center lg:px-0',
      )}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className={cn('truncate', collapsed && 'lg:hidden')}>{label}</span>
    </Link>
  )
}
