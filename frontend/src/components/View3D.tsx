import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { Product3DProps } from '../three/Product3D'
import { productImage } from './Mockup'

const Product3D = lazy(() => import('../three/Product3D'))

const webgl = (() => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
})()

class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  render() { return this.state.bad ? this.props.fallback : this.props.children }
}

/** 3D-модель изделия; без WebGL или пока грузится движок — обычный мокап. */
export default function View3D(props: Product3DProps & { badge?: boolean }) {
  const h = props.height ?? 340
  const fallback = (
    <div className="p3d center" style={{ height: h }}>
      <img src={productImage(props.product.id)} alt={props.product.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
  if (!webgl) return fallback
  return (
    <Guard fallback={fallback}>
      <Suspense fallback={fallback}>
        <div className="p3d-wrap" style={{ position: 'relative', height: typeof h === 'string' ? h : undefined }}>
          {props.badge !== false && <span className="p3d-badge">3D</span>}
          <Product3D {...props} />
        </div>
      </Suspense>
    </Guard>
  )
}
