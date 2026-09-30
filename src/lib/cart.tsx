import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Cart } from './api'

const EMPTY: Cart = {
  items: [],
  notices: [],
  summary: { count: 0, subtotal: 0, shelves: 0, discount: 0, promo_code: '', protect_fee: 0, delivery_fee: null, total: 0, hold_hours: 24 },
}

type CartCtx = {
  cart: Cart
  loading: boolean
  promo: string
  refresh: (promo?: string) => Promise<Cart>
  add: (item_id: number, variant_id: number | null, quantity?: number) => Promise<Cart>
  update: (rowId: number, quantity: number, saved_for_later?: boolean) => Promise<Cart>
  remove: (rowId: number) => Promise<Cart>
  clear: () => Promise<Cart>
  applyPromo: (code: string) => Promise<Cart>
  recheck: () => Promise<Cart>
}

const Ctx = createContext<CartCtx | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [promo, setPromo] = useState('')

  const refresh = useCallback(async (code?: string) => {
    setLoading(true)
    try {
      const c = await api.get<Cart>('/cart', { promo: code ?? promo })
      setCart(c)
      return c
    } catch {
      return cart
    } finally {
      setLoading(false)
    }
  }, [promo])

  useEffect(() => {
    refresh()
    const h = () => refresh()
    window.addEventListener('uko:auth', h)
    return () => window.removeEventListener('uko:auth', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const add = useCallback(async (item_id: number, variant_id: number | null, quantity = 1) => {
    const c = await api.post<Cart>('/cart', { item_id, variant_id, quantity })
    setCart(c)
    return c
  }, [])
  const update = useCallback(async (rowId: number, quantity: number, saved_for_later?: boolean) => {
    const c = await api.put<Cart>(`/cart/${rowId}`, { quantity, saved_for_later })
    setCart(c)
    return c
  }, [])
  const remove = useCallback(async (rowId: number) => {
    const c = await api.del<Cart>(`/cart/${rowId}`)
    setCart(c)
    return c
  }, [])
  const clear = useCallback(async () => {
    const c = await api.del<Cart>('/cart')
    setCart(c)
    return c
  }, [])
  const applyPromo = useCallback(async (code: string) => {
    const c = await api.post<Cart>('/cart/promo', { code })
    setPromo(code.toUpperCase())
    setCart(c)
    return c
  }, [])
  const recheck = useCallback(async () => {
    const c = await api.post<Cart>(`/cart/recheck?promo=${encodeURIComponent(promo)}`)
    setCart(c)
    return c
  }, [promo])

  const value = useMemo(() => ({ cart, loading, promo, refresh, add, update, remove, clear, applyPromo, recheck }), [cart, loading, promo, refresh, add, update, remove, clear, applyPromo, recheck])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart(): CartCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCart outside CartProvider')
  return v
}
