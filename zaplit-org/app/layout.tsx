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
  title: 'Zaplit.org — Agents for Good, Agents for Change',
  description: 'AI agents designed for nonprofits. Automate fundraising, donor management, and program coordination. Secure, affordable, and built for impact.',
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
    <html lang="en" className="">
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
