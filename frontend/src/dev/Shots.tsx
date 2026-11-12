// Служебная страница (только dev): рендер изделий из 3D-моделей → data/media/product-shots (для рекламы/соцсетей; в каталоге — настоящие фото).
// Открыть /dev/shots под администратором → кнопка «Снять всё». Результат: data/media/product-shots/*.webp
import { useEffect, useState } from 'react'
import { api, type Product } from '../api'
import { PHOTO } from '../components/Mockup'
import { useDesigns } from '../components/ui'
import Product3D from '../three/Product3D'

const PICK: Record<string, string[]> = {
  mug: ['family'], postcard: ['mom'], invitation: ['woman'], envelope: ['kids'], 'calendar-wall': ['city', 'kids', 'girl'],
  'calendar-desk': ['girl', 'mom'], magnets: ['girl', 'boy', 'kids', 'family'], puzzle: ['kids'], pillow: ['baby'],
  tshirt: ['girl'], poster: ['city'], canvas: ['mom'],
}
const S = 900

async function compose(png: Blob): Promise<Blob> {
  const im = await createImageBitmap(png)
  const c = document.createElement('canvas'); c.width = c.height = S
  const x = c.getContext('2d')!
  const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#F6F3EE'); g.addColorStop(1, '#E7E1D8')
  x.fillStyle = g; x.fillRect(0, 0, S, S)
  const r = x.createRadialGradient(S * .5, S * .35, 10, S * .5, S * .4, S * .7); r.addColorStop(0, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = r; x.fillRect(0, 0, S, S)
  x.drawImage(im, 0, 0, S, S)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}

export default function Shots() {
  const [items, setItems] = useState<Product[]>([])
  const [i, setI] = useState(-1)
  const [log, setLog] = useState<string[]>([])
  const designs = useDesigns()
  useEffect(() => { api<{ items: Product[] }>('/api/catalog').then((r) => setItems(r.items.filter((p) => !PHOTO[p.id]))) }, [])
  const p = items[i]
  const done = async (b: Blob) => {
    const fd = new FormData(); fd.append('file', await compose(b), `${p.id}.png`)
    try { await api(`/api/admin/product-shots/${p.id}`, { method: 'POST', body: fd }); setLog((l) => [...l, `✓ ${p.id}`]) }
    catch (e) { setLog((l) => [...l, `✗ ${p.id}: ${e}`]) }
    setI((k) => k + 1)
  }
  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <button onClick={() => { setLog([]); setI(0) }} disabled={!items.length || (i >= 0 && i < items.length)}>Снять всё ({items.length})</button>
      <pre>{log.join('\n')}{i >= items.length && i > 0 ? '\nГотово' : ''}</pre>
      {p && (
        <div key={p.id} style={{ width: S, height: S }}>
          <Product3D product={p} options={{ size: p.specs.sizes[0]?.id, cover: p.specs.covers?.[0]?.id || '', paper: p.specs.papers?.[0]?.id || '', color: p.specs.colors?.[0]?.id || '' }}
            images={(PICK[p.id] || ['girl']).map((n) => `/samples/${n}.jpg`)} design={designs.find((d) => d.id === p.specs.template)}
            title={p.id === 'invitation' ? 'Приглашаем!' : undefined} height={S} controls={false} onShot={done} />
        </div>
      )}
    </div>
  )
}
