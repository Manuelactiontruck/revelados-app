import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { enviarPush } from '../lib/push'
import { CATEGORIAS, ORDEN_CATEGORIAS } from '../lib/categorias'

export default function Duelo({ yo, pareja }) {
  const [vista, setVista] = useState('menu') // menu | categoria | pendientes | resultado
  const [categoriaSel, setCategoriaSel] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [progreso, setProgreso] = useState({})
  const [resultadoRonda, setResultadoRonda] = useState(null)

  const cargarPendientes = useCallback(async () => {
    const { data } = await supabase
      .from('rondas')
      .select('*, preguntas(*)')
      .eq('receptor_id', yo.id)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true })
    setPendientes(data || [])
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rondas' }, () => {
        cargarPendientes()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progreso_quesitos' }, () => {
        cargarProgreso()
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargarPendientes, cargarProgreso])

  if (vista === 'pendientes') {
    return (
      <PendientesVista
        pendientes={pendientes}
        yo={yo}
        pareja={pareja}
        onResultado={(r) => {
          setResultadoRonda(r)
          setVista('resultado')
        }}
        onVolver={() => setVista('menu')}
      />
    )
  }

  if (vista === 'resultado' && resultadoRonda) {
    return (
      <ResultadoVista
        resultado={resultadoRonda}
        onVolver={() => {
          setResultadoRonda(null)
          setVista('menu')
        }}
      />
    )
  }

  if (vista === 'categoria' && categoriaSel) {
    return (
      <LanzarDuelo
        categoria={categoriaSel}
        yo={yo}
        pareja={pareja}
        onVolver={() => {
          setCategoriaSel(null)
          setVista('menu')
        }}
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

function LanzarDuelo({ categoria, yo, pareja, onVolver }) {
  const [preguntas, setPreguntas] = useState([])
  const [pregunta, setPregunta] = useState(null)
  const [respuesta, setRespuesta] = useState(null)
  const [premio, setPremio] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    supabase
      .from('preguntas')
      .select('*')
      .eq('categoria', categoria.id)
      .then(({ data }) => {
        const barajadas = (data || []).sort(() => Math.random() - 0.5).slice(0, 3)
        setPreguntas(barajadas)
      })
  }, [categoria.id])

  async function lanzar() {
    setEnviando(true)
    await supabase.from('rondas').insert({
      categoria: categoria.id,
      pregunta_id: pregunta.id,
      premio_elegido: premio,
      iniciador_id: yo.id,
      receptor_id: pareja.id,
      respuesta_iniciador: respuesta,
      estado: 'pendiente',
    })
    await enviarPush({
      para_quien_id: pareja.id,
      titulo: 'REVELADOS 🎲',
      cuerpo: `${yo.nombre} te ha lanzado un Duelo de "${categoria.nombre}"`,
      url: '/',
    })
    setEnviando(false)
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="pantalla-centro">
        <p className="resultado-emoji">🎲</p>
        <p>Duelo enviado a {pareja.nombre}.</p>
        <p className="ayuda-texto">Te avisaremos cuando responda.</p>
        <button className="btn-primario" onClick={onVolver}>
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="tarjeta-categoria" style={{ borderColor: categoria.color }}>
      <button className="link-btn" onClick={onVolver}>
        ← Volver a categorías
      </button>
      <h3 style={{ color: categoria.color }}>
        {categoria.icono} {categoria.nombre}
      </h3>

      {!pregunta && (
        <>
          <p className="paso-titulo">1. Elige una pregunta:</p>
          {preguntas.map((p) => (
            <div key={p.id} className="opcion-card" onClick={() => setPregunta(p)}>
              {p.texto}
            </div>
          ))}
        </>
      )}

      {pregunta && !respuesta && (
        <>
          <p className="paso-titulo">2. Responde en secreto:</p>
          <p className="pregunta-texto">{pregunta.texto}</p>
          {pregunta.opciones.map((op) => (
            <div key={op} className="opcion-card" onClick={() => setRespuesta(op)}>
              {op}
            </div>
          ))}
        </>
      )}

      {pregunta && respuesta && !premio && (
        <>
          <p className="paso-titulo">3. ¿Qué se juega el ganador?</p>
          {categoria.apuestas.map((ap) => (
            <div key={ap} className="opcion-card" onClick={() => setPremio(ap)}>
              {ap}
            </div>
          ))}
        </>
      )}

      {pregunta && respuesta && premio && (
        <button className="btn-lanzar" disabled={enviando} onClick={lanzar}>
          {enviando ? 'Enviando…' : `⚔️ LANZAR DUELO A ${pareja.nombre.toUpperCase()}`}
        </button>
      )}
    </div>
  )
}

function PendientesVista({ pendientes, yo, pareja, onResultado, onVolver }) {
  const [activa, setActiva] = useState(null)

  if (activa) {
    return (
      <ResponderRonda
        ronda={activa}
        yo={yo}
        pareja={pareja}
        onHecho={onResultado}
        onVolver={() => setActiva(null)}
      />
    )
  }

  return (
    <div>
      <button className="link-btn" onClick={onVolver}>
        ← Volver
      </button>
      <h3 className="titulo-centro">Duelos esperando tu respuesta</h3>
      {pendientes.map((r) => (
        <div key={r.id} className="opcion-card" onClick={() => setActiva(r)}>
          {r.categoria.toUpperCase()} — de {pareja.nombre}
        </div>
      ))}
    </div>
  )
}

function ResponderRonda({ ronda, yo, pareja, onHecho, onVolver }) {
  const [enviando, setEnviando] = useState(false)
  const cat = CATEGORIAS[ronda.categoria]

  async function responder(op) {
    setEnviando(true)
    const resultado = op === ronda.respuesta_iniciador ? 'match' : 'fallo'

    await supabase
      .from('rondas')
      .update({ respuesta_receptor: op, estado: 'completada', resultado, completed_at: new Date().toISOString() })
      .eq('id', ronda.id)

    let quesitoCompleto = false
    let nuevoContador = null
    let legendario = false

    if (resultado === 'match') {
      const { data: prog } = await supabase
        .from('progreso_quesitos')
        .select('*')
        .eq('categoria', ronda.categoria)
        .single()
      nuevoContador = Math.min(3, (prog?.contador || 0) + 1)
      await supabase
        .from('progreso_quesitos')
        .update({ contador: nuevoContador, updated_at: new Date().toISOString() })
        .eq('categoria', ronda.categoria)

      await supabase.from('logros').insert({
        titulo: `Match en ${cat.nombre}: ${ronda.premio_elegido}`,
        categoria: ronda.categoria,
        tipo: 'quesito',
        premio_texto: ronda.premio_elegido,
      })

      if (nuevoContador === 3) {
        quesitoCompleto = true
        await supabase.from('logros').insert({
          titulo: `🧀 Quesito completo: ${cat.nombre}`,
          categoria: ronda.categoria,
          tipo: 'quesito',
          premio_texto: ronda.premio_elegido,
        })

        const { data: todos } = await supabase.from('progreso_quesitos').select('*')
        const todosCompletos = (todos || []).every(
          (p) => (p.categoria === ronda.categoria ? nuevoContador : p.contador) === 3
        )
        if (todosCompletos) {
          legendario = true
          await supabase.from('logros').insert({
            titulo: '👑 LOGRO LEGENDARIO: Roscón Completo',
            categoria: null,
            tipo: 'legendario',
          })
        }
      }
    }

    await enviarPush({
      para_quien_id: ronda.iniciador_id,
      titulo: resultado === 'match' ? '🎯 ¡Match!' : '❌ No hubo match',
      cuerpo:
        resultado === 'match'
          ? `${yo.nombre} y tú habéis coincidido en ${cat.nombre}`
          : `${yo.nombre} ha respondido, pero no coincidisteis`,
      url: '/',
    })

    setEnviando(false)
    onHecho({ resultado, categoria: cat, premio: ronda.premio_elegido, quesitoCompleto, legendario, nuevoContador })
  }

  return (
    <div className="tarjeta-categoria" style={{ borderColor: cat.color }}>
      <button className="link-btn" onClick={onVolver}>
        ← Volver
      </button>
      <h3 style={{ color: cat.color }}>
        {cat.icono} {cat.nombre}
      </h3>
      <p className="ayuda-texto">{pareja.nombre} ya ha respondido en secreto. Responde a ciegas:</p>
      <p className="pregunta-texto">{ronda.preguntas.texto}</p>
      {ronda.preguntas.opciones.map((op) => (
        <div key={op} className={`opcion-card ${enviando ? 'opcion-disabled' : ''}`} onClick={() => !enviando && responder(op)}>
          {op}
        </div>
      ))}
    </div>
  )
}

function ResultadoVista({ resultado, onVolver }) {
  const { resultado: r, categoria, premio, quesitoCompleto, legendario } = resultado
  return (
    <div className="pantalla-centro">
      <p className="resultado-emoji">{r === 'match' ? '🎯' : '💔'}</p>
      <h2 style={{ color: categoria.color }}>{r === 'match' ? '¡MATCH!' : 'No hubo match'}</h2>
      {r === 'match' && (
        <>
          <p>
            Habéis coincidido en <b>{categoria.nombre}</b>.
          </p>
          <p className="premio-texto">Premio en juego: {premio}</p>
          {quesitoCompleto && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
          {legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO desbloqueado! Roscón completo.</p>}
        </>
      )}
      {r !== 'match' && <p>Pasáis turno esta vez, no suma quesito.</p>}
      <button className="btn-primario" onClick={onVolver}>
        Volver
      </button>
    </div>
  )
}
