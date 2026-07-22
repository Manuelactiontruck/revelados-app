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
                {l.tipo === 'legendario' ? '👑' : '🥇'} {l.titulo}
              </div>
              <small className="ayuda-texto">Ejecutado el: {fecha}</small>
            </div>
            <span className="badge-verificado">VERIFICADO</span>
          </div>
        )
      })}
    </div>
  )
}
