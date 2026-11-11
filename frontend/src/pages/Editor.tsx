import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Cloud, CloudOff, Copy, Crop, Droplets, Expand, Focus, Frame, History, ImagePlus, LayoutGrid,
  Loader2, Mic, Palette, Plus, Quote, RefreshCw, Replace, ScanFace, Scissors, Send, Share2, Shuffle, SlidersHorizontal, Sparkles, Stars,
  Trash2, Undo2, Users, Wand2,
} from 'lucide-react'
import { api, ApiError, media, track, type AiTool, type Layout, type Page, type Photo, type Preflight, type Project } from '../api'
import { Cat, Robot } from '../components/Mascots'
import { BeforeAfter, Img, PageView, Sheet, TEMPLATES, aspectOf } from '../components/ui'
import { errorText, getLocal, pushDraft, saveLocal, useApp } from '../store'

const ICONS: Record<string, any> = {
  wand: Wand2, expand: Expand, focus: Focus, drop: Droplets, face: ScanFace, history: History, scissors: Scissors, palette: Palette,
  frame: Frame, sliders: SlidersHorizontal, stars: Stars,
}
const STYLES = [
  { id: 'film', label: 'Плёнка' }, { id: 'warm', label: 'Тёплый' }, { id: 'cool', label: 'Холодный' }, { id: 'bw', label: 'Ч/Б' },
  { id: 'vintage', label: 'Винтаж' }, { id: 'vivid', label: 'Сочный' }, { id: 'soft', label: 'Мягкий' },
]
type Sel = { page: number; slot: number } | null
type SaveState = 'saved' | 'saving' | 'offline' | 'error'
interface ChatMsg { from: 'me' | 'cat'; text: string; pending?: boolean }

export default function Editor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { toast, user } = useApp()
  const [project, setProject] = useState<Project | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [title, setTitle] = useState('')
  const [revision, setRevision] = useState(0)
  const [spread, setSpread] = useState(-1) // -1 = обложка
  const [sel, setSel] = useState<Sel>(null)
  const [save, setSave] = useState<SaveState>('saved')
  const [tools, setTools] = useState<AiTool[]>([])
  const [toolSheet, setToolSheet] = useState<AiTool | null>(null)
  const [preview, setPreview] = useState<{ before: string; after: string; meta: string } | null>(null)
  const [toolParams, setToolParams] = useState<Record<string, any>>({})
  const [working, setWorking] = useState<string | null>(null)
  const [pf, setPf] = useState<Preflight | null>(null)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(params.get('share') === '1')
  const [titleOpen, setTitleOpen] = useState(false)
  const history = useRef<{ layout: Layout; title: string }[]>([])
  const saveTimer = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const p = await api<Project>(`/api/projects/${id}`)
      const local = await getLocal(p.id)
      if (local?.dirty && local.revision === p.revision) {
        setLayout(local.layout); setTitle(local.title)
        toast({ title: 'Восстановили несохранённые правки', body: 'Черновик был сохранён на телефоне', mascot: 'robot' })
      } else { setLayout(p.layout); setTitle(p.title) }
      setProject(p); setRevision(p.revision)
      if (p.status !== 'draft') toast({ title: 'Этот проект уже заказан', body: 'Изменения недоступны', mascot: 'robot' })
    } catch (e) {
      const local = await getLocal(id!)
      if (local) { setLayout(local.layout); setTitle(local.title); setRevision(local.revision); setSave('offline') }
      else toast({ title: errorText(e), kind: 'bad' })
    }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { api<{ items: AiTool[] }>('/api/ai/tools').then((r) => setTools(r.items)).catch(() => {}) }, [])

  const photos = useMemo(() => Object.fromEntries((project?.photos || []).map((p) => [p.id, p])), [project]) as Record<string, Photo>
  const isBook = project?.product?.kind === 'book' || project?.product?.kind === 'calendar'
  const aspect = aspectOf(project?.product, project?.options.size)
  const pages = layout?.pages || []
  const spreads = isBook ? Math.ceil(pages.length / 2) : pages.length
  const canEdit = project?.status === 'draft'
  const isOwner = project?.owner_id === user?.id

  // ---------- Сохранение ----------
  const persist = useCallback((next: Layout, nextTitle: string, rev: number) => {
    if (!project) return
    saveLocal({ id: project.id, title: nextTitle, options: project.options, layout: next, revision: rev, dirty: true })
    setSave('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await pushDraft({ id: project.id, title: nextTitle, options: project.options, layout: next, revision: rev, dirty: true })
        setRevision(r); setSave('saved')
      } catch (e) { setSave(e instanceof ApiError && e.status === 0 ? 'offline' : 'error') }
    }, 700)
  }, [project])

  const commit = (next: Layout, nextTitle = title, record = true) => {
    if (!canEdit) return
    if (record && layout) history.current = [...history.current.slice(-30), { layout, title }]
    setLayout(next); setTitle(nextTitle)
    persist(next, nextTitle, revision)
  }

  const flush = async () => {
    clearTimeout(saveTimer.current)
    if (!project || !layout || save === 'saved') return revision
    const r = await pushDraft({ id: project.id, title, options: project.options, layout, revision, dirty: true })
    setRevision(r); setSave('saved')
    return r
  }

  const refetch = async () => {
    const p = await api<Project>(`/api/projects/${id}`)
    setProject(p); setLayout(p.layout); setTitle(p.title); setRevision(p.revision)
    saveLocal({ id: p.id, title: p.title, options: p.options, layout: p.layout, revision: p.revision, dirty: false })
    return p
  }

  const undo = () => {
    const prev = history.current.pop()
    if (prev) { setLayout(prev.layout); setTitle(prev.title); persist(prev.layout, prev.title, revision) }
  }

  // ---------- Предпечатная проверка (фоново) ----------
  useEffect(() => {
    if (!project || save === 'saving') return
    const t = setTimeout(() => api<Preflight>(`/api/projects/${project.id}/preflight`).then(setPf).catch(() => {}), 400)
    return () => clearTimeout(t)
  }, [project, revision, save])

  const issueMap = useMemo(() => {
    const m: Record<number, Record<string, 'critical' | 'warning'>> = {}
    for (const i of pf?.issues || []) {
      if (i.page === null || i.slot === null || i.severity === 'info') continue
      m[i.page] ||= {}
      if (m[i.page][i.slot] !== 'critical') m[i.page][i.slot] = i.severity as any
    }
    return m
  }, [pf])

  // ---------- Действия со страницами ----------
  const selPhotoId = sel ? pages[sel.page]?.slots[sel.slot]?.photo_id : null
  const selPhoto = selPhotoId ? photos[selPhotoId] : null
  const visiblePages = isBook ? (spread < 0 ? [] : [spread * 2, spread * 2 + 1].filter((i) => i < pages.length)) : [Math.max(0, spread)]

  const setPageTemplate = (pi: number, template: string) => {
    const next = structuredClone(layout!) as Layout
    const pg = next.pages[pi]
    const ids = pg.slots.map((s) => s.photo_id).filter(Boolean) as string[]
    const n = TEMPLATES[template].slots.length
    pg.template = template
    pg.slots = Array.from({ length: n }).map((_, i) => ({ photo_id: ids[i] ?? null, crop: { x: 0.5, y: 0.45, zoom: 1 } }))
    if (TEMPLATES[template].caption && pg.caption === undefined) pg.caption = ''
    commit(next)
    if (ids.length > n) toast({ title: `${ids.length - n} фото вернулись в библиотеку проекта`, mascot: 'cat' })
  }

  const addPage = () => {
    const next = structuredClone(layout!) as Layout
    const used = new Set(next.pages.flatMap((p) => p.slots.map((s) => s.photo_id)))
    const free = (project?.photos || []).filter((p) => !used.has(p.id))
    const at = isBook ? Math.min(pages.length, (Math.max(spread, 0) + 1) * 2) : pages.length
    const mk = (pid: string | null): Page => ({ id: `p${Math.random().toString(36).slice(2, 9)}`, template: 'full', slots: [{ photo_id: pid, crop: { x: 0.5, y: 0.45, zoom: 1 } }] })
    const add = isBook ? [mk(free[0]?.id ?? null), mk(free[1]?.id ?? null)] : [mk(free[0]?.id ?? null)]
    next.pages.splice(at, 0, ...add)
    commit(next)
    if (isBook) setSpread(Math.floor(at / 2))
  }

  const removePage = (pi: number) => {
    const next = structuredClone(layout!) as Layout
    next.pages.splice(pi, 1)
    commit(next)
    setSel(null)
  }

  const setSlotPhoto = (pi: number, si: number, photoId: string | null) => {
    const next = structuredClone(layout!) as Layout
    if (pi === -1) next.cover = { photo_id: photoId, crop: { x: 0.5, y: 0.45, zoom: 1 } }
    else next.pages[pi].slots[si] = { photo_id: photoId, crop: { x: 0.5, y: 0.45, zoom: 1 } }
    commit(next)
  }

  const setCrop = (crop: { x: number; y: number; zoom: number }, record = false) => {
    if (!sel) return
    const next = structuredClone(layout!) as Layout
    next.pages[sel.page].slots[sel.slot].crop = crop
    commit(next, title, record)
  }

  const relayout = async (mode: string) => {
    setWorking(mode)
    try {
      await flush()
      const p = await api<Project>(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode } })
      history.current.push({ layout: layout!, title })
      setProject(p); setLayout(p.layout); setTitle(p.title); setRevision(p.revision); setSel(null)
      return p
    } finally { setWorking(null) }
  }

  // ---------- AI-инструменты ----------
  const openTool = async (t: AiTool) => {
    if (!selPhoto) return
    setToolSheet(t); setPreview(null)
    const defaults: Record<string, any> = {}
    Object.entries(t.params || {}).forEach(([k, v]: any) => { defaults[k] = v.default })
    if (t.id === 'smart_extend') defaults.aspect = slotAspect()
    setToolParams(defaults)
    if (!t.manual && t.id !== 'scene_magic') runPreview(t.id, defaults)
  }

  const slotAspect = () => {
    if (!sel) return 1
    const tpl = TEMPLATES[pages[sel.page].template]
    const b = tpl.slots[Math.min(sel.slot, tpl.slots.length - 1)]
    return +(b[2] * aspect / b[3]).toFixed(3)
  }

  const runPreview = async (tool: string, p: Record<string, any>) => {
    if (!selPhoto) return
    setPreview(null)
    try {
      const res: Response = await api(`/api/ai/photos/${selPhoto.id}/preview`, { method: 'POST', json: { tool, params: p } })
      const blob = await res.blob()
      const status = res.headers.get('X-AI-Status')
      setPreview({ before: media(selPhoto.thumb), after: URL.createObjectURL(blob),
        meta: `${res.headers.get('X-AI-Provider') === 'builtin' ? 'Встроенный движок' : res.headers.get('X-AI-Provider')} · ${res.headers.get('X-AI-Duration')} мс${status === 'fallback' ? ' · резервный режим' : ''}` })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }); setToolSheet(null) }
  }

  const applyTool = async (tool: string, p: Record<string, any>, photoId = selPhoto?.id, quiet = false) => {
    if (!photoId) return
    setWorking(tool)
    try {
      await flush()
      const r = await api<{ photo: Photo; ai: any }>(`/api/ai/photos/${photoId}/apply`, { method: 'POST', json: { tool, params: p, project_id: id, replace: true } })
      track('ai_used', { tool })
      await refetch()
      if (!quiet) toast({ title: 'Готово!', body: r.ai.status === 'fallback' ? 'Внешняя модель недоступна — сработал встроенный движок' : `${r.ai.provider_title} · ${(r.ai.duration_ms / 1000).toFixed(1)} с`, mascot: 'cat' })
      setToolSheet(null)
      return r
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setWorking(null) }
  }

  const revert = async () => {
    if (!selPhoto?.parent_id) return
    setWorking('revert')
    try { await flush(); await api(`/api/ai/photos/${selPhoto.id}/revert?project_id=${id}`, { method: 'POST' }); await refetch(); toast({ title: 'Вернули оригинал', mascot: 'cat' }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setWorking(null) }
  }

  // ---------- Кот-ассистент ----------
  const runCommand = async (q: string) => {
    if (!q.trim()) return
    setText(''); setChatOpen(true)
    setChat((c) => [...c, { from: 'me', text: q }, { from: 'cat', text: 'Думаю…', pending: true }])
    try {
      const plan = await api<{ reply: string; actions: any[] }>('/api/ai/command', { method: 'POST', json: { text: q, project_id: id, selected_photo_id: selPhoto?.id } })
      setChat((c) => [...c.slice(0, -1), { from: 'cat', text: plan.reply + (plan.actions.length ? ' Делаю…' : ''), pending: !!plan.actions.length }])
      let cur = layout!
      let curTitle = title
      for (const a of plan.actions) {
        if (a.type === 'photo_tool' || a.type === 'adjust') {
          const tool = a.type === 'adjust' ? 'adjust' : a.tool
          const ids = a.scope === 'selected' && selPhoto ? [selPhoto.id]
            : Array.from(new Set(cur.pages.flatMap((p) => p.slots.map((s) => s.photo_id)).filter(Boolean))).slice(0, 10) as string[]
          for (let i = 0; i < ids.length; i++) {
            setChat((c) => [...c.slice(0, -1), { from: 'cat', text: `${plan.reply} Обрабатываю ${i + 1}/${ids.length}…`, pending: true }])
            await applyTool(tool, a.params || {}, ids[i], true)
          }
          const p = await refetch(); cur = p.layout; curTitle = p.title
        } else if (a.type === 'layout') {
          if (a.op === 'remove_page' && a.page >= 1 && a.page <= cur.pages.length) {
            const next = structuredClone(cur); next.pages.splice(a.page - 1, 1); commit(next, curTitle); cur = next
          } else if (a.op === 'add_page') { addPage() }
          else {
            const mode = a.op === 'auto_cover' ? 'cover' : a.op === 'relayout' ? 'curate' : a.op
            const p = await relayout(mode); if (p) { cur = p.layout; curTitle = p.title }
          }
        } else if (a.type === 'title') { commit(cur, a.value); curTitle = a.value }
      }
      setChat((c) => [...c.slice(0, -1), { from: 'cat', text: plan.actions.length ? `${plan.reply} Готово! Не нравится — жми «Отменить».` : plan.reply }])
      track('ai_used', { tool: 'command' })
    } catch (e) { setChat((c) => [...c.slice(0, -1), { from: 'cat', text: `Ой: ${errorText(e)}` }]) }
  }

  const voice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { toast({ title: 'Голосовой ввод не поддерживается этим браузером', kind: 'bad' }); return }
    const r = new SR(); r.lang = 'ru-RU'; r.interimResults = false
    r.onresult = (e: any) => runCommand(e.results[0][0].transcript)
    r.onend = () => setListening(false)
    setListening(true); r.start()
  }

  // ---------- Загрузка доп. фото ----------
  const uploadMore = async (files: File[]) => {
    if (!files.length) return
    setWorking('upload')
    try {
      const fd = new FormData(); files.forEach((f) => fd.append('files', f)); fd.append('project_id', id!)
      const r = await api<{ photos: Photo[]; rejected: any[] }>('/api/photos', { method: 'POST', body: fd })
      await flush(); await refetch()
      toast({ title: `Добавлено ${r.photos.length} фото`, body: r.rejected.length ? `Отклонено: ${r.rejected.length} — ${r.rejected[0].reason}` : 'Кот может переразложить книгу с ними', mascot: 'cat' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setWorking(null) }
  }

  // ---------- DnD страниц ----------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = pages.findIndex((p) => p.id === e.active.id)
    const to = pages.findIndex((p) => p.id === e.over!.id)
    commit({ ...layout!, pages: arrayMove(pages, from, to) })
  }

  if (!layout) return <div className="studio center"><div className="float"><Cat size={80} mood="think" /></div></div>

  const crit = pf?.critical || 0
  const warn = pf?.warnings || 0
  const groups = Array.from(new Set(tools.filter((t) => t.type === 'image').map((t) => t.group)))

  return (
    <div className="studio">
      <div className="phone" style={{ background: 'transparent' }}>
        <header className="topbar">
          <button className="icon-btn" aria-label="Назад" onClick={async () => { await flush().catch(() => {}); nav('/') }}><ArrowLeft size={20} /></button>
          <button className="title" style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer' }} onClick={() => canEdit && setTitleOpen(true)}>
            {title}
            <div className="tiny" style={{ color: save === 'saved' ? '#7fd1ad' : save === 'offline' ? 'var(--yellow)' : '#93a09d', fontWeight: 500 }}>
              {save === 'saved' ? <><Cloud size={11} /> сохранено</> : save === 'saving' ? 'сохраняю…' : save === 'offline' ? <><CloudOff size={11} /> офлайн · на телефоне</> : 'ошибка сохранения'}
            </div>
          </button>
          {project?.share_code || project?.product?.specs.shared ? (
            <button className="icon-btn" aria-label="Пригласить" onClick={() => setShareOpen(true)}><Users size={19} /></button>
          ) : (
            <button className="icon-btn" aria-label="Отменить" onClick={undo} disabled={!history.current.length}><Undo2 size={19} /></button>
          )}
        </header>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 150 }}>
          {/* Сцена с разворотом */}
          <div style={{ padding: '14px 16px 6px', position: 'relative' }}>
            <AnimatePresence mode="wait">
              <motion.div key={spread} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.22 }}
                drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25}
                onDragEnd={(_, i) => { if (i.offset.x < -70 && spread < spreads - 1) setSpread(spread + 1); if (i.offset.x > 70 && spread > (isBook ? -1 : 0)) setSpread(spread - 1) }}>
                {isBook && spread < 0 ? (
                  <div className="center" style={{ padding: '10px 0 4px', flexDirection: 'column', gap: 12 }}>
                    <button onClick={() => { setSel(null); setReplaceOpen(true) }} style={{ background: 'none', border: 0, cursor: 'pointer' }} aria-label="Сменить обложку">
                      <div style={{ width: 230, aspectRatio: String(aspect), borderRadius: '4px 10px 10px 4px', overflow: 'hidden', boxShadow: '0 24px 50px rgba(0,0,0,.5), inset 8px 0 0 rgba(0,0,0,.2)', position: 'relative', background: 'var(--coral)' }}>
                        {layout.cover?.photo_id && photos[layout.cover.photo_id] && <Img src={photos[layout.cover.photo_id].thumb} style={{ width: '100%', height: '100%' }} />}
                        <div style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '30px 12px 14px', background: 'linear-gradient(transparent, rgba(0,0,0,.5))', color: '#fff', fontFamily: 'var(--hand)', fontSize: 28, textAlign: 'center' }}>{title}</div>
                      </div>
                    </button>
                    <div className="small muted">Обложка · нажмите, чтобы сменить фото</div>
                  </div>
                ) : (
                  <div className={isBook ? 'spread' : ''} style={isBook ? {} : { borderRadius: 6, overflow: 'hidden', boxShadow: '0 14px 40px rgba(0,0,0,.35)', maxWidth: aspect < 1 ? 300 : '100%', margin: '0 auto' }}>
                    {visiblePages.map((pi) => (
                      <PageView key={pages[pi].id} page={pages[pi]} photos={photos} aspect={aspect} issues={issueMap[pi]}
                        selected={sel?.page === pi ? sel.slot : null} onSlot={canEdit ? (si) => setSel(sel?.page === pi && sel.slot === si ? null : { page: pi, slot: si }) : undefined} />
                    ))}
                    {isBook && visiblePages.length === 1 && <div className="bookpage center" style={{ aspectRatio: String(aspect), background: '#f3eee7' }}><span className="hand muted">конец</span></div>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="between" style={{ marginTop: 10 }}>
              <button className="icon-btn" aria-label="Предыдущий разворот" disabled={spread <= (isBook ? -1 : 0)} onClick={() => { setSpread(spread - 1); setSel(null) }}><ChevronLeft size={20} /></button>
              <div className="small muted num">{isBook ? (spread < 0 ? 'Обложка' : `Страницы ${visiblePages.map((x) => x + 1).join('–')} из ${pages.length}`) : `${spread + 1} из ${pages.length}`}</div>
              <button className="icon-btn" aria-label="Следующий разворот" disabled={spread >= spreads - 1} onClick={() => { setSpread(spread + 1); setSel(null) }}><ChevronRight size={20} /></button>
            </div>
          </div>

          {/* Лента страниц с перетаскиванием */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
              <div className="thumbs" aria-label="Страницы — перетащите для смены порядка">
                {isBook && (
                  <button className={`thumb-page ${spread < 0 ? 'active' : ''}`} onClick={() => { setSpread(-1); setSel(null) }}>
                    <div className="mini" style={{ gridTemplateColumns: '1fr', background: 'var(--coral)' }}>{layout.cover?.photo_id && photos[layout.cover.photo_id] && <img src={media(photos[layout.cover.photo_id].thumb)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                    обложка
                  </button>
                )}
                {pages.map((p, i) => <ThumbPage key={p.id} page={p} index={i} photos={photos} active={visiblePages.includes(i) && spread >= 0}
                  issue={issueMap[i] ? (Object.values(issueMap[i]).includes('critical') ? 'critical' : 'warning') : null}
                  onClick={() => { setSpread(isBook ? Math.floor(i / 2) : i); setSel(null) }} />)}
                {canEdit && <button className="thumb-page" onClick={addPage} aria-label="Добавить страницы"><div className="mini center" style={{ gridTemplateColumns: '1fr', background: 'var(--night-3)', color: '#fff' }}><Plus size={18} /></div>добавить</button>}
              </div>
            </SortableContext>
          </DndContext>

          {/* Контекстные инструменты */}
          {canEdit && (sel && selPhoto ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="between" style={{ padding: '10px 16px 4px' }}>
                <div className="small"><b style={{ color: '#fff' }}>Фото {sel.slot + 1}</b> <span className="muted">· {selPhoto.width}×{selPhoto.height}{selPhoto.ai_tool ? ` · AI: ${tools.find((t) => t.id === selPhoto.ai_tool)?.title || selPhoto.ai_tool}` : ''}</span></div>
                <button className="link small" onClick={() => setSel(null)}>Готово</button>
              </div>
              {groups.map((g) => (
                <div key={g}>
                  <div className="tiny muted" style={{ padding: '6px 16px 2px', textTransform: 'uppercase', letterSpacing: '.1em' }}>{g}</div>
                  <div className="toolbelt">
                    {tools.filter((t) => t.group === g && t.type === 'image').map((t) => {
                      const I = ICONS[t.icon] || Sparkles
                      return <button key={t.id} className={`tool ${t.manual ? '' : 'ai'}`} onClick={() => openTool(t)} disabled={!!working}><span className="ic"><I size={22} /></span>{t.title}</button>
                    })}
                  </div>
                </div>
              ))}
              <div className="toolbelt" style={{ marginTop: 4 }}>
                <button className="tool" onClick={() => setCropOpen(true)}><span className="ic"><Crop size={22} /></span>Кадр</button>
                <button className="tool" onClick={() => setReplaceOpen(true)}><span className="ic"><Replace size={22} /></span>Заменить</button>
                {selPhoto.parent_id && <button className="tool" onClick={revert}><span className="ic"><History size={22} /></span>Оригинал</button>}
                <button className="tool" onClick={() => { setSlotPhoto(sel.page, sel.slot, null); setSel(null) }}><span className="ic"><Trash2 size={22} /></span>Убрать</button>
              </div>
            </motion.div>
          ) : (
            <div>
              {spread >= 0 && (
                <>
                  <div className="tiny muted" style={{ padding: '10px 16px 2px', textTransform: 'uppercase', letterSpacing: '.1em' }}>Шаблон страницы {visiblePages[0] + 1}</div>
                  <div className="toolbelt">
                    {Object.entries(TEMPLATES).map(([k, t]) => (
                      <button key={k} className={`tool ${pages[visiblePages[0]]?.template === k ? 'active' : ''}`} onClick={() => setPageTemplate(visiblePages[0], k)}>
                        <span className="ic"><TemplateIcon id={k} /></span>{t.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="toolbelt" style={{ marginTop: 6 }}>
                <button className="tool ai" onClick={() => relayout('shuffle')} disabled={!!working}><span className="ic">{working === 'shuffle' ? <Loader2 className="spin" size={22} /> : <Shuffle size={22} />}</span>Перемешать</button>
                <button className="tool ai" onClick={() => relayout('compact')} disabled={!!working}><span className="ic"><LayoutGrid size={22} /></span>Компактнее</button>
                <button className="tool ai" onClick={() => relayout('spacious')} disabled={!!working}><span className="ic"><Expand size={22} /></span>Просторнее</button>
                <button className="tool ai" disabled={!!working} onClick={async () => { setWorking('captions'); try { await flush(); const p = await api<Project>(`/api/projects/${id}/captions`, { method: 'POST' }); setProject(p); setLayout(p.layout); setTitle(p.title); setRevision(p.revision); toast({ title: 'Кот подписал страницы', mascot: 'cat' }) } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setWorking(null) } }}>
                  <span className="ic">{working === 'captions' ? <Loader2 className="spin" size={22} /> : <Quote size={22} />}</span>Подписи</button>
                <button className="tool" onClick={() => fileRef.current?.click()}><span className="ic">{working === 'upload' ? <Loader2 className="spin" size={22} /> : <ImagePlus size={22} />}</span>Ещё фото</button>
                {spread >= 0 && pages.length > 1 && <button className="tool" onClick={() => removePage(visiblePages[0])}><span className="ic"><Trash2 size={22} /></span>Удалить стр.</button>}
                <button className="tool" onClick={undo} disabled={!history.current.length}><span className="ic"><Undo2 size={22} /></span>Отменить</button>
              </div>
            </div>
          ))}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => { uploadMore(Array.from(e.target.files || [])); e.target.value = '' }} />
        </main>

        {/* Кот-чат + переход к проверке */}
        <div className="fixed-cta stack" style={{ gap: 10, paddingLeft: 0, paddingRight: 0 }}>
          <AnimatePresence>
            {chatOpen && chat.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="stack" style={{ gap: 6, padding: '0 14px', maxHeight: 170, overflowY: 'auto' }}>
                {chat.slice(-4).map((m, i) => (
                  <div key={i} className={m.from === 'cat' ? 'mascot-line' : ''} style={m.from === 'me' ? { alignSelf: 'flex-end' } : {}}>
                    {m.from === 'cat' && <Cat size={30} />}
                    <div className="bubble dark" style={m.from === 'me' ? { background: 'var(--coral)', borderRadius: '18px 18px 6px 18px' } : {}}>
                      {m.pending && <Loader2 size={13} className="spin" style={{ marginRight: 6, verticalAlign: -2 }} />}{m.text}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {canEdit && (
            <form className="chatbar" onSubmit={(e) => { e.preventDefault(); runCommand(text) }}>
              <Cat size={30} />
              <input value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setChatOpen(true)}
                placeholder={selPhoto ? 'Скажи Коту: «сделай теплее»' : 'Скажи Коту: «убери 3-ю страницу»'} aria-label="Команда Коту" />
              <button type="button" className="icon-btn" style={{ width: 36, height: 36, background: listening ? 'var(--coral)' : undefined }} onClick={voice} aria-label="Голосом"><Mic size={17} /></button>
              <button className="icon-btn" style={{ width: 36, height: 36, background: 'var(--coral)', color: '#fff' }} aria-label="Отправить"><Send size={16} /></button>
            </form>
          )}
          <div className="row" style={{ padding: '0 14px', gap: 10 }}>
            <button className="btn grow" style={{ background: 'var(--night-3)', color: '#fff', height: 52 }} onClick={() => nav(`/check/${id}`)} aria-label="Проверка Робота">
              <Robot size={30} mood={crit ? 'alert' : 'happy'} />
              {pf ? (crit ? `${crit} крит.` : warn ? `${warn} совета` : 'Всё ок') : '…'}
            </button>
            {isOwner && canEdit ? (
              <button className="btn btn-primary grow" style={{ height: 52, flex: 1.6 }} onClick={async () => { await flush().catch(() => {}); nav(`/check/${id}`) }}>К заказу <ChevronRight size={18} /></button>
            ) : project && project.status !== 'draft' ? (
              <button className="btn btn-primary grow" style={{ height: 52, flex: 1.6 }} onClick={() => nav('/orders')}>Мои заказы</button>
            ) : (
              <button className="btn btn-primary grow" style={{ height: 52, flex: 1.6 }} onClick={() => fileRef.current?.click()}><ImagePlus size={18} /> Добавить фото</button>
            )}
          </div>
        </div>
      </div>

      {/* Лист инструмента: превью до/после */}
      <Sheet open={!!toolSheet} onClose={() => setToolSheet(null)} dark label={toolSheet?.title}>
        {toolSheet && (
          <div className="stack">
            <div className="between">
              <div><div className="h2" style={{ color: '#fff' }}>{toolSheet.title}</div><div className="small muted">{toolSheet.subtitle}</div></div>
              <span className="pill" style={{ background: 'var(--night-3)', color: '#cfe0dc' }}>{toolSheet.provider_kind === 'builtin' ? 'локально' : toolSheet.provider}</span>
            </div>
            {toolSheet.id === 'style' && (
              <div className="row wrap" style={{ gap: 6 }}>
                {STYLES.map((s) => <button key={s.id} className={`chip ${toolParams.style === s.id ? 'active' : ''}`} onClick={() => { const p = { ...toolParams, style: s.id }; setToolParams(p); runPreview('style', p) }}>{s.label}</button>)}
              </div>
            )}
            {toolSheet.id === 'upscale' && (
              <div className="seg" style={{ background: 'var(--night-3)' }}>
                {[2, 4].map((s) => <button key={s} className={toolParams.scale === s ? 'active' : ''} style={{ color: toolParams.scale === s ? 'var(--ink)' : '#fff' }} onClick={() => { const p = { scale: s }; setToolParams(p); runPreview('upscale', p) }}>×{s}</button>)}
              </div>
            )}
            {toolSheet.id === 'scene_magic' && (
              <div className="stack" style={{ gap: 8 }}>
                <input className="input" style={{ background: 'var(--night-3)', color: '#fff', boxShadow: 'none' }} value={toolParams.scene || ''} onChange={(e) => setToolParams({ ...toolParams, scene: e.target.value })} placeholder="на берегу моря на закате" />
                <button className="btn btn-soft" onClick={() => runPreview('scene_magic', toolParams)}>Показать вариант</button>
              </div>
            )}
            {toolSheet.manual ? (
              <ManualAdjust photo={selPhoto!} busy={working === 'adjust'} onApply={(p) => applyTool('adjust', p)} />
            ) : preview ? (
              <>
                <BeforeAfter before={preview.before} after={preview.after} />
                <div className="tiny muted">{preview.meta} · превью на уменьшенной копии, применяется к оригиналу</div>
              </>
            ) : toolSheet.id !== 'scene_magic' ? (
              <div className="scanbox center" style={{ height: 240, background: 'var(--night-3)' }}><div className="scanline" /><Robot size={60} mood="scan" /></div>
            ) : null}
            {!toolSheet.manual && (
              <button className="btn btn-primary btn-lg btn-block" disabled={!!working || (!preview && toolSheet.id !== 'scene_magic')} onClick={() => applyTool(toolSheet.id, toolParams)}>
                {working ? <><Loader2 className="spin" size={18} /> Обрабатываю оригинал…</> : <><Sparkles size={18} /> Применить</>}
              </button>
            )}
          </div>
        )}
      </Sheet>

      {/* Кадрирование */}
      <Sheet open={cropOpen && !!sel && !!selPhoto} onClose={() => { setCropOpen(false); if (sel) setCrop(pages[sel.page].slots[sel.slot].crop, true) }} dark label="Кадр">
        {sel && selPhoto && <CropEditor photo={selPhoto} aspect={slotAspect()} crop={pages[sel.page].slots[sel.slot].crop} onChange={(c) => setCrop(c)} />}
      </Sheet>

      {/* Замена фото */}
      <Sheet open={replaceOpen} onClose={() => setReplaceOpen(false)} dark label="Выбор фото">
        <div className="h2" style={{ color: '#fff', marginBottom: 10 }}>{sel ? 'Заменить фото' : 'Фото на обложку'}</div>
        <div className="grid3">
          {(project?.photos || []).filter((p) => p.source !== 'ai' || !(project?.photos || []).some((x) => x.parent_id === p.id && false)).map((p) => {
            const used = pages.some((pg) => pg.slots.some((s) => s.photo_id === p.id))
            return (
              <button key={p.id} className="tile" onClick={() => { sel ? setSlotPhoto(sel.page, sel.slot, p.id) : setSlotPhoto(-1, 0, p.id); setReplaceOpen(false) }}>
                <img src={media(p.thumb)} alt="" />
                {used && <span className="pill pill-dark flag tiny">в книге</span>}
              </button>
            )
          })}
        </div>
      </Sheet>

      {/* Название */}
      <Sheet open={titleOpen} onClose={() => setTitleOpen(false)} label="Название">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); commit(layout, (e.currentTarget.elements.namedItem('t') as HTMLInputElement).value || title); setTitleOpen(false) }}>
          <div className="h2">Название книги</div>
          <input name="t" className="input" defaultValue={title} maxLength={80} autoFocus />
          <button className="btn btn-primary btn-block">Сохранить</button>
        </form>
      </Sheet>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} project={project} onShared={refetch} />
    </div>
  )
}

function ThumbPage({ page, index, photos, active, issue, onClick }: { page: Page; index: number; photos: Record<string, Photo>; active: boolean; issue: string | null; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  const first = page.slots.find((s) => s.photo_id && photos[s.photo_id])
  return (
    <button ref={setNodeRef} className={`thumb-page ${active ? 'active' : ''}`} onClick={onClick} {...attributes} {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined, opacity: isDragging ? 0.8 : 1 }} aria-label={`Страница ${index + 1}`}>
      <div className="mini" style={{ gridTemplateColumns: '1fr', aspectRatio: '1', position: 'relative' }}>
        {first ? <img src={media(photos[first.photo_id!].thumb)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
          : <div className="center" style={{ width: '100%', height: '100%', background: '#fbf7f1', color: 'var(--coral)', fontFamily: 'var(--hand)', fontSize: 13 }}>{page.template === 'text' ? '♥' : '+'}</div>}
        {issue && <span className="dot" style={{ position: 'absolute', top: 3, right: 3, background: issue === 'critical' ? 'var(--bad)' : 'var(--warn)' }} />}
      </div>
      {index + 1}
    </button>
  )
}

function TemplateIcon({ id }: { id: string }) {
  const t = TEMPLATES[id]
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      <rect x="1" y="1" width="28" height="28" rx="3" fill="none" stroke="currentColor" strokeOpacity=".4" />
      {t.slots.map(([x, y, w, h], i) => <rect key={i} x={1 + x * 28} y={1 + y * 28} width={w * 28} height={h * 28} rx="1.5" fill="currentColor" opacity=".85" />)}
      {t.caption && <rect x="8" y="24" width="14" height="2" rx="1" fill="currentColor" />}
    </svg>
  )
}

function CropEditor({ photo, aspect, crop, onChange }: { photo: Photo; aspect: number; crop: { x: number; y: number; zoom: number }; onChange: (c: any) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const pos = `${crop.x * 100}% ${crop.y * 100}%`
  return (
    <div className="stack">
      <div className="h2" style={{ color: '#fff' }}>Кадрирование</div>
      <div ref={ref} style={{ width: '100%', aspectRatio: String(aspect), borderRadius: 12, overflow: 'hidden', touchAction: 'none', cursor: 'grab', position: 'relative', maxHeight: 360 }}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y } }}
        onPointerMove={(e) => {
          if (!drag.current || !ref.current) return
          const r = ref.current.getBoundingClientRect()
          const nx = Math.max(0, Math.min(1, drag.current.cx - (e.clientX - drag.current.x) / r.width / crop.zoom))
          const ny = Math.max(0, Math.min(1, drag.current.cy - (e.clientY - drag.current.y) / r.height / crop.zoom))
          onChange({ ...crop, x: +nx.toFixed(3), y: +ny.toFixed(3) })
        }}
        onPointerUp={() => { drag.current = null }}>
        <img src={media(photo.thumb)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, transform: `scale(${crop.zoom})`, transformOrigin: pos }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px)', backgroundSize: '33.33% 33.33%' }} />
      </div>
      <label className="small muted" htmlFor="zoom">Масштаб ×{crop.zoom.toFixed(2)} — перетащите фото, чтобы выбрать фрагмент</label>
      <input id="zoom" type="range" min={1} max={2.5} step={0.05} value={crop.zoom} onChange={(e) => onChange({ ...crop, zoom: +e.target.value })} style={{ accentColor: 'var(--coral)' }} />
      <button className="btn btn-soft" onClick={() => onChange({ x: 0.5, y: 0.45, zoom: 1 })}><RefreshCw size={16} /> Сбросить</button>
    </div>
  )
}

function ManualAdjust({ photo, busy, onApply }: { photo: Photo; busy: boolean; onApply: (p: any) => void }) {
  const [v, setV] = useState({ brightness: 0, contrast: 0, saturation: 0, temperature: 0, rotate: 0 })
  const filter = `brightness(${1 + v.brightness / 250}) contrast(${1 + v.contrast / 120}) saturate(${1 + v.saturation / 100}) sepia(${Math.max(0, v.temperature) / 300}) hue-rotate(${v.temperature < 0 ? v.temperature / 6 : 0}deg)`
  const S = ({ k, label }: { k: keyof typeof v; label: string }) => (
    <div className="field"><label className="between" style={{ color: '#cfd9d6' }}>{label}<span className="num">{v[k] > 0 ? '+' : ''}{v[k]}</span></label>
      <input type="range" min={-100} max={100} value={v[k]} onChange={(e) => setV({ ...v, [k]: +e.target.value })} style={{ accentColor: 'var(--coral)' }} /></div>
  )
  return (
    <div className="stack">
      <div style={{ borderRadius: 12, overflow: 'hidden', maxHeight: 260 }}>
        <img src={media(photo.thumb)} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', filter, transform: `rotate(${v.rotate}deg)`, transition: 'transform .3s' }} />
      </div>
      <S k="brightness" label="Яркость" /><S k="contrast" label="Контраст" /><S k="saturation" label="Насыщенность" /><S k="temperature" label="Температура" />
      <div className="row">
        <button className="btn btn-soft grow" onClick={() => setV({ ...v, rotate: (v.rotate + 90) % 360 })}>Повернуть 90°</button>
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onApply(v)}>{busy ? <Loader2 className="spin" size={18} /> : 'Применить'}</button>
      </div>
    </div>
  )
}

function ShareSheet({ open, onClose, project, onShared }: { open: boolean; onClose: () => void; project: Project | null; onShared: () => void }) {
  const { toast } = useApp()
  const [code, setCode] = useState<string | null>(project?.share_code || null)
  useEffect(() => { setCode(project?.share_code || null) }, [project])
  const link = code ? `${location.origin}/join/${code}` : ''
  const make = async () => {
    const r = await api<{ share_code: string }>(`/api/projects/${project!.id}/share`, { method: 'POST' })
    setCode(r.share_code); onShared()
  }
  const share = async () => {
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: project?.title, text: 'Скидываем фото в общий альбом picPac!', url: link })
      else { await navigator.clipboard.writeText(link); toast({ title: 'Ссылка скопирована', mascot: 'cat' }) }
    } catch { /* отмена */ }
  }
  const total = Object.values(project?.contributions || {}).reduce((a, b) => a + b, 0)
  return (
    <Sheet open={open} onClose={onClose} label="Общий альбом">
      <div className="stack">
        <div className="row"><Cat size={52} mood="wow" /><div><div className="h2">Скинемся на альбом</div><div className="small muted">Каждый добавит свои фото по ссылке — без регистрации</div></div></div>
        {code ? (
          <>
            <div className="card row" style={{ padding: 12 }}>
              <div className="grow small" style={{ wordBreak: 'break-all' }}>{link}</div>
              <button className="icon-btn" aria-label="Копировать" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast({ title: 'Скопировано', mascot: 'cat' }) }}><Copy size={18} /></button>
            </div>
            <button className="btn btn-primary btn-block" onClick={share}><Share2 size={18} /> Отправить в чат класса</button>
          </>
        ) : <button className="btn btn-primary btn-block" onClick={make}>Создать ссылку</button>}
        <div className="divider" />
        <div className="between"><div className="h3">Участники</div><span className="small muted">{total} фото</span></div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row"><span className="pill pill-dark">организатор</span><span className="grow">{project?.owner_name}</span><b className="num">{project?.contributions?.[String(project?.owner_id)] || 0} фото</b></div>
          {(project?.members || []).map((m) => (
            <div key={m.user_id} className="row"><span className="pill pill-soft">участник</span><span className="grow">{m.name}</span><b className="num">{project?.contributions?.[String(m.user_id)] || 0} фото</b></div>
          ))}
          {!project?.members?.length && <div className="small muted">Пока никого — отправьте ссылку, и прогресс появится здесь.</div>}
        </div>
        <div className="card flat small">
          💛 Промокод <b>SKINEMSYA</b> даёт −15% на общий альбом. В корзине счёт можно разделить на {1 + (project?.members?.length || 0)} участников.
        </div>
      </div>
    </Sheet>
  )
}
