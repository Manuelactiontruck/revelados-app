import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { CATEGORIAS, ORDEN_CATEGORIAS } from '../lib/categorias'

export default function Roscon() {
  const [progreso, setProgreso] = useState({})

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('progreso_quesitos').select('*')
    const map = {}
    ;(data || []).forEach((p) => (map[p.categoria] = p.contador))
    setProgreso(map)
  }, [])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('roscon-progreso')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progreso_quesitos' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargar])

  const completos = Object.values(progreso).filter((c) => c === 3).length

  return (
    <div>
      <h3 className="titulo-centro">Estado de vuestro Roscón de Quesitos</h3>
      {completos === 4 && <p className="premio-texto centro">👑 ¡ROSCÓN COMPLETO! Logro Legendario desbloqueado.</p>}
      <div className="grid-2x2">
        {ORDEN_CATEGORIAS.map((id) => {
          const cat = CATEGORIAS[id]
          const contador = progreso[id] ?? 0
          return (
            <div key={id} className="cat-card cat-card-roscon" style={{ borderTopColor: cat.color }}>
              <div className="cat-icono-grande">{cat.icono}</div>
              <div className="cat-nombre-chica">{cat.nombre}</div>
              <div className="cat-progreso" style={{ color: cat.color }}>
                Progreso: {contador} / 3 {contador === 3 ? '🧀 (COMPLETO)' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
