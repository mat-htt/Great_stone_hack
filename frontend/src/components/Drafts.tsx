import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, BookmarkCheck, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { api, fmtDate, media, type Project } from '../api'
import { dropLocal, errorText, useApp } from '../store'
import { Sheet, plural } from './ui'


/** Черновики: открыть, сохранить (закрепить — не удалится при очистке), переименовать, удалить, очистить все. */
export default function Drafts({ drafts, setDrafts }: { drafts: Project[]; setDrafts: (d: Project[]) => void }) {
  const { toast } = useApp()
  const [all, setAll] = useState(false)
  const [menu, setMenu] = useState<Project | null>(null)
  const [rename, setRename] = useState('')
  const [confirm, setConfirm] = useState<'one' | 'clear' | null>(null)
  if (!drafts.length) return null

  const sorted = [...drafts].sort((a, b) => Number(!!b.kept) - Number(!!a.kept) || b.updated_at.localeCompare(a.updated_at))
  const removable = drafts.filter((d) => !d.kept && d.role !== 'member').length
  const patch = (p: Project) => setDrafts(drafts.map((d) => (d.id === p.id ? { ...d, ...p } : d)))

  const meta = async (d: Project, body: { title?: string; keep?: boolean }, ok: string) => {
    try { patch(await api<Project>(`/api/projects/${d.id}/meta`, { method: 'POST', json: body })); toast({ title: ok }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const remove = async (d: Project) => {
    try { await api(`/api/projects/${d.id}`, { method: 'DELETE' }); await dropLocal(d.id); setDrafts(drafts.filter((x) => x.id !== d.id)); toast({ title: 'Черновик удалён', body: 'Фото остались в «Моих фото»' }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setConfirm(null); setMenu(null) }
  }
  const clear = async () => {
    try {
      const r = await api<{ deleted: number; ids: string[] }>('/api/projects', { method: 'DELETE' })
      await Promise.all(r.ids.map(dropLocal))
      setDrafts(drafts.filter((d) => !r.ids.includes(d.id)))
      toast({ title: `Удалено черновиков: ${r.deleted}`, body: 'Сохранённые остались' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setConfirm(null); setAll(false) }
  }

  const Row = ({ d }: { d: Project }) => (
    <div className="list-row" style={{ cursor: 'default' }}>
      <Link to={`/editor/${d.id}`} className="row grow" style={{ gap: 12, minWidth: 0 }}>
        {d.cover_photo_id ? <img src={media(`/api/media/${d.cover_photo_id}?size=thumb`)} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
          : <span style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--fill)', flexShrink: 0 }} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="t-h3 ellipsis">{d.kept && <BookmarkCheck size={15} style={{ color: 'var(--primary)', verticalAlign: -2, marginRight: 4 }} />}{d.title}</div>
          <div className="t-sm muted ellipsis">{d.role === 'member' ? `альбом ${d.owner_name}` : `${d.kept ? 'сохранён' : 'автосохранение'} · ${fmtDate(d.updated_at)}`}</div>
        </div>
      </Link>
      {d.role !== 'member' && <button className="icon-btn plain" aria-label={`Действия с черновиком «${d.title}»`} onClick={() => { setMenu(d); setRename(d.title) }}><MoreHorizontal size={20} /></button>}
    </div>
  )

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="t-h2">Черновики</h2>
        <button className="t-sm" style={{ border: 0, background: 'none', color: 'var(--primary)', fontWeight: 650, cursor: 'pointer' }} onClick={() => setAll(true)}>
          {drafts.length > 3 ? `Все ${drafts.length}` : 'Управлять'}
        </button>
      </div>
      <div className="list">{sorted.slice(0, 3).map((d) => <Row key={d.id} d={d} />)}</div>

      <Sheet open={all} onClose={() => setAll(false)} label="Все черновики">
        <div className="between" style={{ marginBottom: 12 }}>
          <h2 className="t-h2">Черновики · {drafts.length}</h2>
          {removable > 0 && <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setConfirm('clear')}><Trash2 size={15} /> Очистить</button>}
        </div>
        <div className="t-sm muted" style={{ marginBottom: 10 }}>Сохранённые черновики (закладка) не удаляются при очистке.</div>
        <div className="list" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>{sorted.map((d) => <Row key={d.id} d={d} />)}</div>
      </Sheet>

      <Sheet open={!!menu && !confirm} onClose={() => setMenu(null)} label="Черновик">
        {menu && (
          <div className="stack" style={{ gap: 10 }}>
            <h2 className="t-h2 ellipsis">{menu.title}</h2>
            <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (rename.trim() && rename !== menu.title) meta(menu, { title: rename }, 'Переименовано'); setMenu(null) }}>
              <input className="input" value={rename} onChange={(e) => setRename(e.target.value)} maxLength={120} aria-label="Название черновика" />
              <button className="icon-btn" aria-label="Переименовать" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}><Pencil size={17} /></button>
            </form>
            <button className="btn btn-secondary btn-block" onClick={() => { meta(menu, { keep: !menu.kept }, menu.kept ? 'Снято с сохранения' : 'Черновик сохранён — очистка его не тронет'); setMenu(null) }}>
              {menu.kept ? <><Bookmark size={18} /> Убрать из сохранённых</> : <><BookmarkCheck size={18} /> Сохранить черновик</>}
            </button>
            <button className="btn btn-block" style={{ background: 'none', color: 'var(--danger)' }} onClick={() => setConfirm('one')}><Trash2 size={18} /> Удалить</button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} label="Подтверждение">
        <div className="stack">
          <h2 className="t-h2">{confirm === 'clear' ? `Удалить ${removable} ${plural(removable, 'черновик', 'черновика', 'черновиков')}?` : `Удалить «${menu?.title}»?`}</h2>
          <div className="muted">{confirm === 'clear' ? 'Сохранённые черновики останутся. ' : ''}Фото не удалятся — они останутся в «Моих фото». Макет восстановить нельзя.</div>
          <button className="btn btn-danger btn-block" onClick={() => (confirm === 'clear' ? clear() : menu && remove(menu))}>Удалить</button>
          <button className="btn btn-secondary btn-block" onClick={() => setConfirm(null)}>Отмена</button>
        </div>
      </Sheet>
    </section>
  )
}
