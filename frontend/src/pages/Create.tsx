import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CloudOff, Droplets, ImagePlus, Sparkles, Upload } from 'lucide-react'
import { api, ApiError, media, track, type Photo, type Product, type Project } from '../api'
import { Say } from '../components/Mascots'
import { Sheet, TopBar } from '../components/ui'
import { errorText, useApp } from '../store'

type Src = 'library' | 'gallery'
interface GalleryItem { file: string; place: string; taken_at: string; thumb: string; flaw: string | null }

export default function Create() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { toast, online } = useApp()
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState(params.get('product') || 'photobook-premium')
  const [src, setSrc] = useState<Src>('library')
  const [library, setLibrary] = useState<Photo[] | null>(null)
  const [gallery, setGallery] = useState<GalleryItem[] | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [selG, setSelG] = useState<string[]>([])
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null)
  const [rejected, setRejected] = useState<{ filename: string; reason: string }[]>([])
  const [queue, setQueue] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const shared = params.get('shared') === '1'

  useEffect(() => {
    api<{ items: Product[] }>('/api/catalog').then((r) => setProducts(r.items)).catch(() => {})
    api<{ photos: Photo[] }>('/api/photos').then((r) => {
      const lib = r.photos.filter((p) => p.source !== 'ai')
      setLibrary(lib)
      if (!lib.length) setSrc('gallery')
    }).catch(() => setLibrary([]))
    api<{ items: GalleryItem[] }>('/api/gallery').then((r) => setGallery(r.items)).catch(() => setGallery([]))
  }, [])

  useEffect(() => { if (online && queue.length) uploadFiles(queue) }, [online]) // офлайн-очередь

  const product = products.find((p) => p.id === productId)
  const count = src === 'library' ? sel.length : selG.length
  const minPhotos = product?.specs.photos?.min ?? 1

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    setUpload({ done: 0, total: files.length })
    setRejected([])
    const added: Photo[] = []
    const failed: File[] = []
    for (let i = 0; i < files.length; i += 4) {
      const chunk = files.slice(i, i + 4)
      const fd = new FormData()
      chunk.forEach((f) => fd.append('files', f))
      try {
        const r = await api<{ photos: Photo[]; rejected: any[] }>('/api/photos', { method: 'POST', body: fd })
        added.push(...r.photos)
        setRejected((x) => [...x, ...r.rejected])
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) failed.push(...chunk)
        else setRejected((x) => [...x, ...chunk.map((f) => ({ filename: f.name, reason: errorText(e) }))])
      }
      setUpload({ done: Math.min(files.length, i + 4), total: files.length })
    }
    setUpload(null)
    setQueue(failed)
    if (failed.length) toast({ title: `${failed.length} фото ждут сети`, body: 'Догрузим автоматически, когда связь вернётся', mascot: 'robot' })
    if (added.length) {
      setLibrary((l) => [...added, ...(l || [])])
      setSel((s) => [...added.map((p) => p.id), ...s])
      setSrc('library')
      track('photos_added', { count: added.length })
    }
  }

  const toggle = (id: string, isGallery = false) => {
    const setter = isGallery ? setSelG : setSel
    setter((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const go = async () => {
    setBusy(true)
    try {
      let ids = sel
      if (src === 'gallery') {
        const r = await api<{ photos: Photo[] }>('/api/gallery/import', { method: 'POST', json: { files: selG } })
        ids = r.photos.map((p) => p.id)
      }
      const options: Record<string, string> = {}
      for (const k of ['size', 'cover', 'paper']) { const v = params.get(k); if (v) options[k] = v }
      const p = await api<Project>('/api/projects', { method: 'POST', json: { product_id: productId, photo_ids: ids, options, auto: true } })
      track('project_created', { product: productId })
      if (shared) {
        await api(`/api/projects/${p.id}/share`, { method: 'POST' })
        nav(`/editor/${p.id}?share=1`)
      } else nav(`/magic/${p.id}`)
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(false) }
  }

  const groups = useMemo(() => {
    const list = (library || []).slice().sort((a, b) => (b.taken_at || '').localeCompare(a.taken_at || ''))
    const out: { title: string; items: Photo[] }[] = []
    for (const p of list) {
      const t = p.place ? `${p.place}` : p.taken_at ? new Date(p.taken_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : 'Загруженные'
      const g = out.find((x) => x.title === t)
      g ? g.items.push(p) : out.push({ title: t, items: [p] })
    }
    return out
  }, [library])

  const flag = (p: { sharpness?: number; width?: number; height?: number; flaw?: string | null }) => {
    if (p.flaw === 'blur' || (p.sharpness !== undefined && p.sharpness < 0.12)) return <span className="pill pill-warn flag" title="Размыто"><Droplets size={12} /></span>
    if (p.flaw === 'lowres' || (p.width && Math.min(p.width, p.height || 0) < 900)) return <span className="pill pill-warn flag" title="Низкое разрешение"><AlertTriangle size={12} /></span>
    return null
  }

  return (
    <div className="phone">
      <TopBar back title={shared ? 'Общий альбом' : 'Выберите фото'} right={
        <button className="chip coral" onClick={() => setPick(true)} style={{ maxWidth: 150, overflow: 'hidden' }}>{product?.title || 'Продукт'}</button>} />
      <main className="page no-tab">
        <Say who="cat" hand>
          {shared ? 'Добавьте свои фото, а потом пригласите остальных по ссылке.'
            : 'Берите хоть 200 фото — дубли и смазанные я уберу сам.'}
        </Say>
        <div className="seg" style={{ marginTop: 16 }} role="tablist">
          <button role="tab" aria-selected={src === 'library'} className={src === 'library' ? 'active' : ''} onClick={() => setSrc('library')}>Мои фото {library ? `· ${library.length}` : ''}</button>
          <button role="tab" aria-selected={src === 'gallery'} className={src === 'gallery' ? 'active' : ''} onClick={() => setSrc('gallery')}>Тестовая галерея</button>
        </div>

        <button className="card row" style={{ width: '100%', border: '2px dashed var(--line-strong)', boxShadow: 'none', marginTop: 12, cursor: 'pointer', background: 'transparent' }}
          onClick={() => fileRef.current?.click()} disabled={!!upload}>
          <div className="center" style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--coral-50)', color: 'var(--coral)' }}><ImagePlus size={22} /></div>
          <div style={{ textAlign: 'left' }} className="grow">
            <div className="h3">Загрузить с телефона</div>
            <div className="small muted">JPEG или PNG, до 25 МБ, от 400 px</div>
          </div>
          <Upload size={20} color="var(--muted)" />
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => { uploadFiles(Array.from(e.target.files || [])); e.target.value = '' }} />

        {upload && (
          <div className="card stack" style={{ marginTop: 10, gap: 8 }}>
            <div className="between small"><span>Загружаю и анализирую…</span><b>{upload.done}/{upload.total}</b></div>
            <div className="progress"><div style={{ width: `${(upload.done / upload.total) * 100}%` }} /></div>
          </div>
        )}
        {queue.length > 0 && !upload && (
          <div className="card row small" style={{ marginTop: 10 }}><CloudOff size={18} color="var(--coral)" />
            <span className="grow">{queue.length} фото в очереди — отправим при появлении сети</span>
            <button className="btn btn-sm btn-ghost" onClick={() => uploadFiles(queue)}>Повторить</button></div>
        )}
        {rejected.length > 0 && (
          <div className="card stack" style={{ marginTop: 10, gap: 6, background: 'var(--coral-50)', boxShadow: 'none' }} role="alert">
            <div className="h3" style={{ color: 'var(--coral-600)' }}>Не получилось загрузить {rejected.length}</div>
            {rejected.slice(0, 4).map((r, i) => <div key={i} className="small"><b>{r.filename}</b>: {r.reason}</div>)}
          </div>
        )}

        {src === 'library' ? (
          library === null ? <div className="grid3" style={{ marginTop: 14 }}>{Array.from({ length: 9 }).map((_, i) => <div key={i} className="tile skeleton" />)}</div>
            : library.length === 0 ? <div className="empty muted">Пока пусто — загрузите фото или возьмите тестовую галерею</div>
              : groups.map((g) => (
                <div key={g.title} style={{ marginTop: 16 }}>
                  <div className="between" style={{ marginBottom: 8 }}>
                    <div className="h3" style={{ textTransform: 'capitalize' }}>{g.title}</div>
                    <button className="link small" onClick={() => {
                      const ids = g.items.map((p) => p.id)
                      const all = ids.every((id) => sel.includes(id))
                      setSel((s) => all ? s.filter((x) => !ids.includes(x)) : Array.from(new Set([...s, ...ids])))
                    }}>{g.items.every((p) => sel.includes(p.id)) ? 'Снять' : 'Выбрать все'}</button>
                  </div>
                  <div className="grid3">
                    {g.items.map((p) => (
                      <button key={p.id} className={`tile ${sel.includes(p.id) ? 'selected' : ''}`} onClick={() => toggle(p.id)} aria-pressed={sel.includes(p.id)} aria-label={p.filename}>
                        <img src={media(p.thumb)} alt="" loading="lazy" />
                        <span className="check">{sel.includes(p.id) ? sel.indexOf(p.id) + 1 : ''}</span>
                        {flag(p)}
                      </button>
                    ))}
                  </div>
                </div>
              ))
        ) : (
          <div style={{ marginTop: 16 }}>
            <div className="between" style={{ marginBottom: 8 }}>
              <div className="small muted">Синтетические фото для проверки: есть дубли, смаз и малое разрешение</div>
              <button className="link small" onClick={() => setSelG(selG.length ? [] : (gallery || []).map((g) => g.file))}>{selG.length ? 'Снять' : 'Все'}</button>
            </div>
            <div className="grid3">
              {(gallery || []).map((g) => (
                <button key={g.file} className={`tile ${selG.includes(g.file) ? 'selected' : ''}`} onClick={() => toggle(g.file, true)} aria-pressed={selG.includes(g.file)}>
                  <img src={g.thumb} alt={g.place} loading="lazy" />
                  <span className="check">{selG.includes(g.file) ? selG.indexOf(g.file) + 1 : ''}</span>
                  {flag(g)}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
      <div className="fixed-cta">
        <motion.button className="btn btn-primary btn-lg btn-block" disabled={busy || count < (shared ? 0 : minPhotos)} onClick={go}
          animate={{ scale: count ? 1 : 0.98 }}>
          <Sparkles size={20} />
          {busy ? 'Кот берётся за дело…' : shared ? `Создать альбом${count ? ` · ${count} фото` : ''}`
            : count < minPhotos ? `Выберите ещё ${minPhotos - count}` : `Кот, собери! · ${count} фото`}
        </motion.button>
      </div>

      <Sheet open={pick} onClose={() => setPick(false)} label="Выбор продукта">
        <div className="h2" style={{ marginBottom: 12 }}>Что делаем?</div>
        <div className="option-list">
          {products.map((p) => (
            <button key={p.id} className={`option ${p.id === productId ? 'active' : ''}`} onClick={() => { setProductId(p.id); setPick(false) }}>
              <span className="radio" /><span className="grow"><b>{p.title}</b><div className="small muted">{p.subtitle}</div></span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
