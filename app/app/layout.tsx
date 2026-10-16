import type { Metadata } from 'next'
import { connection } from 'next/server'
import { defaultLocale } from '@/i18n'
import { PlatformProviders } from '@/components/platform/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'knowlab App',
  description: 'knowlab web application',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // A request-bound render is required so Next can propagate the nonce from
  // Proxy to framework scripts and styles. Do not remove while CSP uses nonce.
  await connection()
  return (
    <html lang={defaultLocale} className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <PlatformProviders>{children}</PlatformProviders>
      </body>
    </html>
  )
}
