import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CreditCard, Lock, Minus, Plus, Tag, Users } from 'lucide-react'
import { api, ApiError, media, money, track, uuid, type Order, type Project, type Quote } from '../api'
import { Say } from '../components/Mascots'
import { TopBar, useDebounced } from '../components/ui'
import { Mockup } from '../components/Mockup'
import { errorText, useApp } from '../store'

interface Delivery { id: string; label: string; price_minor: number; days: number; free_from_minor: number }

export default function Checkout() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast, online } = useApp()
  const [project, setProject] = useState<Project | null>(null)
  const [delivery, setDelivery] = useState<Delivery[]>([])
  const [qty, setQty] = useState(1)
  const [method, setMethod] = useState('pickup')
  const [address, setAddress] = useState(() => { try { return localStorage.getItem('picpac.addr') || '' } catch { return '' } })
  const [promoInput, setPromoInput] = useState('')
  const [promo, setPromo] = useState<string | null>(null)
  const [pay, setPay] = useState('test_card')
  const [q, setQ] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const key = useMemo(() => {
    // Ключ идемпотентности живёт, пока заказ не создан: повторы и перезагрузки не создают дубль
    const k = `idem:${id}`
    try { const v = sessionStorage.getItem(k); if (v) return v; const n = uuid(); sessionStorage.setItem(k, n); return n } catch { return uuid() }
  }, [id])

  useEffect(() => {
    api<Project>(`/api/projects/${id}`).then(setProject).catch((e) => setError(errorText(e)))
    api<{ delivery: Delivery[] }>('/api/catalog').then((r) => setDelivery(r.delivery)).catch(() => {})
    track('checkout_started')
  }, [id])

  const pages = project?.layout.pages.length || 0
  const photos = new Set(project?.layout.pages.flatMap((p) => p.slots.map((s) => s.photo_id)).filter(Boolean)).size
  const dk = useDebounced(JSON.stringify({ qty, method, promo, pages }), 200)
  useEffect(() => {
    if (!project) return
    api<Quote>('/api/quote', { method: 'POST', json: { product_id: project.product_id, options: project.options, pages, photos, quantity: qty, delivery_method: method, promo_code: promo } })
      .then((r) => { setQ(r); if (promo && r.promo_error) { toast({ title: r.promo_error, kind: 'bad' }); setPromo(null) } })
      .catch((e) => setError(errorText(e)))
  }, [dk, project])

  const members = 1 + (project?.members?.length || 0)
  const needAddress = method !== 'pickup'

  const submit = async () => {
    setError('')
    if (needAddress && address.trim().length < 5) { setError('Укажите адрес доставки'); return }
    setBusy(true)
    try {
      try { localStorage.setItem('picpac.addr', address) } catch { /* noop */ }
      const o = await api<Order>('/api/orders', { method: 'POST', idem: key, json: {
        project_id: id, quantity: qty, delivery_method: method, delivery_address: address, promo_code: promo, accept_warnings: true, payment_method: pay } })
      try { sessionStorage.removeItem(`idem:${id}`) } catch { /* noop */ }
      track('order_created', { total: o.total_minor })
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch { /* noop */ }
      nav(`/orders/${o.id}?new=1`, { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_ordered' && e.details.order_id) { nav(`/orders/${e.details.order_id}`, { replace: true }); return }
      if (e instanceof ApiError && e.status === 0) setError('Нет сети. Нажмите ещё раз, когда связь появится — повторный запрос не создаст второй заказ.')
      else setError(errorText(e))
    } finally { setBusy(false) }
  }

  if (!project) return <div className="screen"><TopBar back title="Оформление" /><div className="content">{error ? <div className="card b-bad">{error}</div> : <div className="skeleton" style={{ height: 200 }} />}</div></div>

  return (
    <div className="screen">
      <TopBar back={`/check/${id}`} title="Оформление" />
      <main className="content no-dock stack" style={{ gap: 18 }}>
        <div className="card row" style={{ gap: 16 }}>
          {project.cover_photo_id ? <Mockup kind={project.product.mockup} src={media(`/api/media/${project.cover_photo_id}?size=thumb`)} size={86} /> : <span style={{ width: 70, height: 70, borderRadius: 16, background: 'var(--fill)' }} />}
          <div className="grow">
            <div className="t-h3">{project.title}</div>
            <div className="t-sm muted">{project.product.title} · {project.product.specs.sizes.find((s) => s.id === project.options.size)?.label}</div>
            <div className="t-sm muted">{project.product.kind === 'prints' ? `${photos} отпечатков` : `${pages} стр. · ${photos} фото`}</div>
          </div>
          <div className="row" style={{ gap: 6 }} aria-label="Количество">
            <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Меньше"><Minus size={16} /></button>
            <b className="num" style={{ minWidth: 18, textAlign: 'center' }}>{qty}</b>
            <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setQty(Math.min(50, qty + 1))} aria-label="Больше"><Plus size={16} /></button>
          </div>
        </div>

        <section className="stack" style={{ gap: 10 }}>
          <div className="t-h2">Получение</div>
          <div className="options" role="radiogroup">
            {delivery.map((d) => (
              <button key={d.id} role="radio" aria-checked={method === d.id} className={`option ${method === d.id ? 'active' : ''}`} onClick={() => setMethod(d.id)}>
                <span className="radio" />
                <span className="grow"><b>{d.label}</b><div className="t-sm muted">{d.days ? `${d.days} ${d.days === 1 ? 'день' : 'дня'}` : 'сегодня после производства'}{d.free_from_minor ? ` · бесплатно от ${money(d.free_from_minor)}` : ''}</div></span>
                <b className="num">{d.price_minor ? money(d.price_minor) : 'бесплатно'}</b>
              </button>
            ))}
          </div>
          {needAddress && <div className="field"><label htmlFor="addr">Адрес доставки</label><input id="addr" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Город, улица, дом, квартира" autoComplete="street-address" /></div>}
        </section>

        <section className="stack" style={{ gap: 10 }}>
          <div className="t-h2">Промокод</div>
          {promo && q?.promo ? (
            <div className="card row" style={{ background: 'var(--primary-soft)', boxShadow: 'none' }}><Tag size={18} color="var(--primary)" /><span className="grow"><b>{q.promo.code}</b> · {q.promo.description}</span><button className="link t-sm" onClick={() => setPromo(null)}>Убрать</button></div>
          ) : (
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (promoInput.trim()) setPromo(promoInput.trim().toUpperCase()) }}>
              <input className="input grow" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Например, PICPAC10" aria-label="Промокод" />
              <button className="btn btn-secondary">Применить</button>
            </form>
          )}
        </section>

        <section className="stack" style={{ gap: 10 }}>
          <div className="t-h2">Оплата</div>
          <div className="seg">
            <button className={pay === 'test_card' ? 'active' : ''} onClick={() => setPay('test_card')}><CreditCard size={15} /> Тест-карта</button>
            <button className={pay === 'test_erip' ? 'active' : ''} onClick={() => setPay('test_erip')}>ЕРИП (тест)</button>
          </div>
          <div className="t-sm muted row" style={{ gap: 6 }}><Lock size={14} /> Демо-режим: деньги не списываются</div>
        </section>

        {q && (
          <section className="card">
            {q.lines.map((l, i) => <div key={i} className="price-line"><span className="muted">{l.label}</span><span className="num">{money(l.amount_minor)}</span></div>)}
            {q.discount_minor > 0 && <div className="price-line" style={{ color: 'var(--primary-strong)' }}><span>Скидка</span><span className="num">−{money(q.discount_minor)}</span></div>}
            <div className="price-line"><span className="muted">Доставка</span><span className="num">{q.delivery_minor ? money(q.delivery_minor) : 'бесплатно'}</span></div>
            <div className="divider" style={{ margin: '8px 0 0' }} />
            <div className="price-total"><span>Итого</span><span className="num">{money(q.total_minor)}</span></div>
            {members > 1 && <div className="row t-sm" style={{ marginTop: 8, color: 'var(--text-2)' }}><Users size={15} /> Если разделить на {members}: по {money(Math.ceil(q.total_minor / members))}</div>}
            <div className="t-sm muted" style={{ marginTop: 6 }}>Производство {q.production_days} д. + доставка {q.delivery_days} д.</div>
          </section>
        )}
        {error && <div className="card" role="alert" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)', boxShadow: 'none' }}>{error}</div>}
        <Say who="robot">Перед печатью модератор ещё раз посмотрит макет. Статусы буду присылать сюда и пушем.</Say>
      </main>
      <div className="bottom-cta">
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !q} onClick={submit}>
          {busy ? 'Оформляем…' : !online ? 'Нет сети — повторить' : `Заказать${q ? ` · ${money(q.total_minor)}` : ''}`}
        </button>
      </div>
    </div>
  )
}
