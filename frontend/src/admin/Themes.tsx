import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { contrastRatio, chooseTheme, generateTheme, loadThemes, type Theme, type ThemeColors } from '../theme/theme'
import { errorText, useApp } from '../store'
import { Head } from './Admin'

const LABELS: Record<keyof ThemeColors, string> = {
  primary: 'Акцент', primaryInk: 'Текст на акценте', bg: 'Фон', surface: 'Карточки', surface2: 'Подложки', text: 'Текст', muted: 'Второстепенный текст',
  line: 'Линии', success: 'Успех', warning: 'Предупреждение', danger: 'Ошибка', info: 'Инфо', glow1: 'Свечение 1', glow2: 'Свечение 2', glow3: 'Свечение 3',
}

export default function Themes() {
  const { toast } = useApp()
  const [data, setData] = useState<{ default: string; themes: Theme[] } | null>(null)
  const [draft, setDraft] = useState<{ id?: string; name: string; mode: 'light' | 'dark'; colors: ThemeColors } | null>(null)
  const load = () => api<{ default: string; themes: Theme[] }>('/api/themes').then(setData)
  useEffect(() => { load() }, [])

  const start = (base?: Theme) => setDraft(base && !base.fixed ? { id: base.id, name: base.name, mode: base.mode, colors: { ...base.colors } }
    : { name: 'Новая тема', mode: 'light', colors: generateTheme('#7C5CFF', 'light') })
  const save = async () => {
    if (!draft) return
    try {
      if (draft.id) await api(`/api/admin/themes/${draft.id}`, { method: 'PUT', json: draft })
      else await api('/api/admin/themes', { method: 'POST', json: draft })
      setDraft(null); await load(); await loadThemes(); toast({ title: 'Тема сохранена', body: 'Она уже доступна клиентам в профиле' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const setDefault = async (id: string) => { await api('/api/admin/themes-default', { method: 'PUT', json: { id } }); await load(); toast({ title: 'Тема по умолчанию изменена', body: 'Новые клиенты увидят её сразу' }) }
  const remove = async (id: string) => { try { await api(`/api/admin/themes/${id}`, { method: 'DELETE' }); await load(); await loadThemes() } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } }

  const ratio = draft ? contrastRatio(draft.colors.primary, draft.colors.primaryInk) : 0
  return (
    <div>
      <Head title="Темы оформления" crumbs={[{ label: 'Темы' }]} sub="Цвета всего приложения, логотипа и маскотов берутся из темы. Фиксированные темы лежат в config_data/themes.json, свои — создаются здесь."
        right={<button className="btn btn-primary btn-sm" onClick={() => start()}><Plus size={16} /> Новая тема</button>} />
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {data?.themes.map((t) => (
          <div key={t.id} className="panel stack" style={{ gap: 10 }}>
            <Mini c={t.colors} />
            <div className="between"><b>{t.name}</b><span className="badge b-soft">{t.mode === 'dark' ? 'тёмная' : 'светлая'}</span></div>
            <div className="row wrap" style={{ gap: 6 }}>
              {data.default === t.id ? <span className="badge b-ok"><Check size={12} /> по умолчанию</span> : <button className="chip" onClick={() => setDefault(t.id)}>Сделать основной</button>}
              <button className="chip" onClick={() => chooseTheme(t.id)}>Примерить</button>
              {!t.fixed && <button className="chip" onClick={() => start(t)}>Изменить</button>}
              {!t.fixed && <button className="chip" onClick={() => remove(t.id)} aria-label="Удалить"><Trash2 size={14} /></button>}
              {t.fixed && <span className="badge b-soft">из конфига</span>}
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <div className="panels">
          <div className="panel span-7 stack">
            <div className="row wrap">
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Название темы" style={{ flex: 1, minWidth: 200 }} />
              <div className="seg" style={{ width: 220 }}>
                {(['light', 'dark'] as const).map((m) => <button key={m} className={draft.mode === m ? 'active' : ''} onClick={() => setDraft({ ...draft, mode: m, colors: generateTheme(draft.colors.primary, m) })}>{m === 'light' ? 'Светлая' : 'Тёмная'}</button>)}
              </div>
            </div>
            <div className="row">
              <input type="color" value={draft.colors.primary} onChange={(e) => setDraft({ ...draft, colors: generateTheme(e.target.value, draft.mode) })} aria-label="Основной цвет" style={{ width: 56, height: 56, border: 0, background: 'none', cursor: 'pointer' }} />
              <div><b>Основной цвет</b><div className="t-sm muted">Остальные оттенки сгенерируются автоматически</div></div>
              <span className={`badge ${ratio >= 4.5 ? 'b-ok' : ratio >= 3 ? 'b-warn' : 'b-bad'}`} style={{ marginLeft: 'auto' }}>контраст кнопки {ratio.toFixed(1)}:1</span>
            </div>
            <details>
              <summary className="t-sm" style={{ cursor: 'pointer', fontWeight: 650 }}>Точная настройка всех цветов</summary>
              <div className="grid2" style={{ marginTop: 12, gap: 8 }}>
                {(Object.keys(LABELS) as (keyof ThemeColors)[]).map((k) => (
                  <label key={k} className="row t-sm" style={{ gap: 8 }}>
                    <input type="color" value={draft.colors[k].startsWith('#') ? draft.colors[k] : '#888888'} onChange={(e) => setDraft({ ...draft, colors: { ...draft.colors, [k]: e.target.value } })} style={{ width: 30, height: 30, border: 0, background: 'none' }} />
                    <span className="grow">{LABELS[k]}</span>
                    <input className="input sm" value={draft.colors[k]} onChange={(e) => setDraft({ ...draft, colors: { ...draft.colors, [k]: e.target.value } })} style={{ width: 150 }} aria-label={LABELS[k]} />
                  </label>
                ))}
              </div>
            </details>
            <div className="row"><button className="btn btn-primary" onClick={save}>Сохранить тему</button><button className="btn btn-secondary" onClick={() => setDraft(null)}>Отмена</button></div>
          </div>
          <div className="panel span-5 center" style={{ background: 'var(--fill)' }}><Phone c={draft.colors} /></div>
        </div>
      )}
    </div>
  )
}

function Mini({ c }: { c: ThemeColors }) {
  return (
    <div style={{ height: 84, borderRadius: 16, background: `radial-gradient(80% 120% at 0% 0%, ${c.glow1}, transparent 60%), ${c.bg}`, padding: 10, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
      <div style={{ flex: 1, height: 40, borderRadius: 10, background: c.surface }} />
      <div style={{ width: 54, height: 26, borderRadius: 13, background: c.primary }} />
      <div style={{ width: 26, height: 26, borderRadius: 13, background: c.text }} />
    </div>
  )
}

function Phone({ c }: { c: ThemeColors }) {
  return (
    <div style={{ width: 250, height: 500, borderRadius: 40, padding: 10, background: '#111', boxShadow: 'var(--shadow-2)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 32, overflow: 'hidden', background: `radial-gradient(90% 60% at 0% 0%, ${c.glow1}, transparent 70%), radial-gradient(70% 50% at 100% 0%, ${c.glow2}, transparent 70%), ${c.bg}`, color: c.text, padding: 16, fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: 'var(--logo)', color: c.primary, fontSize: 20 }}>PicPac</div>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.02em' }}>Добрый день</div>
        <div style={{ height: 34, borderRadius: 17, background: c.surface, color: c.muted, fontSize: 11, display: 'flex', alignItems: 'center', padding: '0 12px' }}>Что напечатаем?</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1 }}>
          <div style={{ gridRow: 'span 2', borderRadius: 16, background: c.surface, padding: 8, fontSize: 11, fontWeight: 700 }}>Фотокниги</div>
          <div style={{ borderRadius: 16, background: c.surface, padding: 8, fontSize: 11, fontWeight: 700 }}>Печать</div>
          <div style={{ borderRadius: 16, background: c.surface2, padding: 8, fontSize: 11, fontWeight: 700 }}>Кружки</div>
          <div style={{ gridColumn: 'span 2', borderRadius: 16, background: c.primary, color: c.primaryInk, padding: 8, fontSize: 11, fontWeight: 700 }}>Скинемся на альбом</div>
        </div>
        <div style={{ height: 40, borderRadius: 20, background: c.primary, color: c.primaryInk, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>Начать</div>
      </div>
    </div>
  )
}
