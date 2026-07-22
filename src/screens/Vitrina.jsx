import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { CATEGORIAS } from '../lib/categorias'

export default function Vitrina() {
  const [logros, setLogros] = useState([])
  const [nombres, setNombres] = useState({})

  const cargar = useCallback(async () => {
    const [{ data: logrosData }, { data: perfilesData }] = await Promise.all([
      supabase.from('logros').select('*').order('created_at', { ascending: false }),
      supabase.from('perfiles_public').select('*'),
    ])
    setLogros(logrosData || [])
    const mapa = {}
    ;(perfilesData || []).forEach((p) => (mapa[p.id] = p.nombre))
    setNombres(mapa)
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

  function LogroCard({ l, origen }) {
    const cat = l.categoria ? CATEGORIAS[l.categoria] : null
    const fecha = new Date(l.created_at).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    return (
      <div className="logro-card" style={{ borderLeftColor: cat ? cat.color : '#facc15' }}>
        <div>
          <div className="logro-titulo">
            {l.tipo === 'legendario' ? '👑' : l.tipo === 'partida_ganada' ? '🏆' : '🥇'} {l.titulo}
            <span className={origen === 'partida' ? 'badge-origen badge-origen-partida' : 'badge-origen badge-origen-duelo'}>
              {origen === 'partida' ? 'PARTIDA' : 'DUELO RÁPIDO'}
            </span>
          </div>
          {l.jugador_id && nombres[l.jugador_id] && (
            <small className="ayuda-texto">Premio para: {nombres[l.jugador_id]}</small>
          )}
          <br />
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
  }

  const logrosPartida = logros.filter((l) => l.tipo === 'partida_quesito' || l.tipo === 'partida_ganada')
  const logrosDuelo = logros.filter((l) => l.tipo === 'quesito' || l.tipo === 'legendario')

  return (
    <div>
      <h3 className="titulo-centro">🏆 Historial de Logros Desbloqueados</h3>
      {logros.length === 0 && <p className="ayuda-texto centro">Todavía no hay logros. ¡Lanzad vuestro primer duelo!</p>}

      {logrosPartida.length > 0 && (
        <>
          <div className="seccion-vitrina">🏆 Premios de Partida completa</div>
          {logrosPartida.map((l) => (
            <LogroCard key={l.id} l={l} origen="partida" />
          ))}
        </>
      )}

      {logrosDuelo.length > 0 && (
        <>
          <div className="seccion-vitrina">🎲 Premios de Duelo rápido</div>
          {logrosDuelo.map((l) => (
            <LogroCard key={l.id} l={l} origen="duelo" />
          ))}
        </>
      )}
    </div>
  )
}
