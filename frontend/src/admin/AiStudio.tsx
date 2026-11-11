import { useEffect, useState } from 'react'
import { CheckCircle2, Cloud, Cpu, FlaskConical, Loader2, Plus, Server, Wifi, XCircle } from 'lucide-react'
import { api, fmtDate } from '../api'
import { Cat, Robot } from '../components/Mascots'
import { BeforeAfter, Sheet } from '../components/ui'
import { errorText, useApp } from '../store'
import { Head } from './Admin'

interface Provider { id: string; title: string; kind: string; base_url: string; api_key_masked: string; api_key_env: string; has_key: boolean
  default_model: string; vision_model: string; image_model: string; location: string; enabled: boolean; notes: string }
interface Tool { id: string; title: string; subtitle: string; group: string; type: string; kinds: string[]; generative?: boolean
  setting: { provider_id: string; model: string; enabled: boolean; fallback_builtin: boolean }
  stats: { runs: number; avg_ms: number; fallback: number; errors: number; saved_hours: number } }

const KIND: Record<string, { label: string; icon: any; color: string }> = {
  builtin: { label: 'Встроенный · CPU', icon: Cpu, color: 'var(--green)' },
  openai: { label: 'OpenAI-совместимый API', icon: Cloud, color: 'var(--blue)' },
  http_image: { label: 'GPU-воркер', icon: Server, color: 'var(--coral)' },
}

export default function AiStudio() {
  const { toast } = useApp()
  const [d, setD] = useState<{ providers: Provider[]; tools: Tool[]; summary: any; recent: any[] } | null>(null)
  const [edit, setEdit] = useState<Partial<Provider> & { api_key?: string; isNew?: boolean } | null>(null)
  const [ping, setPing] = useState<Record<string, any>>({})
  const [bench, setBench] = useState<{ tool: string; res?: any; busy?: boolean }>({ tool: 'auto_enhance' })

  const load = () => api('/api/admin/ai').then(setD).catch((e) => toast({ title: errorText(e), kind: 'bad' }))
  useEffect(() => { load() }, [])

  const updTool = async (id: string, body: any) => {
    try { await api(`/api/admin/ai/tools/${id}`, { method: 'PUT', json: body }); load(); toast({ title: 'Настройка сохранена', body: 'Применяется сразу, без перезапуска', mascot: 'robot' }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const saveProvider = async () => {
    if (!edit) return
    const { isNew, api_key_masked, has_key, ...body } = edit as any
    if (!body.api_key) delete body.api_key
    try {
      await api(isNew ? '/api/admin/ai/providers' : `/api/admin/ai/providers/${edit.id}`, { method: isNew ? 'POST' : 'PUT', json: body })
      setEdit(null); load(); toast({ title: 'Провайдер сохранён' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const test = async (id: string) => {
    setPing({ ...ping, [id]: { busy: true } })
    const r = await api(`/api/admin/ai/providers/${id}/test`, { method: 'POST' }).catch((e) => ({ ok: false, message: errorText(e) }))
    setPing((p) => ({ ...p, [id]: r }))
  }
  const toggleProvider = async (p: Provider) => {
    try { await api(`/api/admin/ai/providers/${p.id}`, { method: 'PUT', json: { enabled: !p.enabled } }); load() } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const runBench = async () => {
    setBench({ ...bench, busy: true, res: undefined })
    try { const res = await api('/api/admin/ai/benchmark', { method: 'POST', json: { tool: bench.tool } }); setBench({ tool: bench.tool, res }); load() }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }); setBench({ tool: bench.tool }) }
  }

  if (!d) return <div className="skeleton" style={{ height: 400 }} />
  const providers = Object.fromEntries(d.providers.map((p) => [p.id, p]))
  const imageTools = d.tools.filter((t) => t.type === 'image' && t.id !== 'adjust')

  return (
    <div>
      <Head title="AI-шлюз" sub="Каждый инструмент можно переключить на любую модель: встроенный движок, свой сервер (Qwen3 через Ollama / vLLM), облако или GPU-воркер." />
      <div className="panel row wrap" style={{ gap: 26, padding: 24, background: 'var(--green)', color: '#fff' }}>
        <div className="row"><Robot size={64} /><Cat size={60} /></div>
        <Stat v={d.summary.runs.toLocaleString('ru-RU')} l="AI-операций за 30 дней" />
        <Stat v={`${d.summary.saved_hours} ч`} l="ручной ретуши заменено" />
        <Stat v={`${d.summary.saved_byn.toLocaleString('ru-RU')} BYN`} l={`экономия при ${d.summary.rate} BYN/ч`} />
        <Stat v={`≈ ${d.summary.fte}`} l="ставки ретушёра в месяц" />
      </div>

      <div className="between" style={{ margin: '24px 0 12px' }}>
        <div className="h2">Провайдеры моделей</div>
        <button className="btn btn-sm btn-dark" onClick={() => setEdit({ isNew: true, kind: 'openai', enabled: true, id: '', title: '', base_url: '', default_model: '', location: 'Собственный сервер' })}><Plus size={15} /> Добавить</button>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {d.providers.map((p) => {
          const K = KIND[p.kind]
          const pr = ping[p.id]
          return (
            <div key={p.id} className="panel stack" style={{ gap: 8, opacity: p.enabled ? 1 : 0.72 }}>
              <div className="between">
                <span className="pill" style={{ background: 'rgba(54,76,73,.07)', color: K.color }}><K.icon size={13} />{K.label}</span>
                {p.kind !== 'builtin' && <button className={`switch ${p.enabled ? 'on' : ''}`} onClick={() => toggleProvider(p)} aria-label="Включить провайдера" />}
              </div>
              <div className="h3">{p.title}</div>
              <div className="small muted">{p.location}</div>
              {p.kind !== 'builtin' && <div className="tiny muted" style={{ wordBreak: 'break-all' }}>{p.base_url} · {p.default_model || p.image_model}{p.has_key ? ' · 🔑' : ''}</div>}
              {p.notes && <div className="tiny muted">{p.notes}</div>}
              {pr && !pr.busy && <div className="small row" style={{ gap: 6, color: pr.ok ? 'var(--ok)' : 'var(--bad)' }}>{pr.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{pr.message}</div>}
              <div className="row" style={{ marginTop: 'auto' }}>
                <button className="btn btn-sm btn-ghost" onClick={() => test(p.id)}>{pr?.busy ? <Loader2 size={14} className="spin" /> : <Wifi size={14} />} Проверить</button>
                {p.kind !== 'builtin' && <button className="btn btn-sm btn-soft" onClick={() => setEdit({ ...p, api_key: '' })}>Настроить</button>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="h2" style={{ margin: '28px 0 12px' }}>Инструменты и маршрутизация</div>
      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="t">
          <thead><tr><th>Инструмент</th><th>Провайдер</th><th>Модель</th><th>Вкл.</th><th>Фолбэк</th><th>Запусков</th><th>Ср. время</th><th>Сэкономлено</th></tr></thead>
          <tbody>
            {d.tools.map((t) => (
              <tr key={t.id}>
                <td><b>{t.title}</b>{t.generative && <span className="pill pill-info" style={{ marginLeft: 6 }}>ген.</span>}<div className="tiny muted">{t.subtitle}</div></td>
                <td>
                  <select className="input sm" style={{ minWidth: 220 }} value={t.setting.provider_id} onChange={(e) => updTool(t.id, { provider_id: e.target.value })} aria-label={`Провайдер для ${t.title}`}>
                    {d.providers.filter((p) => t.kinds.includes(p.kind)).map((p) => <option key={p.id} value={p.id}>{p.title}{p.enabled ? '' : ' (выкл.)'}</option>)}
                  </select>
                </td>
                <td><input className="input sm" style={{ width: 150 }} defaultValue={t.setting.model} placeholder={providers[t.setting.provider_id]?.default_model || 'по умолчанию'}
                  onBlur={(e) => e.target.value !== t.setting.model && updTool(t.id, { model: e.target.value })} aria-label="Модель" /></td>
                <td><button className={`switch ${t.setting.enabled ? 'on' : ''}`} onClick={() => updTool(t.id, { enabled: !t.setting.enabled })} aria-label="Включить инструмент" /></td>
                <td><button className={`switch ${t.setting.fallback_builtin ? 'on' : ''}`} onClick={() => updTool(t.id, { fallback_builtin: !t.setting.fallback_builtin })} aria-label="Фолбэк на встроенный" /></td>
                <td className="num">{t.stats.runs}{t.stats.fallback ? <span className="tiny muted"> · {t.stats.fallback} фолб.</span> : null}</td>
                <td className="num">{t.stats.avg_ms ? `${t.stats.avg_ms} мс` : '—'}</td>
                <td className="num">{t.stats.saved_hours} ч</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panels">
        <div className="panel span-7 stack">
          <div className="row"><FlaskConical size={20} color="var(--coral)" /><div className="h3">Песочница: сравните модель на тестовом кадре</div></div>
          <div className="row wrap">
            <select className="input sm" style={{ width: 240 }} value={bench.tool} onChange={(e) => setBench({ tool: e.target.value })} aria-label="Инструмент">
              {imageTools.map((t) => <option key={t.id} value={t.id}>{t.title} → {providers[t.setting.provider_id]?.title}</option>)}
            </select>
            <button className="btn btn-sm btn-primary" onClick={runBench} disabled={bench.busy}>{bench.busy ? <Loader2 size={14} className="spin" /> : 'Запустить'}</button>
          </div>
          {bench.res && (
            <>
              <BeforeAfter before={bench.res.before} after={bench.res.after} />
              <div className="small muted">{bench.res.meta.provider_title} · {bench.res.meta.model} · {bench.res.meta.duration_ms} мс · {bench.res.meta.status === 'fallback' ? `фолбэк: ${bench.res.meta.fallback_reason}` : 'ok'}</div>
            </>
          )}
        </div>
        <div className="panel span-5">
          <div className="h3">Журнал AI-задач</div>
          <div className="stack" style={{ gap: 6, marginTop: 10, maxHeight: 420, overflowY: 'auto' }}>
            {d.recent.map((j) => (
              <div key={j.id} className="row small" style={{ gap: 8 }}>
                <span className={`dot ${j.status === 'ok' ? 'st-green' : j.status === 'fallback' ? 'st-yellow' : 'st-red'}`} />
                <span className="grow"><b>{d.tools.find((t) => t.id === j.tool_id)?.title || j.tool_id}</b> · {j.provider_id} · {j.duration_ms} мс{j.error ? <span className="muted"> · {j.error.slice(0, 50)}</span> : null}</span>
                <span className="tiny muted">{fmtDate(j.created_at, true)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel span-12 small muted">
          <b style={{ color: 'var(--ink)' }}>Безопасность:</b> ключи хранятся только на сервере и не отдаются в интерфейс (видна маска); текст пользователей передаётся моделям как данные
          в разделителях, ответ модели проходит белый список действий; генеративные инструменты выключены по умолчанию; для каждого провайдера указано, где обрабатываются данные;
          при сбое внешней модели работа не останавливается — включается встроенный движок. Все изменения настроек — в журнале аудита.
        </div>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} label="Провайдер">
        {edit && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); saveProvider() }}>
            <div className="h2">{edit.isNew ? 'Новый провайдер' : edit.title}</div>
            {edit.isNew && (
              <>
                <div className="field"><label>ID (латиница)</label><input className="input" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} pattern="[a-z0-9_\-]{2,40}" required /></div>
                <div className="field"><label>Название</label><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required /></div>
                <div className="seg">{['openai', 'http_image'].map((k) => <button type="button" key={k} className={edit.kind === k ? 'active' : ''} onClick={() => setEdit({ ...edit, kind: k })}>{KIND[k].label}</button>)}</div>
              </>
            )}
            <div className="field"><label>Base URL</label><input className="input" value={edit.base_url || ''} onChange={(e) => setEdit({ ...edit, base_url: e.target.value })} placeholder="http://ollama:11434/v1" /></div>
            <div className="field"><label>Модель по умолчанию</label><input className="input" value={edit.default_model || ''} onChange={(e) => setEdit({ ...edit, default_model: e.target.value })} placeholder="qwen3:8b" /></div>
            {edit.kind === 'openai' && <div className="field"><label>Модель изображений (для генерации/правки)</label><input className="input" value={edit.image_model || ''} onChange={(e) => setEdit({ ...edit, image_model: e.target.value })} /></div>}
            <div className="field"><label>API-ключ {edit.api_key_masked ? `(сейчас ${edit.api_key_masked})` : ''}</label><input className="input" type="password" value={edit.api_key || ''} onChange={(e) => setEdit({ ...edit, api_key: e.target.value })} placeholder="оставьте пустым, чтобы не менять" autoComplete="off" /></div>
            <div className="field"><label>…или имя переменной окружения</label><input className="input" value={edit.api_key_env || ''} onChange={(e) => setEdit({ ...edit, api_key_env: e.target.value })} placeholder="OPENROUTER_API_KEY" /></div>
            <div className="field"><label>Где обрабатываются данные</label><input className="input" value={edit.location || ''} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></div>
            <button className="btn btn-primary btn-block">Сохранить</button>
          </form>
        )}
      </Sheet>
    </div>
  )
}

function Stat({ v, l }: { v: string; l: string }) {
  return <div><div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em' }} className="num">{v}</div><div className="small" style={{ opacity: .8 }}>{l}</div></div>
}
