import type { Metadata, Viewport } from 'next'
import '../styles/globals.css'
import { SiteHeader, SiteFooter } from '../components/Chrome'
import { PLATFORM_VERSION } from '../lib/schema/generated'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'BIFROST — an open multi-spectral sensing platform',
    template: '%s — BIFROST',
  },
  description:
    'BIFROST is an open, buildable sensor node that watches the sky across fourteen bands at once, timestamps everything to a common clock, and publishes what it records. Hardware, firmware, grid, and discriminator, versioned together.',
  applicationName: 'BIFROST',
  openGraph: {
    type: 'website',
    siteName: 'BIFROST',
    title: 'BIFROST — an open multi-spectral sensing platform',
    description:
      'Fourteen bands, one clock, an open archive. Build a node, join the grid, read the data.',
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0e12' },
    { media: '(prefers-color-scheme: light)', color: '#f7f7f6' },
  ],
  width: 'device-width',
  initialScale: 1,
}

// Applied before paint so a light-mode preference never flashes dark.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('bifrost-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-[var(--accent-ink)]"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter version={PLATFORM_VERSION} />
      </body>
    </html>
  )
}
