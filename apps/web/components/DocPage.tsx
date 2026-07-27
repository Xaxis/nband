import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Container } from './ui'
import { getDoc, listDocs } from '../lib/content'
import { PLATFORM_VERSION } from '../lib/schema/generated'

export function docMetadata(slug: string) {
  const doc = getDoc(slug)
  if (!doc) return {}
  return { title: doc.title, description: doc.description }
}

export function DocPage({ slug }: { slug: string }) {
  const doc = getDoc(slug)
  if (!doc) notFound()

  const all = listDocs()
  const drifted = doc.version !== PLATFORM_VERSION

  return (
    <>
      <section className="border-b border-[var(--line)]">
        <Container className="py-10 sm:py-12">
          <p className="eyebrow">{doc.section}</p>
          <h1 className="mt-2.5 max-w-[24ch] text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--ink)] sm:text-[40px]">
            {doc.title}
          </h1>
          <p className="mt-4 max-w-[66ch] text-[15.5px] leading-relaxed text-[var(--ink-2)]">
            {doc.description}
          </p>
          <div className="num mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-3)]">
            <span>
              written against firmware v{doc.version}
              {drifted && (
                <span className="ml-1.5 text-[#fab219]">· platform is now v{PLATFORM_VERSION}</span>
              )}
            </span>
            {doc.updated && <span>updated {doc.updated}</span>}
            <span>{doc.readingMinutes} min read</span>
            {doc.audience && <span className="text-[var(--ink-3)]">for: {doc.audience}</span>}
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_216px]">
          <article
            className="prose"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />

          <aside className="hidden lg:block">
            <div className="sticky top-20">
              {doc.headings.length > 0 && (
                <nav aria-label="On this page">
                  <p className="eyebrow mb-2.5">On this page</p>
                  <ul className="space-y-1.5 border-l border-[var(--line)]">
                    {doc.headings.map((h) => (
                      <li key={h.id} style={{ paddingLeft: h.depth === 3 ? 22 : 12 }}>
                        <a
                          href={`#${h.id}`}
                          className="block text-[12.5px] leading-snug text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <p className="eyebrow mb-2.5 mt-8">All documents</p>
              <ul className="space-y-1.5">
                {all.map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={`/${d.slug}`}
                      className={`block text-[12.5px] leading-snug transition-colors hover:text-[var(--ink)] ${
                        d.slug === slug ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
                      }`}
                    >
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </Container>
    </>
  )
}
