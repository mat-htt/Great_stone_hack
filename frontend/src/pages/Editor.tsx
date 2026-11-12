import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Box, ChevronLeft, ChevronRight, Crop, X, Droplets, Expand, Focus, Frame, History, ImagePlus, LayoutTemplate, Loader2, Mic, Palette,
  Plus, Quote, RotateCw, ScanFace, Scissors, Send, Share2, Shuffle, Square, Type, AlignLeft, AlignCenter, AlignRight, CaseUpper, SlidersHorizontal, Sparkles, Stars, Trash2, Undo2, Users, Wand2, Copy, Replace,
} from 'lucide-react'
import { api, ApiError, media, track, type AiTool, type Layout, type Page, type Photo, type Preflight, type Project, type TextStyle } from '../api'
import { Avatar, MASCOT } from '../components/Mascots'
import View3D from '../components/View3D'
import { aspectOf, BeforeAfter, byOccasion, CoverView, DesignCard, FONT, FONT_LIST, OCCASIONS, PageView, Sheet, TEMPLATES, TEXT_COLORS, TEXT_PRESETS, TEXT_STYLES, useDesigns, type Design } from '../components/ui'
import { errorText, getLocal, pushDraft, saveLocal, useApp } from '../store'
import { useVoice } from '../lib/voice'

const ICON: Record<string, any> = { wand: Wand2, expand: Expand, focus: Focus, drop: Droplets, face: ScanFace, history: History, scissors: Scissors, palette: Palette, frame: Frame, sliders: SlidersHorizontal, stars: Stars }
const FILTERS: { id: string; label: string; css: string }[] = [
  { id: 'none', label: 'Оригинал', css: 'none' }, { id: 'film', label: 'Плёнка', css: 'sepia(.15) contrast(.95) saturate(.9) brightness(1.03)' },
  { id: 'warm', label: 'Тёплый', css: 'sepia(.25) saturate(1.15) hue-rotate(-8deg)' }, { id: 'cool', label: 'Холодный', css: 'saturate(.95) hue-rotate(12deg) brightness(1.02)' },
  { id: 'vivid', label: 'Сочный', css: 'saturate(1.45) contrast(1.08)' }, { id: 'bw', label: 'Ч/Б', css: 'grayscale(1) contrast(1.1)' },
  { id: 'vintage', label: 'Винтаж', css: 'sepia(.5) contrast(.9) brightness(1.05)' }, { id: 'soft', label: 'Мягкий', css: 'brightness(1.06) contrast(.9) saturate(.95)' },
]
const SUGGEST = ['Сделай всё теплее', 'Добавь чёткости', 'Перемешай страницы', 'Подбери обложку', 'Убери 2-ю страницу']
type Tab = 'layout' | 'text' | 'filters' | 'enhance' | 'crop'
type Sel = { page: number; slot: number } | null
type Save = 'saved' | 'saving' | 'offline' | 'error'

export default function Editor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { toast, user } = useApp()
  const designs = useDesigns()
  const [project, setProject] = useState<Project | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [title, setTitle] = useState('')
  const [revision, setRevision] = useState(0)
  const [cell, setCell] = useState(0)
  const [sel, setSel] = useState<Sel>(null)
  const [tab, setTab] = useState<Tab>('layout')
  const [save, setSave] = useState<Save>('saved')
  const [tools, setTools] = useState<AiTool[]>([])
  const [tool, setTool] = useState<AiTool | null>(null)
  const [preview, setPreview] = useState<{ before: string; after: string; meta: string } | null>(null)
  const [tparams, setTparams] = useState<Record<string, any>>({})
  const [working, setWorking] = useState<string | null>(null)
  const [pf, setPf] = useState<Preflight | null>(null)
  const [fx, setFx] = useState<Record<string, string>>({})
  const [styleOf, setStyleOf] = useState<Record<string, string>>({})
  const [catOpen, setCatOpen] = useState(false)
  const [chat, setChat] = useState<{ me: boolean; text: string; wait?: boolean }[]>([])
  const [text, setText] = useState('')
  const voiceBase = useRef('')
  const textInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = textInput.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 112) + 'px'; el.scrollTop = el.scrollHeight }, [text])
  const [designOpen, setDesignOpen] = useState(false)
  const [view3d, setView3d] = useState(false)
  const [occ, setOcc] = useState('Все')
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(params.get('share') === '1')
  const history = useRef<{ layout: Layout; title: string }[]>([])
  const saveTimer = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const carRef = useRef<HTMLDivElement>(null)

  // ---------- Загрузка ----------
  useEffect(() => {
    (async () => {
      try {
        const p = await api<Project>(`/api/projects/${id}`)
        const local = await getLocal(p.id)
        if (local?.dirty && local.revision === p.revision) { setLayout(local.layout); setTitle(local.title); toast({ title: 'Восстановили несохранённые правки', mascot: 'robot' }) }
        else { setLayout(p.layout); setTitle(p.title) }
        setProject(p); setRevision(p.revision)
      } catch (e) {
        const local = await getLocal(id!)
        if (local) { setLayout(local.layout); setTitle(local.title); setRevision(local.revision); setSave('offline') } else toast({ title: errorText(e), kind: 'bad' })
      }
    })()
    api<{ items: AiTool[] }>('/api/ai/tools').then((r) => setTools(r.items)).catch(() => {})
  }, [id])

  const photos = useMemo(() => Object.fromEntries((project?.photos || []).map((p) => [p.id, p])), [project]) as Record<string, Photo>
  const kind = project?.product?.kind || 'book'
  const isBook = kind === 'book'
  const isSingle = kind === 'single'
  const aspect = aspectOf(project?.product, project?.options.size)
  const pages = layout?.pages || []
  const design: Design | undefined = designs.find((d) => d.id === (project?.options.template || project?.product?.specs.template))
  const canEdit = project?.status === 'draft'

  // ячейки карусели: для книги — обложка + развороты, иначе — по странице
  const cells: number[][] = useMemo(() => {
    if (!layout) return []
    if (isBook) { const out: number[][] = [[-1]]; for (let i = 0; i < pages.length; i += 2) out.push([i, i + 1].filter((x) => x < pages.length)); return out }
    return pages.map((_, i) => [i])
  }, [layout, isBook, pages.length])
  const curPages = cells[cell] || []

  // ---------- Сохранение ----------
  const persist = useCallback((next: Layout, nextTitle: string, rev: number) => {
    if (!project) return
    saveLocal({ id: project.id, title: nextTitle, options: project.options, layout: next, revision: rev, dirty: true })
    setSave('saving'); clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try { const r = await pushDraft({ id: project.id, title: nextTitle, options: project.options, layout: next, revision: rev, dirty: true }); setRevision(r); setSave('saved') }
      catch (e) { setSave(e instanceof ApiError && e.status === 0 ? 'offline' : 'error') }
    }, 600)
  }, [project])
  const commit = (next: Layout, nextTitle = title) => {
    if (!canEdit || !layout) return
    history.current = [...history.current.slice(-30), { layout, title }]
    setLayout(next); setTitle(nextTitle); persist(next, nextTitle, revision)
  }
  const textSnap = useRef<ReturnType<typeof setTimeout> | 0>(0)
  const snapText = () => {
    if (!textSnap.current && layout) history.current = [...history.current.slice(-30), { layout, title }]
    if (textSnap.current) clearTimeout(textSnap.current)
    textSnap.current = setTimeout(() => { textSnap.current = 0 }, 1500)
  }
  const editPageText = (pi: number, upd: { caption?: string; text?: TextStyle }) => {
    if (!canEdit || !layout || pi < 0 || !layout.pages[pi]) return
    snapText()
    const next = structuredClone(layout) as Layout; const pg = next.pages[pi]
    if (upd.caption !== undefined) pg.caption = upd.caption.slice(0, 300)
    if (upd.text) pg.text = { ...(pg.text || {}), ...upd.text }
    setLayout(next); persist(next, title, revision)
  }
  const editTitle = (t?: string, st?: TextStyle) => {
    if (!canEdit || !layout) return
    snapText()
    const next = st ? { ...layout, title_style: { ...(layout.title_style || {}), ...st } } : layout
    const nt = t !== undefined ? t.slice(0, 120) : title
    setLayout(next); setTitle(nt); persist(next, nt.trim() || title, revision)
  }
  const flush = async () => {
    clearTimeout(saveTimer.current)
    if (!project || !layout || save === 'saved') return
    const r = await pushDraft({ id: project.id, title, options: project.options, layout, revision, dirty: true }); setRevision(r); setSave('saved')
  }
  const refetch = async () => {
    const p = await api<Project>(`/api/projects/${id}`)
    setProject(p); setLayout(p.layout); setTitle(p.title); setRevision(p.revision)
    saveLocal({ id: p.id, title: p.title, options: p.options, layout: p.layout, revision: p.revision, dirty: false })
    return p
  }
  const undo = () => { const prev = history.current.pop(); if (prev) { setLayout(prev.layout); setTitle(prev.title); persist(prev.layout, prev.title, revision) } }
  const setOptions = async (o: Record<string, string>) => {
    if (!project) return
    await flush().catch(() => {})
    const r = await api<{ revision: number }>(`/api/projects/${project.id}`, { method: 'PUT', json: { options: o, revision } })
    setRevision(r.revision); setProject({ ...project, options: { ...project.options, ...o } })
  }

  // ---------- Проверка Робота (фоном) ----------
  useEffect(() => {
    if (!project || save === 'saving') return
    const t = setTimeout(() => api<Preflight>(`/api/projects/${project.id}/preflight`).then(setPf).catch(() => {}), 500)
    return () => clearTimeout(t)
  }, [project, revision, save])
  const issues = useMemo(() => {
    const m: Record<number, Record<string, 'critical' | 'warning'>> = {}
    for (const i of pf?.issues || []) { if (i.page === null || i.slot === null || i.severity === 'info') continue; (m[i.page] ||= {})[i.slot] = i.severity as any }
    return m
  }, [pf])

  // ---------- Карусель: тач, трекпад, мышь, клавиатура ----------
  const goTo = (i: number) => { const el = carRef.current; if (!el) return; const n = Math.max(0, Math.min(cells.length - 1, i)); el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' }) }
  const onScroll = () => { const el = carRef.current; if (!el) return; const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== cell) { setCell(i); setSel(null) } }
  const drag = useRef<{ x: number; left: number; moved: boolean; cell: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; drag.current = { x: e.clientX, left: carRef.current!.scrollLeft, moved: false, cell } }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 6) { d.moved = true; carRef.current!.classList.add('dragging') }
    if (d.moved) carRef.current!.scrollLeft = d.left - dx
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; if (!d) return
    carRef.current!.classList.remove('dragging')
    if (d.moved) { const w = carRef.current!.clientWidth; const dx = e.clientX - d.x; goTo(d.cell + (dx < -w * 0.15 ? 1 : dx > w * 0.15 ? -1 : 0)); e.preventDefault() }
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,[role=dialog]')) return
      if (e.key === 'ArrowRight') goTo(cell + 1); if (e.key === 'ArrowLeft') goTo(cell - 1)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  // авто-выбор фото для вкладок, работающих с одним снимком
  const firstSlot = (): Sel => { for (const pi of curPages) { if (pi < 0) continue; const si = pages[pi]?.slots.findIndex((s) => s.photo_id); if (si >= 0) return { page: pi, slot: si } } return null }
  useEffect(() => { if (isSingle && !sel) { setSel({ page: 0, slot: 0 }); return } if (tab !== 'layout' && tab !== 'text' && !sel) setSel(firstSlot()) }, [tab, cell, layout, isSingle])
  const [textSel, setTextSel] = useState<number | null>(null)
  useEffect(() => { setTextSel(null) }, [cell])
  const openText = (pi: number) => { setTextSel(pi); setSel(null); setTab('text') }
  const textPi = isBook && cell === 0 ? -1 : textSel !== null && curPages.includes(textSel) ? textSel : (curPages[0] ?? 0)
  const selPhotoId = sel ? pages[sel.page]?.slots[sel.slot]?.photo_id : (cell === 0 && isBook ? layout?.cover?.photo_id : null)
  const selPhoto = selPhotoId ? photos[selPhotoId] : null
  const slotAspect = () => { if (!sel) return aspect; const t = TEMPLATES[pages[sel.page].template]; const b = t.slots[Math.min(sel.slot, t.slots.length - 1)]; return b ? +(b[2] * aspect / b[3]).toFixed(3) : aspect }

  // ---------- Страницы ----------
  const setPageTemplate = (pi: number, template: string) => {
    const next = structuredClone(layout!) as Layout; const pg = next.pages[pi]
    const ids = pg.slots.map((s) => s.photo_id).filter(Boolean) as string[]
    pg.template = template; pg.slots = TEMPLATES[template].slots.map((_, i) => ({ photo_id: ids[i] ?? null, crop: { x: .5, y: .45, zoom: 1 } }))
    if (TEMPLATES[template].caption && pg.caption === undefined) pg.caption = ''
    commit(next)
  }
  const addPage = () => {
    const next = structuredClone(layout!) as Layout
    const used = new Set(next.pages.flatMap((p) => p.slots.map((s) => s.photo_id)))
    const free = (project?.photos || []).filter((p) => !used.has(p.id) && p.source !== 'ai')
    const mk = (pid: string | null): Page => ({ id: `p${Math.random().toString(36).slice(2, 9)}`, template: 'full', slots: [{ photo_id: pid, crop: { x: .5, y: .45, zoom: 1 } }] })
    const at = Math.max(0, ...curPages) + 1
    next.pages.splice(at, 0, ...(isBook ? [mk(free[0]?.id ?? null), mk(free[1]?.id ?? null)] : [mk(free[0]?.id ?? null)]))
    commit(next); setTimeout(() => goTo(cell + 1), 50)
  }
  const removePage = () => { if (!curPages.length || curPages[0] < 0) return; const next = structuredClone(layout!) as Layout; next.pages.splice(curPages[0], curPages.length); commit(next); setSel(null) }
  const setSlotPhoto = (pid: string | null) => {
    const next = structuredClone(layout!) as Layout
    const target = sel || (isSingle ? { page: 0, slot: 0 } : null)
    if (!target) next.cover = { photo_id: pid, crop: { x: .5, y: .45, zoom: 1 } }
    else next.pages[target.page].slots[target.slot] = { photo_id: pid, crop: { x: .5, y: .45, zoom: 1 } }
    commit(next)
  }
  const setCrop = (c: { x: number; y: number; zoom: number }) => { if (!sel) return; const next = structuredClone(layout!) as Layout; next.pages[sel.page].slots[sel.slot].crop = c; commit(next) }
  const server = async (path: string, body?: any, label?: string) => {
    setWorking(label || path)
    try { await flush(); const p = await api<Project>(path, { method: 'POST', json: body }); setProject(p); setLayout(p.layout); setTitle(p.title); setRevision(p.revision); return p }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setWorking(null) }
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    commit({ ...layout!, pages: arrayMove(pages, pages.findIndex((p) => p.id === e.active.id), pages.findIndex((p) => p.id === e.over!.id)) })
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // ---------- AI ----------
  const runPreview = async (t: string, p: Record<string, any>) => {
    if (!selPhoto) return
    setPreview(null)
    try {
      const res: Response = await api(`/api/ai/photos/${selPhoto.id}/preview`, { method: 'POST', json: { tool: t, params: p } })
      setPreview({ before: media(selPhoto.thumb), after: URL.createObjectURL(await res.blob()), meta: `${res.headers.get('X-AI-Provider') === 'builtin' ? 'на сервере picPac' : res.headers.get('X-AI-Provider')} · ${res.headers.get('X-AI-Duration')} мс` })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }); setTool(null) }
  }
  const openTool = (t: AiTool) => {
    if (!selPhoto) { toast({ title: 'Нажмите на фото на странице' }); return }
    const d: Record<string, any> = {}; Object.entries(t.params || {}).forEach(([k, v]: any) => { d[k] = v.default })
    if (t.id === 'smart_extend') d.aspect = slotAspect()
    setTparams(d); setTool(t); setPreview(null)
    if (!t.manual && !t.generative) runPreview(t.id, d)
  }
  const apply = async (t: string, p: Record<string, any>, pid = selPhoto?.id, quiet = false) => {
    if (!pid) return
    setWorking(t)
    try {
      await flush()
      const r = await api<{ ai: any }>(`/api/ai/photos/${pid}/apply`, { method: 'POST', json: { tool: t, params: p, project_id: id, replace: true } })
      track('ai_used', { tool: t }); await refetch(); setTool(null)
      if (!quiet) toast({ title: 'Готово', body: `${r.ai.model} · ${(r.ai.duration_ms / 1000).toFixed(1)} с${r.ai.status === 'fallback' ? ' · резервный движок' : ''}`, mascot: 'cat' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setWorking(null) }
  }
  const applyFilter = async (f: typeof FILTERS[0]) => {
    if (!selPhoto) return
    const root = selPhoto.parent_id || selPhoto.id
    if (f.id === 'none') { if (selPhoto.ai_tool === 'style') { await flush(); await api(`/api/ai/photos/${selPhoto.id}/revert?project_id=${id}`, { method: 'POST' }); await refetch() } setStyleOf({ ...styleOf, [root]: 'none' }); return }
    setStyleOf({ ...styleOf, [root]: f.id })
    setFx({ ...fx, [selPhoto.id]: f.css })
    await apply('style', { style: f.id }, root, true)
    setFx({})
  }
  const revert = async () => { if (!selPhoto?.parent_id) return; await flush(); await api(`/api/ai/photos/${selPhoto.id}/revert?project_id=${id}`, { method: 'POST' }); await refetch(); toast({ title: 'Вернули оригинал' }) }

  // ---------- Кот-ассистент ----------
  const ask = async (q: string) => {
    if (!q.trim()) return
    setText(''); setChat((c) => [...c, { me: true, text: q }, { me: false, text: 'Думаю…', wait: true }])
    try {
      const plan = await api<{ reply: string; actions: any[]; _meta: any }>('/api/ai/command', { method: 'POST', json: { text: q, project_id: id, selected_photo_id: selPhoto?.id } })
      const who = plan._meta?.provider === 'builtin' ? '' : ` (${plan._meta?.model})`
      setChat((c) => [...c.slice(0, -1), { me: false, text: plan.reply + who, wait: !!plan.actions.length }])
      let cur = layout!
      for (const a of plan.actions) {
        if (a.type === 'photo_tool' || a.type === 'adjust') {
          const ids = a.scope === 'selected' && selPhoto ? [selPhoto.id] : Array.from(new Set(cur.pages.flatMap((p) => p.slots.map((s) => s.photo_id)).filter(Boolean))).slice(0, 8) as string[]
          for (const pid of ids) await apply(a.type === 'adjust' ? 'adjust' : a.tool, a.params || {}, pid, true)
          cur = (await refetch()).layout
        } else if (a.type === 'layout') {
          if (a.op === 'remove_page' && a.page >= 1 && a.page <= cur.pages.length) { const n = structuredClone(cur); n.pages.splice(a.page - 1, 1); commit(n); cur = n }
          else if (a.op === 'add_page') addPage()
          else { const p = await server(`/api/projects/${id}/relayout`, { mode: a.op === 'auto_cover' ? 'cover' : a.op === 'relayout' ? 'curate' : a.op }); if (p) cur = p.layout }
        } else if (a.type === 'title') commit(cur, a.value)
      }
      setChat((c) => [...c.slice(0, -1), { me: false, text: plan.actions.length ? 'Готово! Если не понравится — «Отменить».' : plan.reply }])
    } catch (e) { setChat((c) => [...c.slice(0, -1), { me: false, text: errorText(e) }]) }
  }
  // голос: текст появляется в поле по мере речи; после остановки ничего не отправляется — человек читает и жмёт «Отправить»
  const mic = useVoice((t) => setText([voiceBase.current, t].filter(Boolean).join(' ')),
    (msg) => toast({ title: msg, kind: 'bad', mascot: 'robot' }))
  useEffect(() => { if (!catOpen && mic.active) mic.stop() }, [catOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMic = () => {
    if (mic.active) { mic.stop(); setTimeout(() => textInput.current?.focus(), 50); return }
    voiceBase.current = text.trim(); mic.start()
  }
  const uploadMore = async (files: File[]) => {
    if (!files.length) return
    setWorking('upload')
    try { const fd = new FormData(); files.forEach((f) => fd.append('files', f)); fd.append('project_id', id!); const r = await api<{ photos: Photo[] }>('/api/photos', { method: 'POST', body: fd }); await flush(); await refetch(); toast({ title: `Добавлено фото: ${r.photos.length}`, mascot: 'cat' }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setWorking(null) }
  }

  if (!layout) return <div className="editor center"><img src={MASCOT('cat-point')} alt="" className="mascot float" style={{ width: 120 }} /></div>
  const imageTools = tools.filter((t) => t.type === 'image' && t.id !== 'style')
  const warn = pf ? pf.critical + pf.warnings : 0

  const renderCell = (pis: number[], ci: number) => {
    if (pis[0] === -1) {
      const cp = layout.cover?.photo_id ? photos[layout.cover.photo_id] : null
      return (
        <div role="button" tabIndex={0} onClick={() => { if (canEdit && tab !== 'text') { setSel(null); setReplaceOpen(true) } }} style={{ cursor: canEdit ? 'pointer' : undefined }} aria-label="Обложка — сменить фото">
          {cp ? <CoverView design={design} photo={media(`/api/media/${cp.id}?size=preview`)} title={title} aspect={aspect} size={Math.min(320, window.innerWidth * 0.72)}
            titleStyle={layout.title_style} titleEditing={canEdit && tab === 'text'} onTitleClick={canEdit ? () => { setSel(null); setTab('text') } : undefined} onTitle={(t) => editTitle(t)} /> : <div className="card center" style={{ width: 220, height: 220 }}>Выберите обложку</div>}
        </div>
      )
    }
    if (isSingle) {
      const s = pages[0]?.slots[0]; const ph = s?.photo_id ? photos[s.photo_id] : null
      return (
        <div style={{ width: '100%', maxWidth: 560, padding: '0 12px' }} onPointerDown={(e) => e.stopPropagation()}>
          {ph ? <View3D product={project!.product} options={project!.options} images={[`/api/media/${ph.id}?size=preview`]} filter={fx[ph.id]} title={title} design={design}
                  height={Math.max(260, Math.min(420, window.innerHeight * 0.48))} />
            : <div className="center" style={{ height: 300 }}><button className="btn btn-primary" onClick={() => setReplaceOpen(true)}>Выбрать фото</button></div>}
        </div>
      )
    }
    return (
      <div className={pis.length > 1 ? 'spread' : ''} style={{ width: '100%', maxWidth: pis.length > 1 ? 560 : aspect < 1 ? 300 : 420, boxShadow: pis.length > 1 ? undefined : '0 20px 44px rgba(0,0,0,.22)', borderRadius: 4, overflow: 'hidden' }}>
        {pis.map((pi) => <PageView key={pages[pi].id} page={pages[pi]} photos={photos} aspect={aspect} design={design} issues={issues[pi]} filters={fx}
          selected={sel?.page === pi ? sel.slot : null} onSlot={canEdit ? (si) => { setSel({ page: pi, slot: si }); if (tab === 'text') setTab('crop') } : undefined}
          textEditing={canEdit && tab === 'text' && textPi === pi} onText={canEdit ? () => openText(pi) : undefined} onCaption={(t) => editPageText(pi, { caption: t })} />)}
        {isBook && pis.length === 1 && <div className="bookpage" style={{ aspectRatio: String(aspect), background: design?.page || '#fff' }} />}
      </div>
    )
  }

  return (
    <div className="editor">
      <header className="topbar glass" style={{ position: 'relative' }}>
        <button className="icon-btn plain" aria-label="Назад" onClick={async () => { await flush().catch(() => {}); nav('/') }}><ChevronLeft size={22} /></button>
        <div className="title">{title}<div className="t-xs muted" style={{ fontWeight: 550 }}>{save === 'saved' ? 'сохранено' : save === 'saving' ? 'сохраняю…' : save === 'offline' ? 'офлайн — на телефоне' : 'ошибка сохранения'}</div></div>
        {project?.product?.specs.shared && <button className="icon-btn plain" aria-label="Участники" onClick={() => setShareOpen(true)}><Users size={19} /></button>}
        {!isSingle && <button className="icon-btn plain" aria-label="3D-просмотр" title="Посмотреть в 3D" onClick={async () => { await flush().catch(() => {}); setView3d(true) }}><Box size={19} /></button>}
        <button className="icon-btn plain" aria-label="Отменить" onClick={undo} disabled={!history.current.length}><Undo2 size={19} /></button>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={async () => { await flush().catch(() => {}); nav(`/check/${id}`) }}>Далее{warn ? ` · ${warn}` : ''}</button>}
      </header>

      <div className="editor-stage">
        <div ref={carRef} className="carousel" onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          {cells.map((pis, ci) => <div key={ci} className="cell">{renderCell(pis, ci)}</div>)}
        </div>
        {cells.length > 1 && (
          <>
            <div className="dots" aria-hidden>{cells.slice(0, 14).map((_, i) => <i key={i} className={i === cell ? 'on' : ''} />)}</div>
            <div className="t-xs muted" style={{ textAlign: 'center', paddingBottom: 6 }}>{isBook ? (cell === 0 ? 'Обложка' : `Страницы ${curPages.map((x) => x + 1).join('–')} из ${pages.length}`) : `${cell + 1} из ${cells.length}`}</div>
            <button className="icon-btn stage-arrow" aria-label="Назад по страницам" onClick={() => goTo(cell - 1)} disabled={cell === 0} style={{ position: 'absolute', left: 10, top: '45%' }}><ChevronLeft size={20} /></button>
            <button className="icon-btn stage-arrow" aria-label="Вперёд по страницам" onClick={() => goTo(cell + 1)} disabled={cell >= cells.length - 1} style={{ position: 'absolute', right: 10, top: '45%' }}><ChevronRight size={20} /></button>
          </>
        )}
        {canEdit && <button className="cat-fab" aria-label="Попросить Кота" onClick={() => setCatOpen(true)}><img src={MASCOT('cat-head')} alt="" /></button>}
      </div>

      {canEdit && (
        <div className="editor-panel">
          {tab === 'layout' && (
            <>
              <div className="strip">
                {!isSingle && curPages[0] >= 0 && Object.entries(TEMPLATES).map(([k, t]) => (
                  <button key={k} className={`tool ${pages[curPages[0]]?.template === k ? 'on' : ''}`} onClick={() => setPageTemplate(curPages[0], k)}><span className="ic"><TplIcon id={k} /></span>{t.title}</button>
                ))}
                {(isBook || kind === 'card') && <button className="tool" onClick={() => setDesignOpen(true)}><span className="ic"><LayoutTemplate size={22} /></span>Дизайн</button>}
                {isBook && <button className="tool" onClick={() => server(`/api/projects/${id}/relayout`, { mode: 'shuffle' }, 'shuffle')} disabled={!!working}><span className="ic">{working === 'shuffle' ? <Loader2 className="spin" size={22} /> : <Shuffle size={22} />}</span>Перемешать</button>}
                {isBook && <button className="tool" onClick={() => server(`/api/projects/${id}/captions`, undefined, 'captions')} disabled={!!working}><span className="ic">{working === 'captions' ? <Loader2 className="spin" size={22} /> : <Quote size={22} />}</span>Подписи</button>}
                {!isSingle && <button className="tool" onClick={addPage}><span className="ic"><Plus size={22} /></span>Страница</button>}
                {!isSingle && curPages[0] >= 0 && pages.length > 1 && <button className="tool" onClick={removePage}><span className="ic"><Trash2 size={22} /></span>Удалить</button>}
                {isSingle && project?.product.specs.colors?.map((c) => (
                  <button key={c.id} className={`tool ${project.options.color === c.id ? 'on' : ''}`} onClick={() => setOptions({ color: c.id })} aria-label={c.label}>
                    <span className="ic" style={{ background: c.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />{c.label.split(' ')[0]}</button>
                ))}
                {isSingle && [...(project?.product.specs.covers || []), ...(project?.product.specs.papers || [])].length > 0 && (project!.product.specs.covers || []).length + (project!.product.specs.papers || []).length > 1 && (
                  [...(project!.product.specs.covers || []).map((o) => ({ ...o, k: 'cover' })), ...(project!.product.specs.papers || []).map((o) => ({ ...o, k: 'paper' }))]
                    .filter((o, _, arr) => arr.filter((x) => x.k === o.k).length > 1)
                    .map((o) => <button key={o.k + o.id} className={`tool ${project!.options[o.k] === o.id ? 'on' : ''}`} onClick={() => setOptions({ [o.k]: o.id })}><span className="ic"><Sparkles size={20} /></span>{o.label}</button>)
                )}
                {isSingle && (project?.photos || []).filter((p) => !p.parent_id).map((p, i) => {
                  const cur = pages[0]?.slots[0]?.photo_id; const curRoot = cur ? photos[cur]?.parent_id || cur : null
                  return <button key={p.id} className={`filter ${curRoot === p.id ? 'on' : ''}`} onClick={() => { setSel({ page: 0, slot: 0 }); setSlotPhoto(p.id) }} aria-label={`Поставить фото ${i + 1}`}>
                    <span className="fi"><img src={media(p.thumb)} alt="" /></span>Фото {i + 1}</button>
                })}
                <button className="tool" onClick={() => fileRef.current?.click()}><span className="ic">{working === 'upload' ? <Loader2 className="spin" size={22} /> : <ImagePlus size={22} />}</span>{isSingle ? 'Загрузить' : 'Ещё фото'}</button>
              </div>
              {!isSingle && pages.length > 1 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
                    <div className="pages-strip" aria-label="Порядок страниц — перетащите">
                      {pages.map((p, i) => <Thumb key={p.id} page={p} index={i} photos={photos} on={curPages.includes(i)} onClick={() => goTo(isBook ? Math.floor(i / 2) + 1 : i)} />)}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
          {tab === 'filters' && (
            <div className="strip">
              {!selPhoto ? <div className="muted t-sm" style={{ padding: 20 }}>Нажмите на фото, чтобы выбрать фильтр</div> : FILTERS.map((f) => (
                <button key={f.id} className={`filter ${(styleOf[selPhoto.parent_id || selPhoto.id] || (selPhoto.ai_tool === 'style' ? '' : 'none')) === f.id ? 'on' : ''}`} onClick={() => applyFilter(f)} disabled={!!working}>
                  <span className="fi"><img src={media((photos[selPhoto.parent_id || ''] || selPhoto).thumb)} alt="" style={{ filter: f.css }} /></span>{f.label}
                </button>
              ))}
            </div>
          )}
          {tab === 'enhance' && (
            <div className="strip">
              {imageTools.map((t) => { const I = ICON[t.icon] || Sparkles; return <button key={t.id} className="tool" onClick={() => openTool(t)} disabled={!!working}><span className="ic"><I size={22} /></span>{t.title}</button> })}
            </div>
          )}
          {tab === 'crop' && (
            <div className="strip" style={{ alignItems: 'center' }}>
              {sel && selPhoto ? (
                <>
                  <div style={{ minWidth: 150, flex: 1 }}><div className="t-xs muted">Масштаб ×{(pages[sel.page].slots[sel.slot].crop?.zoom || 1).toFixed(2)}</div>
                    <input type="range" min={1} max={2.5} step={0.05} value={pages[sel.page].slots[sel.slot].crop?.zoom || 1} onChange={(e) => setCrop({ ...pages[sel.page].slots[sel.slot].crop, zoom: +e.target.value })} aria-label="Масштаб" />
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      {(['x', 'y'] as const).map((ax) => <input key={ax} type="range" min={0} max={1} step={0.02} value={pages[sel.page].slots[sel.slot].crop?.[ax] ?? .5} onChange={(e) => setCrop({ ...pages[sel.page].slots[sel.slot].crop, [ax]: +e.target.value })} aria-label={ax === 'x' ? 'Сдвиг по горизонтали' : 'Сдвиг по вертикали'} />)}
                    </div>
                  </div>
                  <button className="tool" onClick={() => server(`/api/projects/${id}/fit-faces`, undefined, 'faces')}><span className="ic"><ScanFace size={22} /></span>Лица в кадр</button>
                  <button className="tool" onClick={() => apply('adjust', { rotate: 90 })}><span className="ic"><RotateCw size={22} /></span>Повернуть</button>
                  <button className="tool" onClick={() => setReplaceOpen(true)}><span className="ic"><Replace size={22} /></span>Заменить</button>
                  {selPhoto.parent_id && <button className="tool" onClick={revert}><span className="ic"><History size={22} /></span>Оригинал</button>}
                  <button className="tool" onClick={() => setSlotPhoto(null)}><span className="ic"><Trash2 size={22} /></span>Убрать</button>
                </>
              ) : <div className="muted t-sm" style={{ padding: 20 }}>Нажмите на фото на странице</div>}
            </div>
          )}
          {tab === 'text' && (() => {
            const isCover = textPi < 0
            const pg = isCover ? undefined : pages[textPi]
            const ts: TextStyle = (isCover ? layout.title_style : pg?.text) || {}
            const val = isCover ? title : pg?.caption || ''
            const setVal = (v: string) => (isCover ? editTitle(v) : editPageText(textPi, { caption: v }))
            const setSt = (st: TextStyle) => (isCover ? editTitle(undefined, st) : editPageText(textPi, { text: st }))
            const font = ts.font || design?.font || 'sans'
            if (!isCover && !pg) return <div className="muted t-sm" style={{ padding: 20 }}>Добавьте страницу, чтобы написать текст</div>
            return (
              <div className="text-panel">
                <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
                  {!isCover && curPages.length > 1 && (
                    <div className="seg seg-v">{curPages.map((p, i) => <button key={p} className={p === textPi ? 'active' : ''} onClick={() => setTextSel(p)}>{i ? 'Справа' : 'Слева'}</button>)}</div>
                  )}
                  <textarea className="input text-input" rows={1} value={val} maxLength={isCover ? 120 : 300} onChange={(e) => setVal(e.target.value)}
                    placeholder={isCover ? 'Название на обложке' : 'Текст на странице — или нажмите на текст прямо в книге'} aria-label={isCover ? 'Название на обложке' : 'Текст страницы'} />
                </div>
                <div className="strip tight" aria-label="Готовые фразы">
                  {TEXT_PRESETS.map((t) => <button key={t} className="chip" onClick={() => setVal(t)}>{t}</button>)}
                  <button className="chip" onClick={() => setVal(new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }))}>Сегодняшняя дата</button>
                </div>
                <div className="strip tight" aria-label="Стили текста">
                  {TEXT_STYLES.filter((x) => !isCover || x.id !== 'photo').map((x) => (
                    <button key={x.id} className="txt-style" onClick={() => setSt(x.st)} style={{ fontFamily: FONT[x.st.font || 'sans'], textTransform: x.st.upper ? 'uppercase' : undefined, letterSpacing: x.st.upper ? '.08em' : undefined }}>{x.label}</button>
                  ))}
                </div>
                <div className="strip tight" aria-label="Шрифт">
                  {FONT_LIST.map((f) => (
                    <button key={f.id} className={'font-chip' + (font === f.id ? ' on' : '')} onClick={() => setSt({ font: f.id })} aria-pressed={font === f.id}>
                      <b style={{ fontFamily: FONT[f.id], fontWeight: f.id === 'script' || f.id === 'hand' ? 400 : 700 }}>Аа</b>{f.label}</button>
                  ))}
                </div>
                <div className="row wrap" style={{ gap: 10 }}>
                  <label className="row t-xs muted" style={{ gap: 6, flex: '1 1 140px' }}>Размер
                    <input type="range" min={0.6} max={2} step={0.05} value={ts.size || 1} onChange={(e) => setSt({ size: +e.target.value })} aria-label="Размер текста" style={{ flex: 1 }} /></label>
                  <div className="seg seg-icons" role="group" aria-label="Выравнивание">
                    {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, I]) => (
                      <button key={a} className={(ts.align || 'center') === a ? 'active' : ''} onClick={() => setSt({ align: a })} aria-label={a === 'left' ? 'По левому краю' : a === 'center' ? 'По центру' : 'По правому краю'}><I size={16} /></button>
                    ))}
                    <button className={ts.upper ? 'active' : ''} onClick={() => setSt({ upper: !ts.upper })} aria-pressed={!!ts.upper} aria-label="Заглавные буквы"><CaseUpper size={17} /></button>
                  </div>
                  {!isCover && (
                    <div className="seg seg-icons" role="group" aria-label="Положение текста">
                      {([['top', 'Сверху'], ['middle', 'Центр'], ['bottom', 'Снизу']] as const).map(([p, l]) => (
                        <button key={p} className={(ts.pos || 'bottom') === p ? 'active' : ''} onClick={() => setSt({ pos: p })}>{l}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 8 }} role="group" aria-label="Цвет текста">
                  <button className={'swatch auto' + (!ts.color ? ' on' : '')} onClick={() => setSt({ color: undefined })} aria-label="Цвет из дизайна" title="Как в дизайне">A</button>
                  {TEXT_COLORS.map((c) => <button key={c} className={'swatch' + (ts.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setSt({ color: c })} aria-label={'Цвет ' + c} />)}
                  {!isCover && val && <button className="chip" style={{ marginLeft: 'auto' }} onClick={() => setVal('')}><Trash2 size={14} /> Убрать текст</button>}
                </div>
              </div>
            )
          })()}
          <nav className="tabs" aria-label="Режимы редактора">
            {(([['layout', 'Макет', LayoutTemplate], ['text', 'Текст', Type], ['filters', 'Фильтры', Palette], ['enhance', 'Улучшить', Wand2], ['crop', 'Кадр', Crop]] as const).filter(([k]) => !(isSingle && k === 'text'))).map(([k, l, I]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-pressed={tab === k}><I size={22} />{l}</button>
            ))}
          </nav>
        </div>
      )}
      {!canEdit && project && <div className="editor-panel center" style={{ padding: 16 }}><button className="btn btn-primary" onClick={() => nav('/orders')}>Проект в заказе — к заказам</button></div>}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => { uploadMore(Array.from(e.target.files || [])); e.target.value = '' }} />

      {/* До/после */}
      <Sheet open={!!tool} onClose={() => setTool(null)} label={tool?.title}>
        {tool && (
          <div className="stack">
            <div className="between"><div><h2 className="t-h2">{tool.title}</h2><div className="t-sm muted">{tool.subtitle}</div></div>
              <span className="badge b-soft">{tool.provider_kind === 'builtin' ? (tool.id === 'upscale' || tool.id === 'remove_bg' ? 'нейросеть' : 'локально') : tool.provider}</span></div>
            {tool.id === 'upscale' && <div className="seg">{[2, 4].map((s) => <button key={s} className={tparams.scale === s ? 'active' : ''} onClick={() => { setTparams({ scale: s }); runPreview('upscale', { scale: s }) }}>×{s}</button>)}</div>}
            {tool.generative && <div className="row"><input className="input" value={tparams.scene || ''} onChange={(e) => setTparams({ ...tparams, scene: e.target.value })} placeholder="на берегу моря на закате" /><button className="btn btn-secondary" onClick={() => runPreview(tool.id, tparams)}>Показать</button></div>}
            {tool.manual ? <Manual photo={selPhoto!} busy={working === 'adjust'} onApply={(p) => apply('adjust', p)} />
              : preview ? <><BeforeAfter before={preview.before} after={preview.after} /><div className="t-xs muted">{preview.meta} · превью, на оригинал применится в полном разрешении</div></>
                : !tool.generative && <div className="card scan center" style={{ height: 220 }}><Avatar who="robot" size={70} /></div>}
            {!tool.manual && <button className="btn btn-primary btn-lg btn-block" disabled={!!working || (!preview && !tool.generative)} onClick={() => apply(tool.id, tparams)}>{working ? <><Loader2 className="spin" size={18} /> Обрабатываю оригинал…</> : 'Применить'}</button>}
          </div>
        )}
      </Sheet>

      {/* Кот */}
      <Sheet open={catOpen} onClose={() => setCatOpen(false)} label="Кот-ассистент">
        <div className="stack">
          <div className="row"><Avatar who="cat" size={52} /><div><h2 className="t-h2">Что поменять?</h2><div className="t-sm muted">Скажите словами — я сделаю, а вы сможете отменить</div></div></div>
          {chat.length > 0 && <div className="stack" style={{ gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {chat.map((m, i) => <div key={i} className="bubble" style={m.me ? { alignSelf: 'flex-end', background: 'var(--primary)', color: 'var(--primary-ink)', borderRadius: '20px 20px 6px 20px' } : { alignSelf: 'flex-start' }}>{m.wait && <Loader2 size={13} className="spin" style={{ marginRight: 6, verticalAlign: -2 }} />}{m.text}</div>)}
          </div>}
          <div className="row wrap" style={{ gap: 6 }}>{SUGGEST.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div>
          <form className="row chat-form" onSubmit={(e) => { e.preventDefault(); if (mic.active) mic.stop(); if (text.trim()) { ask(text); setText('') } }}>
            <div className={`voice-field ${mic.active ? 'on' : ''}`}>
              <textarea ref={textInput} className="input chat-input" rows={1} value={text} onChange={(e) => setText(e.target.value)} readOnly={mic.state === 'listening'}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit() } }}
                placeholder={mic.state === 'starting' ? 'Включаю микрофон…' : mic.active ? 'Говорите — текст появится здесь…' : 'Например: сделай фото ярче'} aria-label="Команда Коту" />
              {mic.active && <span className="voice-level" aria-hidden><i style={{ transform: `scaleY(${0.25 + mic.level * 0.9})` }} /><i style={{ transform: `scaleY(${0.2 + mic.level * 1.2})` }} /><i style={{ transform: `scaleY(${0.25 + mic.level * 0.8})` }} /></span>}
            </div>
            <button type="button" className={`icon-btn plain mic-btn ${mic.active ? 'on' : ''}`} onClick={toggleMic} aria-pressed={mic.active}
              aria-label={mic.active ? 'Остановить запись' : 'Сказать голосом'} title={mic.active ? 'Остановить — текст останется в поле' : 'Сказать голосом'}>
              {mic.active ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}</button>
            <button className="icon-btn" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }} aria-label="Отправить" disabled={!text.trim() || mic.state === 'finishing'}><Send size={17} /></button>
          </form>
          {mic.active && <div className="t-xs muted" role="status">{mic.state === 'finishing' ? 'Дораспознаю…' : mic.engine === 'server' ? 'Слушаю · распознаёт наш сервер (Vosk), без облака. Нажмите ■, проверьте текст и отправьте.' : 'Слушаю… Нажмите ■, проверьте текст и отправьте.'}</div>}
        </div>
      </Sheet>

      {view3d && project && (
        <div className="viewer3d" role="dialog" aria-label="3D-просмотр">
          <header className="topbar glass" style={{ position: 'relative' }}>
            <button className="icon-btn plain" aria-label="Закрыть" onClick={() => setView3d(false)}><X size={22} /></button>
            <div className="title">{title}<div className="t-xs muted" style={{ fontWeight: 550 }}>так изделие выйдет из печати</div></div>
          </header>
          <View3D product={project.product} options={project.options} layout={layout} photos={photos} design={design} title={title} filters={fx}
            images={Array.from(new Set(pages.flatMap((p) => p.slots.map((x) => x.photo_id)).filter(Boolean) as string[])).slice(0, 12).map((pid) => `/api/media/${pid}?size=preview`)} height="100%" />
        </div>
      )}
      {/* Дизайн */}
      <Sheet open={designOpen} onClose={() => setDesignOpen(false)} label="Дизайн">
        <h2 className="t-h2" style={{ marginBottom: 10 }}>Дизайн</h2>
        <div className="hscroll" style={{ gap: 8, marginBottom: 6 }}>{OCCASIONS.map((o) => <button key={o} className={`chip ${occ === o ? 'active' : ''}`} onClick={() => setOcc(o)}>{o[0].toUpperCase() + o.slice(1)}</button>)}</div>
        <div className="design-grid">
          {byOccasion(designs, occ).map((d) => <DesignCard key={d.id} d={d} title={title.split(' ').slice(0, 2).join(' ')} on={project?.options.template === d.id} onClick={() => { setOptions({ template: d.id }); setDesignOpen(false) }} />)}
        </div>
      </Sheet>

      {/* Замена фото */}
      <Sheet open={replaceOpen} onClose={() => setReplaceOpen(false)} label="Выбор фото">
        <h2 className="t-h2" style={{ marginBottom: 12 }}>{sel ? 'Заменить фото' : 'Фото на обложку'}</h2>
        <div className="grid3" style={{ borderRadius: 16, overflow: 'hidden' }}>
          {(project?.photos || []).map((p) => <button key={p.id} className="pick" onClick={() => { setSlotPhoto(p.id); setReplaceOpen(false) }}><img src={media(p.thumb)} alt="" /></button>)}
        </div>
      </Sheet>

      <Share open={shareOpen} onClose={() => setShareOpen(false)} project={project} onChanged={refetch} />
    </div>
  )
}

function Thumb({ page, index, photos, on, onClick }: { page: Page; index: number; photos: Record<string, Photo>; on: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  const first = page.slots.find((s) => s.photo_id && photos[s.photo_id])
  return (
    <button ref={setNodeRef} className={`pthumb ${on ? 'on' : ''}`} onClick={onClick} {...attributes} {...listeners} aria-label={`Страница ${index + 1}`}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}>
      <div className="m">{first ? <img src={media(photos[first.photo_id!].thumb)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="center" style={{ height: '100%', color: 'var(--primary)' }}>♥</div>}</div>{index + 1}
    </button>
  )
}

function TplIcon({ id }: { id: string }) {
  const t = TEMPLATES[id]
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeOpacity=".35" />
      {t.slots.map(([x, y, w, h], i) => <rect key={i} x={1 + x * 26} y={1 + y * 26} width={w * 26} height={h * 26} rx="1.5" fill="currentColor" opacity=".85" />)}
      {t.caption && <rect x="8" y={t.slots.length ? 23 : 13} width="12" height="2" rx="1" fill="currentColor" />}
    </svg>
  )
}

function Manual({ photo, busy, onApply }: { photo: Photo; busy: boolean; onApply: (p: any) => void }) {
  const [v, setV] = useState({ brightness: 0, contrast: 0, saturation: 0, temperature: 0 })
  const filter = `brightness(${1 + v.brightness / 250}) contrast(${1 + v.contrast / 120}) saturate(${1 + v.saturation / 100}) sepia(${Math.max(0, v.temperature) / 300}) hue-rotate(${v.temperature < 0 ? v.temperature / 6 : 0}deg)`
  const L: Record<string, string> = { brightness: 'Яркость', contrast: 'Контраст', saturation: 'Насыщенность', temperature: 'Температура' }
  return (
    <div className="stack">
      <img src={media(photo.thumb)} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 16, filter }} />
      {(Object.keys(v) as (keyof typeof v)[]).map((k) => <div key={k} className="field"><span className="label between">{L[k]}<span className="num">{v[k]}</span></span><input type="range" min={-100} max={100} value={v[k]} onChange={(e) => setV({ ...v, [k]: +e.target.value })} /></div>)}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => onApply(v)}>{busy ? <Loader2 className="spin" size={18} /> : 'Применить'}</button>
    </div>
  )
}

function Share({ open, onClose, project, onChanged }: { open: boolean; onClose: () => void; project: Project | null; onChanged: () => void }) {
  const { toast } = useApp()
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => setCode(project?.share_code || null), [project])
  const link = code ? `${location.origin}/join/${code}` : ''
  const make = async () => { const r = await api<{ share_code: string }>(`/api/projects/${project!.id}/share`, { method: 'POST' }); setCode(r.share_code); onChanged() }
  const share = async () => { try { if ((navigator as any).share) await (navigator as any).share({ title: project?.title, url: link }); else { await navigator.clipboard.writeText(link); toast({ title: 'Ссылка скопирована' }) } } catch { /* отмена */ } }
  const total = Object.values(project?.contributions || {}).reduce((a, b) => a + b, 0)
  return (
    <Sheet open={open} onClose={onClose} label="Общий альбом">
      <div className="stack">
        <div className="row"><Avatar who="cat" size={52} /><div><h2 className="t-h2">Скинемся на альбом</h2><div className="t-sm muted">Каждый добавит свои фото по ссылке</div></div></div>
        {code ? <>
          <div className="card flat row"><span className="grow t-sm" style={{ wordBreak: 'break-all' }}>{link}</span><button className="icon-btn plain" aria-label="Копировать" onClick={() => navigator.clipboard.writeText(link).then(() => toast({ title: 'Скопировано' }))}><Copy size={17} /></button></div>
          <button className="btn btn-primary btn-block" onClick={share}><Share2 size={18} /> Отправить в чат</button>
        </> : <button className="btn btn-primary btn-block" onClick={make}>Создать ссылку</button>}
        <div className="between"><h3 className="t-h3">Участники</h3><span className="t-sm muted">{total} фото</span></div>
        <div className="list">
          <div className="list-row"><span className="badge b-primary">организатор</span><span className="grow">{project?.owner_name}</span><b>{project?.contributions?.[String(project?.owner_id)] || 0}</b></div>
          {(project?.members || []).map((m) => <div key={m.user_id} className="list-row"><span className="grow">{m.name}</span><b>{project?.contributions?.[String(m.user_id)] || 0}</b></div>)}
        </div>
        <div className="t-sm muted">Промокод SKINEMSYA — −15%. При оформлении сумму можно разделить на всех участников.</div>
      </div>
    </Sheet>
  )
}
