import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { CATEGORIAS } from '../lib/categorias'

export default function Vitrina() {
  const [logros, setLogros] = useState([])

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('logros').select('*').order('created_at', { ascending: false })
    setLogros(data || [])
  }, [])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('vitrina-logros')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logros' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar])

  async function alternarCumplido(l) {
    const nuevo = !l.cumplido
    setLogros((prev) => prev.map((x) => (x.id === l.id ? { ...x, cumplido: nuevo } : x)))
    const { error } = await supabase
      .from('logros')
      .update({ cumplido: nuevo, cumplido_en: nuevo ? new Date().toISOString() : null })
      .eq('id', l.id)
    if (error) {
      alert('Error: ' + error.message)
      cargar()
    }
  }

  return (
    <div>
      <h3 className="titulo-centro">🏆 Historial de Logros Desbloqueados</h3>
      {logros.length === 0 && <p className="ayuda-texto centro">Todavía no hay logros. ¡Lanzad vuestro primer duelo!</p>}
      {logros.map((l) => {
        const cat = l.categoria ? CATEGORIAS[l.categoria] : null
        const fecha = new Date(l.created_at).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
        return (
          <div key={l.id} className="logro-card" style={{ borderLeftColor: cat ? cat.color : '#facc15' }}>
            <div>
              <div className="logro-titulo">
                {l.tipo === 'legendario' ? '👑' : l.tipo === 'partida_ganada' ? '🏆' : '🥇'} {l.titulo}
              </div>
              <small className="ayuda-texto">Ejecutado el: {fecha}</small>
              {l.cumplido && l.cumplido_en && (
                <>
                  <br />
                  <small className="ayuda-texto">
                    Cumplido el:{' '}
                    {new Date(l.cumplido_en).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </small>
                </>
              )}
            </div>
            <span
              className="badge-verificado"
              style={{
                cursor: 'pointer',
                background: l.cumplido ? undefined : '#374151',
                color: l.cumplido ? undefined : '#d1d5db',
              }}
              onClick={() => alternarCumplido(l)}
            >
              {l.cumplido ? '✅ CUMPLIDO' : '⏳ PENDIENTE'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
