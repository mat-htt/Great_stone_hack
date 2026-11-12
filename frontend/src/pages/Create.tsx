import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CloudOff, ImagePlus, Sparkles } from 'lucide-react'
import { api, ApiError, media, track, type Photo, type Product, type Project } from '../api'
import { Avatar, Mascot } from '../components/Mascots'
import { TopBar } from '../components/ui'
import { errorText, useApp } from '../store'

interface GalleryItem { file: string; place: string; thumb: string; flaw: string | null }

export default function Create() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { toast, online } = useApp()
  const productId = params.get('product') || 'book-classic'
  const shared = params.get('shared') === '1'
  const [product, setProduct] = useState<Product | null>(null)
  const [library, setLibrary] = useState<Photo[] | null>(null)
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [queue, setQueue] = useState<File[]>([])
  const [advice, setAdvice] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<Product>(`/api/catalog/${productId}`).then(setProduct).catch(() => {})
    api<{ photos: Photo[] }>('/api/photos').then((r) => { setLibrary(r.photos.filter((p) => p.source !== 'ai')) }).catch(() => setLibrary([]))
    api<{ items: GalleryItem[] }>('/api/gallery').then((r) => setGallery(r.items)).catch(() => {})
  }, [productId])
  useEffect(() => { if (online && queue.length) upload(queue) }, [online])

  const max = product?.specs.photos?.max ?? 400
  const min = product?.specs.photos?.min ?? 1
  const single = max === 1

  const toggle = (id: string) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : single ? [id] : s.length >= max ? s : [...s, id])

  const upload = async (files: File[]) => {
    if (!files.length) return
    setProgress({ done: 0, total: files.length })
    const added: Photo[] = []; const failed: File[] = []; const rejected: string[] = []
    for (let i = 0; i < files.length; i += 4) {
      const fd = new FormData(); files.slice(i, i + 4).forEach((f) => fd.append('files', f))
      try {
        const r = await api<{ photos: Photo[]; rejected: { filename: string; reason: string }[] }>('/api/photos', { method: 'POST', body: fd })
        added.push(...r.photos); rejected.push(...r.rejected.map((x) => `${x.filename}: ${x.reason}`))
      } catch (e) { if (e instanceof ApiError && e.status === 0) failed.push(...files.slice(i, i + 4)); else rejected.push(errorText(e)) }
      setProgress({ done: Math.min(files.length, i + 4), total: files.length })
    }
    setProgress(null); setQueue(failed)
    if (failed.length) toast({ title: `${failed.length} фото ждут сети`, body: 'Догрузим автоматически', mascot: 'robot' })
    if (rejected.length) toast({ title: `Не загрузили ${rejected.length}`, body: rejected[0], kind: 'bad' })
    if (added.length) {
      setLibrary((l) => [...added, ...(l || [])])
      setSel((s) => single ? [added[0].id] : [...added.map((p) => p.id), ...s].slice(0, max))
      setAdvice(added.filter((p) => p.advice?.some((a) => a.who === 'robot')))
      track('photos_added', { count: added.length })
    }
  }

  // Совет Робота: необязательный. «Улучшить» — нейросеть, «Оставить» — фиксируем отказ.
  const decide = async (accept: boolean) => {
    const list = advice
    setAdvice([])
    for (const p of list) {
      const a = p.advice.find((x) => x.who === 'robot')!
      api(`/api/photos/${p.id}/advice`, { method: 'POST', json: { code: a.code, decision: accept ? 'accepted' : 'declined' } }).catch(() => {})
      if (accept) {
        try {
          const r = await api<{ photo: Photo }>(`/api/ai/photos/${p.id}/apply`, { method: 'POST', json: { tool: a.tool, params: a.params, replace: false } })
          setLibrary((l) => (l || []).map((x) => x.id === p.id ? { ...r.photo, advice: [] } : x))
          setSel((s) => s.map((x) => x === p.id ? r.photo.id : x))
        } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
      }
    }
    toast({ title: accept ? 'Готово, фото улучшены' : 'Оставили как есть', mascot: 'robot' })
  }

  const go = async () => {
    setBusy(true)
    try {
      const demo = sel.filter((x) => x.startsWith('g:')).map((x) => x.slice(2))
      const imported = demo.length ? (await api<{ photos: Photo[] }>('/api/gallery/import', { method: 'POST', json: { files: demo } })).photos.map((p) => p.id) : []
      let k = 0
      const ids = sel.map((x) => x.startsWith('g:') ? imported[k++] : x).filter(Boolean)
      const options: Record<string, string> = {}
      for (const k of ['size', 'cover', 'paper', 'template']) { const v = params.get(k); if (v) options[k] = v }
      const p = await api<Project>('/api/projects', { method: 'POST', json: { product_id: productId, photo_ids: ids, options, auto: true } })
      track('project_created', { product: productId })
      if (shared) { await api(`/api/projects/${p.id}/share`, { method: 'POST' }); nav(`/editor/${p.id}?share=1`) }
      else nav(p.product.kind === 'book' ? `/magic/${p.id}` : `/editor/${p.id}`)
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(false) }
  }

  const mine = (library || []).map((p) => ({ id: p.id, thumb: media(p.thumb), flag: p.advice?.some((a) => a.who === 'robot') }))
  const demo = gallery.map((g) => ({ id: `g:${g.file}`, thumb: g.thumb, flag: !!g.flaw && g.flaw !== 'duplicate' }))
  const Grid = ({ list }: { list: { id: string; thumb: string; flag: boolean }[] }) => (
    <div className="grid3" style={{ borderRadius: 18, overflow: 'hidden' }}>
      {list.map((it) => {
        const i = sel.indexOf(it.id)
        return (
          <button key={it.id} className={`pick ${i >= 0 ? 'sel' : ''}`} onClick={() => toggle(it.id)} aria-pressed={i >= 0}>
            <img src={it.thumb} alt="" loading="lazy" draggable={false} />
            <span className="check">{i >= 0 ? (single ? '✓' : i + 1) : ''}</span>
            {it.flag && <span className="badge b-warn flag" title="Робот советует улучшить">!</span>}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="screen">
      <TopBar back title={product?.title || 'Выбор фото'} glass />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple={!single} hidden onChange={(e) => { upload(Array.from(e.target.files || [])); e.target.value = '' }} />
      <main className="content no-dock">
        <button className="upload-hero" onClick={() => fileRef.current?.click()} disabled={!!progress}>
          <div className="uh-text">
            <div className="t-h2">{single ? 'Загрузить своё фото' : 'Загрузить свои фото'}</div>
            <div className="t-sm" style={{ opacity: .85, marginTop: 4 }}>{progress ? `Загружаю и анализирую ${progress.done}/${progress.total}` : 'С телефона или компьютера · JPEG, PNG до 25 МБ'}</div>
            <span className="uh-btn"><ImagePlus size={18} /> Выбрать</span>
          </div>
          <Mascot pose="cat-point" size={150} className="uh-cat" />
          {progress && <div className="progress" style={{ position: 'absolute', left: 18, right: 18, bottom: 12 }}><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
        </button>
        {queue.length > 0 && !progress && <div className="card flat row t-sm" style={{ marginTop: 12 }}><CloudOff size={18} /><span className="grow">{queue.length} фото в очереди — отправим, когда появится сеть</span></div>}
        {mine.length > 0 && (
          <section className="section" style={{ marginTop: 22 }}>
            <div className="section-head"><h2 className="t-h3">Ваши фото · {mine.length}</h2></div>
            <Grid list={mine} />
          </section>
        )}
        <section className="section" style={{ marginTop: 22 }}>
          <div className="section-head"><h2 className="t-h3">Или попробуйте на примерах</h2></div>
          <Grid list={demo} />
        </section>
      </main>

      <AnimatePresence>
        {advice.length > 0 && (
          <motion.div className="glass" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            style={{ position: 'fixed', left: '50%', x: '-50%', bottom: 'calc(env(safe-area-inset-bottom) + 92px)', width: 'min(456px, calc(100% - 24px))', borderRadius: 26, padding: 14, zIndex: 46, boxShadow: 'var(--shadow-2)' }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar who="robot" size={44} />
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{advice.length === 1 ? advice[0].advice[0].title : `${advice.length} фото можно улучшить`}</div>
                <div className="t-sm muted">{advice.length === 1 ? advice[0].advice[0].text : 'Смаз, тёмные кадры или мало пикселей. Это рекомендация — можно оставить как есть.'}</div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm grow" onClick={() => decide(false)}>Оставить как есть</button>
              <button className="btn btn-primary btn-sm grow" onClick={() => decide(true)}><Sparkles size={15} /> Улучшить</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bottom-cta">
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || (!shared && sel.length < min)} onClick={go}>
          {busy ? 'Готовим макет…' : shared ? `Создать альбом${sel.length ? ` · ${sel.length} фото` : ''}`
            : sel.length < min ? `Выберите ${single ? 'фото' : `ещё ${min - sel.length}`}` : `Продолжить · ${sel.length} фото`}
        </button>
      </div>
    </div>
  )
}
