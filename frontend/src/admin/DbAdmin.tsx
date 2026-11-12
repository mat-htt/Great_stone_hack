import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { api, fmtDate } from '../api'
import { Sheet } from '../components/ui'
import { errorText, useApp } from '../store'
import { Head } from './Admin'

interface Field { name: string; kind: string; pk: boolean; readonly: boolean; nullable: boolean }

export default function DbAdmin() {
  const { model } = useParams()
  return model ? <ChangeList model={model} /> : <Index />
}

function Index() {
  const [models, setModels] = useState<any[]>([])
  useEffect(() => { api<{ models: any[] }>('/api/admin/db').then((r) => setModels(r.models)) }, [])
  const groups = Array.from(new Set(models.map((m) => m.group)))
  return (
    <div>
      <Head title="База данных" crumbs={[{ label: 'База данных' }]} sub="Все модели системы: просмотр, поиск, правка и создание записей. Пароли и ключи скрыты, журналы — только для чтения." />
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {groups.map((g) => (
          <div key={g} className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', fontWeight: 750, background: 'var(--primary-soft)', color: 'var(--primary-strong)' }}>{g}</div>
            {models.filter((m) => m.group === g).map((m) => (
              <Link key={m.id} to={`/admin/db/${m.id}`} className="list-row">
                <span className="grow" style={{ fontWeight: 600 }}>{m.title}</span>
                <span className="t-sm muted num">{m.count}</span>
                {m.readonly ? <span className="badge b-soft">журнал</span> : m.create ? <span className="badge b-info">+ добавить</span> : <span className="badge b-soft">правка</span>}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangeList({ model }: { model: string }) {
  const { toast } = useApp()
  const nav = useNavigate()
  const [data, setData] = useState<any>(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState<Record<string, any> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const load = (p = page) => api(`/api/admin/db/${model}?page=${p}&q=${encodeURIComponent(q)}`).then(setData).catch((e) => toast({ title: errorText(e), kind: 'bad' }))
  useEffect(() => { setPage(1); load(1) }, [model])

  const fields: Field[] = data?.fields || []
  const pk = data?.model.pk
  const save = async () => {
    try {
      if (isNew) await api(`/api/admin/db/${model}`, { method: 'POST', json: edit })
      else await api(`/api/admin/db/${model}/${edit![pk]}`, { method: 'PUT', json: edit })
      setEdit(null); load(); toast({ title: isNew ? 'Запись создана' : 'Изменения сохранены' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const del = async () => {
    if (!edit || !confirm('Удалить запись? Это действие нельзя отменить.')) return
    try { await api(`/api/admin/db/${model}/${edit[pk]}`, { method: 'DELETE' }); setEdit(null); load(); toast({ title: 'Запись удалена' }) } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const cell = (f: Field | undefined, v: any) => {
    if (v === null || v === undefined || v === '') return <span className="muted">—</span>
    if (f?.kind === 'bool') return <span className={`badge ${v ? 'b-ok' : 'b-soft'}`}>{v ? 'да' : 'нет'}</span>
    if (f?.kind === 'datetime') return <span className="t-sm">{fmtDate(v, true)}</span>
    if (f?.kind === 'json') return <code className="kbd">{JSON.stringify(v).slice(0, 40)}</code>
    return <span className="t-sm">{String(v).slice(0, 60)}</span>
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1

  return (
    <div>
      <Head title={data?.model.title || '…'} crumbs={[{ to: '/admin/db', label: 'База данных' }, { label: data?.model.title || model }]}
        sub={data ? `${data.model.group} · записей: ${data.total}${data.model.readonly ? ' · только чтение' : ''}` : undefined}
        right={data?.model.create && <button className="btn btn-primary btn-sm" onClick={() => { setIsNew(true); setEdit({}) }}><Plus size={16} /> Добавить</button>} />
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <form className="row" style={{ padding: 12, borderBottom: '1px solid var(--line)' }} onSubmit={(e) => { e.preventDefault(); setPage(1); load(1) }}>
          <Search size={18} className="muted" /><input className="input sm" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" style={{ maxWidth: 320 }} />
          <div style={{ flex: 1 }} />
          <button type="button" className="icon-btn plain" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1) }} aria-label="Назад"><ChevronLeft size={18} /></button>
          <span className="t-sm muted">{page} / {pages}</span>
          <button type="button" className="icon-btn plain" disabled={page >= pages} onClick={() => { setPage(page + 1); load(page + 1) }} aria-label="Вперёд"><ChevronRight size={18} /></button>
        </form>
        <div style={{ overflowX: 'auto' }}>
          <table className="t">
            <thead><tr>{data?.model.list.map((c: string) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {data?.items.map((row: any) => (
                <tr key={row[pk]} onClick={() => { setIsNew(false); setEdit({ ...row }) }}>
                  {data.model.list.map((c: string) => <td key={c}>{cell(fields.find((f) => f.name === c), row[c])}</td>)}
                </tr>
              ))}
              {data?.items.length === 0 && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 28 }}>Ничего не найдено</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} label="Запись" wide>
        {edit && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!data.model.readonly) save() }}>
            <h2 className="t-h2">{isNew ? `Новая запись · ${data.model.title}` : `${data.model.title} · ${edit[pk]}`}</h2>
            {fields.filter((f) => !(isNew && f.readonly && !f.pk)).map((f) => (
              <div key={f.name} className="field">
                <label>{f.name}{f.readonly && !isNew ? ' · только чтение' : ''}</label>
                {f.kind === 'bool' ? <button type="button" className={`switch ${edit[f.name] ? 'on' : ''}`} disabled={f.readonly || data.model.readonly} onClick={() => setEdit({ ...edit, [f.name]: !edit[f.name] })} aria-label={f.name} />
                  : f.kind === 'json' ? <textarea className="input" readOnly value={JSON.stringify(edit[f.name], null, 2) ?? ''} style={{ fontFamily: 'monospace', fontSize: 12, minHeight: 80 }} />
                    : f.kind === 'text' ? <textarea className="input" value={edit[f.name] ?? ''} readOnly={(f.readonly && !isNew) || data.model.readonly} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })} />
                      : <input className="input sm" value={edit[f.name] ?? ''} readOnly={(f.readonly && !(isNew && f.pk)) || data.model.readonly} type={f.kind === 'number' ? 'number' : 'text'} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })} />}
              </div>
            ))}
            {model === 'users' && !data.model.readonly && <div className="field"><label>Новый пароль (необязательно)</label><input className="input sm" type="password" onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="new-password" /></div>}
            {!data.model.readonly && (
              <div className="row">
                <button className="btn btn-primary">Сохранить</button>
                {!isNew && data.model.delete && <button type="button" className="btn btn-danger" onClick={del}>Удалить</button>}
                <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>Отмена</button>
              </div>
            )}
            {model === 'photo_events' && edit.photo_id && <button type="button" className="btn btn-secondary" onClick={() => nav(`/admin/pipeline/${edit.photo_id}`)}>Открыть в конвейере</button>}
          </form>
        )}
      </Sheet>
    </div>
  )
}
