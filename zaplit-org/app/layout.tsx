import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, JetBrains_Mono, Playfair_Display } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ErrorBoundary } from '@/components/error-boundary'
import { SkipLink } from '@/components/skip-link'
import './globals.css'

const geistSans = Geist({ 
  subsets: ["latin"],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: '--font-geist-mono',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: '--font-jetbrains',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Zaplit — Hire a Digital Team, Not Software',
  description: 'Boutique AI agent agency. Pre-built agent teams with white-glove deployment. No subscriptions, just results.',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#141414' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://img.logo.dev" />
        <link rel="dns-prefetch" href="https://img.logo.dev" />
        <link rel="preconnect" href="https://n8n.zaplit.com" />
        <link rel="dns-prefetch" href="https://n8n.zaplit.com" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${playfair.variable} font-sans antialiased`}>
        <SkipLink />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  )
}
