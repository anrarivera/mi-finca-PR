import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import termsEs from '@/legal/terms-es.md?raw'
import termsEn from '@/legal/terms-en.md?raw'
import privacyEs from '@/legal/privacy-es.md?raw'
import privacyEn from '@/legal/privacy-en.md?raw'

// ──────────────────────────────────────────────────────────────────────────
// Public legal pages (/terms, /privacy). The documents live as markdown in
// src/legal — the same files a lawyer reviews are the files that render,
// so they can never drift apart. Minimal renderer: #/## headings, bold,
// bullets, paragraphs; anything fancier belongs in the documents' prose.
// ──────────────────────────────────────────────────────────────────────────

const DOCS = {
  terms: { es: termsEs, en: termsEn },
  privacy: { es: privacyEs, en: privacyEn },
}

function renderInline(text: string): React.ReactNode[] {
  // **bold** only — split and alternate
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-[#2d4a1e]">{part}</strong> : part
  )
}

function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n\n+/)
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => {
        const b = block.trim()
        if (!b) return null
        if (b.startsWith('# ')) {
          return <h1 key={i} className="text-2xl font-bold text-[#2d4a1e]">{b.slice(2)}</h1>
        }
        if (b.startsWith('## ')) {
          return <h2 key={i} className="text-base font-semibold text-[#2d4a1e] mt-2">{b.slice(3)}</h2>
        }
        if (b.split('\n').every(l => l.trim().startsWith('- '))) {
          return (
            <ul key={i} className="list-disc pl-5 flex flex-col gap-1.5 text-sm text-[#5a6a4a] leading-relaxed">
              {b.split('\n').map((l, j) => <li key={j}>{renderInline(l.trim().slice(2))}</li>)}
            </ul>
          )
        }
        return (
          <p key={i} className="text-sm text-[#5a6a4a] leading-relaxed">
            {renderInline(b.replace(/\n/g, ' '))}
          </p>
        )
      })}
    </div>
  )
}

export default function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const { i18n, t } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es'

  return (
    <div className="min-h-dvh bg-[#f7f9f4]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="text-sm font-semibold text-[#639922] hover:underline">
            ← Mi Finca PR
          </Link>
          <button
            onClick={() => i18n.changeLanguage(lang === 'es' ? 'en' : 'es')}
            className="text-xs text-[#7a8a6a] border border-[#d0dcc0] rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors"
          >
            {lang === 'es' ? 'English' : 'Español'}
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-[#e0e8d8] px-6 sm:px-10 py-8">
          <Markdown source={DOCS[doc][lang]} />
        </div>
        <p className="text-xs text-[#9aab8a] text-center mt-6">
          <Link to={doc === 'terms' ? '/privacy' : '/terms'} className="hover:underline text-[#639922]">
            {doc === 'terms' ? t('legal.privacyLink') : t('legal.termsLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
