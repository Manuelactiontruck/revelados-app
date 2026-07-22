import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { enviarPush } from '../lib/push'
import { CATEGORIAS, ORDEN_CATEGORIAS } from '../lib/categorias'

export default function Duelo({ yo, pareja }) {
  const [vista, setVista] = useState('menu') // menu | categoria | pendientes | responder | resultado
  const [categoriaSel, setCategoriaSel] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [progreso, setProgreso] = useState({})
  const [rondaActiva, setRondaActiva] = useState(null)
  const [resultado, setResultado] = useState(null)

  const cargarPendientes = useCallback(async () => {
    const { data: partidas } = await supabase
      .from('partidas')
      .select('*')
      .eq('estado', 'en_curso')
      .or(`jugador_a_id.eq.${yo.id},jugador_b_id.eq.${yo.id}`)

    if (!partidas || partidas.length === 0) {
      setPendientes([])
      return
    }

    const ids = partidas.map((p) => p.id)
    const { data: rondas } = await supabase
      .from('rondas')
      .select('*, preguntas(*)')
      .in('partida_id', ids)
      .order('created_at', { ascending: false })

    const masReciente = {}
    for (const r of rondas || []) {
      if (!masReciente[r.partida_id]) masReciente[r.partida_id] = r
    }
    const partidaPorId = Object.fromEntries(partidas.map((p) => [p.id, p]))

    const pend = Object.values(masReciente)
      .map((r) => ({ ...r, partidas: partidaPorId[r.partida_id] }))
      .filter((r) => {
        const p = r.partidas
        if (p.jugador_a_id === yo.id) return r.respuesta_a === null
        if (p.jugador_b_id === yo.id) return r.respuesta_b === null
        return false
      })

    setPendientes(pend)
  }, [yo.id])

  const cargarProgreso = useCallback(async () => {
    const { data } = await supabase.from('progreso_quesitos').select('*')
    const map = {}
    ;(data || []).forEach((p) => (map[p.categoria] = p.contador))
    setProgreso(map)
  }, [])

  useEffect(() => {
    cargarPendientes()
    cargarProgreso()
    const canal = supabase
      .channel('rondas-duelo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rondas' }, cargarPendientes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidas' }, cargarPendientes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progreso_quesitos' }, cargarProgreso)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargarPendientes, cargarProgreso])

  function irAMenu() {
    setVista('menu')
    setCategoriaSel(null)
    setRondaActiva(null)
    setResultado(null)
    cargarPendientes()
    cargarProgreso()
  }

  if (vista === 'resultado' && resultado) {
    return (
      <ResultadoVista
        resultado={resultado}
        yo={yo}
        onSeguirJugando={(ronda) => {
          setRondaActiva(ronda)
          setResultado(null)
          setVista('responder')
        }}
        onVolver={irAMenu}
      />
    )
  }

  if (vista === 'responder' && rondaActiva) {
    return (
      <ResponderRonda
        ronda={rondaActiva}
        yo={yo}
        pareja={pareja}
        onResultado={(r, siguienteRonda) => {
          setResultado(r)
          setRondaActiva(siguienteRonda || null)
          setVista('resultado')
        }}
        onVolver={irAMenu}
      />
    )
  }

  if (vista === 'pendientes') {
    return (
      <div>
        <button className="link-btn" onClick={irAMenu}>
          ← Volver
        </button>
        <h3 className="titulo-centro">Duelos esperando tu respuesta</h3>
        {pendientes.map((r) => {
          const cat = CATEGORIAS[r.partidas.categoria]
          return (
            <div
              key={r.id}
              className="opcion-card"
              onClick={() => {
                setRondaActiva(r)
                setVista('responder')
              }}
            >
              {cat.icono} {cat.nombre}
            </div>
          )
        })}
      </div>
    )
  }

  if (vista === 'categoria' && categoriaSel) {
    return (
      <LanzarDuelo
        categoria={categoriaSel}
        yo={yo}
        pareja={pareja}
        onEnviado={irAMenu}
        onVolver={irAMenu}
      />
    )
  }

  return (
    <div>
      {pendientes.length > 0 && (
        <button className="aviso-pendiente" onClick={() => setVista('pendientes')}>
          🔥 Tienes {pendientes.length} duelo{pendientes.length > 1 ? 's' : ''} esperando tu respuesta →
        </button>
      )}
      <h3 className="titulo-centro">Elige la temática del Duelo de hoy:</h3>
      <div className="grid-2x2">
        {ORDEN_CATEGORIAS.map((id) => {
          const cat = CATEGORIAS[id]
          const contador = progreso[id] ?? 0
          return (
            <div
              key={id}
              className="cat-card"
              style={{ borderLeftColor: cat.color }}
              onClick={() => {
                setCategoriaSel(cat)
                setVista('categoria')
              }}
            >
              <div className="cat-icono">{cat.icono}</div>
              <div className="cat-nombre">{cat.nombre}</div>
              <div className="cat-progreso" style={{ color: cat.color }}>
                {contador}/3 {contador === 3 ? '🧀' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LanzarDuelo({ categoria, yo, pareja, onEnviado, onVolver }) {
  const [premio, setPremio] = useState(null)
  const [pregunta, setPregunta] = useState(null)
  const [respuesta, setRespuesta] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (premio && !pregunta) {
      supabase
        .from('preguntas')
        .select('*')
        .eq('categoria', categoria.id)
        .then(({ data }) => {
          const lista = data || []
          const azar = lista[Math.floor(Math.random() * lista.length)]
          setPregunta(azar)
        })
    }
  }, [premio, pregunta, categoria.id])

  async function lanzar() {
    setEnviando(true)
    const { data: partidaId, error } = await supabase.rpc('revelados_lanzar_partida', {
      p_categoria: categoria.id,
      p_jugador_id: yo.id,
      p_premio: premio,
      p_pregunta_id: pregunta.id,
      p_respuesta: respuesta,
    })
    if (error) {
      alert('Error al lanzar el duelo: ' + error.message)
      setEnviando(false)
      return
    }
    await enviarPush({
      para_quien_id: pareja.id,
      titulo: 'REVELADOS 🎲',
      cuerpo: `${yo.nombre} te ha lanzado un Duelo de "${categoria.nombre}"`,
      url: '/',
    })
    setEnviando(false)
    onEnviado(partidaId)
  }

  return (
    <div className="tarjeta-categoria" style={{ borderColor: categoria.color }}>
      <button className="link-btn" onClick={onVolver}>
        ← Volver a categorías
      </button>
      <h3 style={{ color: categoria.color }}>
        {categoria.icono} {categoria.nombre}
      </h3>

      {!premio && (
        <>
          <p className="paso-titulo">1. Elige tu premio si ganas tú:</p>
          {categoria.apuestas.map((ap) => (
            <div key={ap} className="opcion-card" onClick={() => setPremio(ap)}>
              {ap}
            </div>
          ))}
        </>
      )}

      {premio && !pregunta && <p className="ayuda-texto">Cargando pregunta…</p>}

      {premio && pregunta && !respuesta && (
        <>
          <p className="paso-titulo">2. Responde (gana quien acierte):</p>
          <p className="pregunta-texto">{pregunta.texto}</p>
          {pregunta.opciones.map((op) => (
            <div key={op} className="opcion-card" onClick={() => setRespuesta(op)}>
              {op}
            </div>
          ))}
        </>
      )}

      {premio && pregunta && respuesta && (
        <button className="btn-lanzar" disabled={enviando} onClick={lanzar}>
          {enviando ? 'Enviando…' : `⚔️ LANZAR DUELO A ${pareja.nombre.toUpperCase()}`}
        </button>
      )}
    </div>
  )
}

function ResponderRonda({ ronda, yo, pareja, onResultado, onVolver }) {
  const [respuesta, setRespuesta] = useState(null)
  const [premio, setPremio] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const cat = CATEGORIAS[ronda.partidas.categoria]
  const soyJugadorB = ronda.partidas.jugador_b_id === yo.id
  const necesitaPremio = soyJugadorB && !ronda.partidas.premio_b

  async function responder() {
    setEnviando(true)
    const { data, error } = await supabase.rpc('revelados_responder_ronda', {
      p_ronda_id: ronda.id,
      p_jugador_id: yo.id,
      p_respuesta: respuesta,
      p_premio: necesitaPremio ? premio : null,
    })

    if (error) {
      alert('Error: ' + error.message)
      setEnviando(false)
      return
    }

    if (data.resultado === 'esperando_otro') {
      setEnviando(false)
      onVolver()
      return
    }

    if (data.resultado === 'empate') {
      const { data: nuevaRonda } = await supabase
        .from('rondas')
        .select('*, preguntas(*), partidas!inner(*)')
        .eq('id', data.nueva_ronda_id)
        .single()
      await enviarPush({
        para_quien_id: pareja.id,
        titulo: '🔁 ¡Empate!',
        cuerpo: `Empate en ${cat.nombre}. Nueva pregunta de desempate esperando.`,
        url: '/',
      })
      setEnviando(false)
      onResultado({ tipo: 'empate', categoria: cat }, nuevaRonda)
      return
    }

    // resuelta
    const gano = data.ganador_id === yo.id
    await enviarPush({
      para_quien_id: pareja.id,
      titulo: gano ? '😏 Has perdido el duelo' : '🏆 ¡Has ganado el duelo!',
      cuerpo: gano
        ? `${yo.nombre} acertó en ${cat.nombre}. Premio: ${data.premio_ganador}`
        : `${yo.nombre} respondió. ¡Ganaste en ${cat.nombre}! Premio: ${data.premio_ganador}`,
      url: '/',
    })
    setEnviando(false)
    onResultado({ tipo: 'resuelta', ...data, categoria: cat, gano }, null)
  }

  return (
    <div className="tarjeta-categoria" style={{ borderColor: cat.color }}>
      <button className="link-btn" onClick={onVolver}>
        ← Volver
      </button>
      <h3 style={{ color: cat.color }}>
        {cat.icono} {cat.nombre}
      </h3>

      {necesitaPremio && !premio && (
        <>
          <p className="paso-titulo">Antes de ver la pregunta, elige tu premio si ganas tú:</p>
          {cat.apuestas.map((ap) => (
            <div key={ap} className="opcion-card" onClick={() => setPremio(ap)}>
              {ap}
            </div>
          ))}
        </>
      )}

      {(!necesitaPremio || premio) && !respuesta && (
        <>
          <p className="ayuda-texto">Misma pregunta para los dos. Gana quien acierte:</p>
          <p className="pregunta-texto">{ronda.preguntas.texto}</p>
          {ronda.preguntas.opciones.map((op) => (
            <div key={op} className="opcion-card" onClick={() => setRespuesta(op)}>
              {op}
            </div>
          ))}
        </>
      )}

      {(!necesitaPremio || premio) && respuesta && (
        <button className="btn-lanzar" disabled={enviando} onClick={responder}>
          {enviando ? 'Enviando…' : 'Confirmar respuesta'}
        </button>
      )}
    </div>
  )
}

function ResultadoVista({ resultado, yo, onSeguirJugando, onVolver }) {
  if (resultado.tipo === 'empate') {
    return (
      <div className="pantalla-centro">
        <p className="resultado-emoji">🔁</p>
        <h2 style={{ color: resultado.categoria.color }}>¡EMPATE!</h2>
        <p>Los dos acertasteis, o los dos fallasteis. Se sigue jugando hasta desempatar.</p>
        <button className="btn-primario" onClick={() => onSeguirJugando()}>
          Seguir jugando →
        </button>
      </div>
    )
  }

  const { categoria, gano, premio_ganador, quesito_completo, legendario } = resultado
  return (
    <div className="pantalla-centro">
      <p className="resultado-emoji">{gano ? '🏆' : '😏'}</p>
      <h2 style={{ color: categoria.color }}>{gano ? '¡HAS GANADO!' : 'Has perdido esta vez'}</h2>
      <p>
        Categoría: <b>{categoria.nombre}</b>
      </p>
      <p className="premio-texto">
        {gano ? 'Tu pareja debe cumplir tu premio:' : 'Debes cumplir el premio de tu pareja:'} {premio_ganador}
      </p>
      {quesito_completo && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
      {legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO desbloqueado! Roscón completo.</p>}
      <button className="btn-primario" onClick={onVolver}>
        Volver
      </button>
    </div>
  )
}
