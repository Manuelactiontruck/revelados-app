import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function usePendientes(perfilId) {
  const [pendientes, setPendientes] = useState([])

  const cargar = useCallback(async () => {
    if (!perfilId) return
    const [{ data: porResponder }, { data: porConfirmar }] = await Promise.all([
      supabase
        .from('duelos')
        .select('*, preguntas(*)')
        .eq('jugador_b_id', perfilId)
        .eq('estado', 'pendiente_receptor')
        .order('created_at', { ascending: true }),
      supabase
        .from('duelos')
        .select('*, preguntas(*)')
        .eq('jugador_a_id', perfilId)
        .eq('estado', 'pendiente_confirmacion')
        .order('created_at', { ascending: true }),
    ])
    const lista = [
      ...(porResponder || []).map((d) => ({ ...d, accion: 'responder' })),
      ...(porConfirmar || []).map((d) => ({ ...d, accion: 'confirmar' })),
    ]
    setPendientes(lista)
  }, [perfilId])

  useEffect(() => {
    if (!perfilId) return
    cargar()
    const canal = supabase
      .channel('duelos-pendientes-' + perfilId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duelos' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [perfilId, cargar])

  return { pendientes, recargar: cargar }
}
