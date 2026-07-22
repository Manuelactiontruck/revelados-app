import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { enviarPush } from '../lib/push'
import { CATEGORIAS, ORDEN_CATEGORIAS } from '../lib/categorias'

const MODOS = [
  { id: 'adivinar', label: '🧠 Adivinar', desc: 'Respondes en secreto, tu pareja intenta adivinarlo.' },
  { id: 'match', label: '🤝 Match', desc: 'Los dos elegís por separado. Si coincidís, ganáis.' },
  { id: 'reto', label: '🌶️ Reto', desc: 'Un reto directo para que tu pareja lo cumpla ya.' },
]

export default function Duelo({ yo, pareja, pendientes, recargarPendientes }) {
  const [vista, setVista] = useState('menu')
  const [categoriaSel, setCategoriaSel] = useState(null)
  const [modoSel, setModoSel] = useState(null)
  const [progreso, setProgreso] = useState({})
  const [activo, setActivo] = useState(null)
  const [resultado, setResultado] = useState(null)

  const cargarProgreso = useCallback(async () => {
    const { data } = await supabase.from('progreso_quesitos').select('*')
    const map = {}
    ;(data || []).forEach((p) => (map[p.categoria] = p.contador))
    setProgreso(map)
  }, [])

  useEffect(() => {
    cargarProgreso()
    const canal = supabase
      .channel('progreso-duelo-canal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progreso_quesitos' }, cargarProgreso)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargarProgreso])

  function irAMenu() {
    setVista('menu')
    setCategoriaSel(null)
    setModoSel(null)
    setActivo(null)
    setResultado(null)
    recargarPendientes()
    cargarProgreso()
  }

  if (vista === 'resultado' && resultado) {
    return <ResultadoVista resultado={resultado} onVolver={irAMenu} />
  }

  if (vista === 'accion' && activo) {
    return (
      <AccionDuelo
        duelo={activo}
        yo={yo}
        pareja={pareja}
        onResultado={(r) => {
          setResultado(r)
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
        <h3 className="titulo-centro">Duelos esperando algo tuyo</h3>
        {pendientes.map((d) => {
          const cat = CATEGORIAS[d.categoria]
          return (
            <div
              key={d.id}
              className="opcion-card"
              onClick={() => {
                setActivo(d)
                setVista('accion')
              }}
            >
              {cat.icono} {cat.nombre} —{' '}
              {d.accion === 'confirmar' ? 'confirmar si acertó tu pareja' : 'responder'}
            </div>
          )
        })}
      </div>
    )
  }

  if (vista === 'modo' && categoriaSel) {
    return (
      <div>
        <button className="link-btn" onClick={irAMenu}>
          ← Volver a categorías
        </button>
        <h3 style={{ color: categoriaSel.color }}>
          {categoriaSel.icono} {categoriaSel.nombre}
        </h3>
        <p className="paso-titulo">¿Qué tipo de duelo lanzas?</p>
        {MODOS.map((m) => (
          <div
            key={m.id}
            className="opcion-card"
            onClick={() => {
              setModoSel(m.id)
              setVista('lanzar')
            }}
          >
            <b>{m.label}</b>
            <br />
            <small className="ayuda-texto">{m.desc}</small>
          </div>
        ))}
      </div>
    )
  }

  if (vista === 'lanzar' && categoriaSel && modoSel) {
    return (
      <LanzarDuelo
        categoria={categoriaSel}
        modo={modoSel}
        yo={yo}
        pareja={pareja}
        onEnviado={irAMenu}
        onVolver={() => setVista('modo')}
      />
    )
  }

  return (
    <div>
      {pendientes.length > 0 && (
        <button className="aviso-pendiente" onClick={() => setVista('pendientes')}>
          🔥 Tienes {pendientes.length} duelo{pendientes.length > 1 ? 's' : ''} esperando algo tuyo →
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
                setVista('modo')
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

function LanzarDuelo({ categoria, modo, yo, pareja, onEnviado, onVolver }) {
  const [pregunta, setPregunta] = useState(null)
  const [premio, setPremio] = useState(null)
  const [respuesta, setRespuesta] = useState(null)
  const [textoLibre, setTextoLibre] = useState('')
  const [enviando, setEnviando] = useState(false)

  const necesitaPremio = modo === 'adivinar'

  useEffect(() => {
    supabase
      .from('preguntas')
      .select('*')
      .eq('categoria', categoria.id)
      .eq('modo', modo)
      .then(({ data }) => {
        const lista = data || []
        setPregunta(lista[Math.floor(Math.random() * lista.length)])
      })
  }, [categoria.id, modo])

  const listoParaEnviar =
    pregunta &&
    (!necesitaPremio || premio) &&
    (modo === 'reto' || (modo === 'adivinar' ? textoLibre.trim().length > 0 : !!respuesta))

  async function lanzar() {
    setEnviando(true)
    const p_respuesta = modo === 'adivinar' ? textoLibre.trim() : modo === 'match' ? respuesta : null
    const { data: duelo_id, error } = await supabase.rpc('revelados_lanzar_duelo', {
      p_categoria: categoria.id,
      p_modo: modo,
      p_jugador_id: yo.id,
      p_pregunta_id: pregunta.id,
      p_respuesta,
      p_premio: necesitaPremio ? premio : null,
    })
    if (error) {
      alert('Error al lanzar: ' + error.message)
      setEnviando(false)
      return
    }
    const mensajes = {
      adivinar: `${yo.nombre} te ha lanzado un duelo de "Adivinar" en ${categoria.nombre}`,
      match: `${yo.nombre} te ha lanzado un duelo de "Match" en ${categoria.nombre}`,
      reto: `${yo.nombre} te ha lanzado un Reto en ${categoria.nombre}`,
    }
    await enviarPush({ para_quien_id: pareja.id, titulo: 'REVELADOS 🎲', cuerpo: mensajes[modo], url: '/?tab=duelo' })
    setEnviando(false)
    onEnviado(duelo_id)
  }

  if (!pregunta) return <p className="ayuda-texto">Cargando…</p>

  return (
    <div className="tarjeta-categoria" style={{ borderColor: categoria.color }}>
      <button className="link-btn" onClick={onVolver}>
        ← Cambiar modo
      </button>
      <h3 style={{ color: categoria.color }}>
        {categoria.icono} {categoria.nombre}
      </h3>

      {necesitaPremio && !premio && (
        <>
          <p className="paso-titulo">1. Elige tu premio si ganas tú:</p>
          {categoria.apuestas.map((ap) => (
            <div key={ap} className="opcion-card" onClick={() => setPremio(ap)}>
              {ap}
            </div>
          ))}
        </>
      )}

      {(!necesitaPremio || premio) && (
        <>
          <p className="paso-titulo">{pregunta.texto}</p>

          {modo === 'adivinar' && (
            <>
              <p className="ayuda-texto">Escribe tu respuesta real y sincera (se mantiene en secreto):</p>
              <textarea
                className="pin-input"
                style={{ width: '100%', minHeight: '70px', letterSpacing: 'normal', fontSize: '14px', textAlign: 'left' }}
                value={textoLibre}
                onChange={(e) => setTextoLibre(e.target.value)}
                placeholder="Tu respuesta secreta…"
              />
            </>
          )}

          {modo === 'match' && (
            <>
              {pregunta.opciones.map((op) => (
                <div
                  key={op}
                  className="opcion-card"
                  style={{ background: respuesta === op ? '#f43f5e' : undefined }}
                  onClick={() => setRespuesta(op)}
                >
                  {op}
                </div>
              ))}
            </>
          )}

          {modo === 'reto' && <p className="ayuda-texto">Se enviará tal cual a {pareja.nombre}.</p>}
        </>
      )}

      {listoParaEnviar && (
        <button className="btn-lanzar" disabled={enviando} onClick={lanzar}>
          {enviando ? 'Enviando…' : `⚔️ LANZAR A ${pareja.nombre.toUpperCase()}`}
        </button>
      )}
    </div>
  )
}

function AccionDuelo({ duelo, yo, pareja, onResultado, onVolver }) {
  const cat = CATEGORIAS[duelo.categoria]
  const [premio, setPremio] = useState(null)
  const [respuesta, setRespuesta] = useState(null)
  const [textoLibre, setTextoLibre] = useState('')
  const [enviando, setEnviando] = useState(false)

  const necesitaPremio = duelo.modo === 'adivinar'

  async function enviarResultadoPush(titulo, cuerpo) {
    await enviarPush({ para_quien_id: pareja.id, titulo, cuerpo, url: '/?tab=duelo' })
  }

  async function responder() {
    setEnviando(true)
    const p_respuesta = duelo.modo === 'adivinar' ? textoLibre.trim() : duelo.modo === 'match' ? respuesta : null
    const { data, error } = await supabase.rpc('revelados_responder_duelo', {
      p_duelo_id: duelo.id,
      p_jugador_id: yo.id,
      p_respuesta,
      p_premio: necesitaPremio ? premio : null,
    })
    if (error) {
      alert('Error: ' + error.message)
      setEnviando(false)
      return
    }
    setEnviando(false)

    if (data.resultado === 'esperando_confirmacion') {
      await enviarResultadoPush('🤔 Tu pareja ya respondió', `${yo.nombre} adivinó en ${cat.nombre}. Entra a confirmar si acertó.`)
      onResultado({ tipo: 'esperando_confirmacion', categoria: cat })
      return
    }
    if (data.resultado === 'match') {
      await enviarResultadoPush('🎯 ¡Match!', `${yo.nombre} y tú coincidisteis en ${cat.nombre}: ${data.opcion}`)
      onResultado({ tipo: 'match', categoria: cat, opcion: data.opcion, ...data })
      return
    }
    if (data.resultado === 'no_match') {
      await enviarResultadoPush('😅 No hubo match', `${yo.nombre} respondió en ${cat.nombre}, pero no coincidisteis.`)
      onResultado({ tipo: 'no_match', categoria: cat, respuesta_a: data.respuesta_a, respuesta_b: data.respuesta_b })
      return
    }
    if (data.resultado === 'completado') {
      await enviarResultadoPush('✅ Reto cumplido', `${yo.nombre} ha cumplido el reto de ${cat.nombre}`)
      onResultado({ tipo: 'reto_completado', categoria: cat, ...data })
      return
    }
  }

  async function confirmar(acierto) {
    setEnviando(true)
    const { data, error } = await supabase.rpc('revelados_confirmar_adivinanza', {
      p_duelo_id: duelo.id,
      p_jugador_id: yo.id,
      p_acierto: acierto,
    })
    setEnviando(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    await enviarResultadoPush(
      acierto ? '🏆 ¡Acertaste!' : '😏 Esta vez no',
      acierto
        ? `Acertaste en ${cat.nombre}. Premio: ${data.premio_ganador}`
        : `No acertaste en ${cat.nombre}. Premio para ${yo.nombre}: ${data.premio_ganador}`
    )
    onResultado({ tipo: acierto ? 'acierto' : 'fallo', categoria: cat, ...data, gano: acierto ? pareja.id === data.ganador_id : yo.id === data.ganador_id })
  }

  if (duelo.accion === 'confirmar') {
    return (
      <div className="tarjeta-categoria" style={{ borderColor: cat.color }}>
        <button className="link-btn" onClick={onVolver}>
          ← Volver
        </button>
        <h3 style={{ color: cat.color }}>
          {cat.icono} {cat.nombre}
        </h3>
        <p className="paso-titulo">{duelo.preguntas.texto}</p>
        <p className="ayuda-texto">Tu respuesta real:</p>
        <p className="pregunta-texto">{duelo.respuesta_a}</p>
        <p className="ayuda-texto">Lo que adivinó {pareja.nombre}:</p>
        <p className="pregunta-texto">{duelo.respuesta_b}</p>
        <p className="paso-titulo">¿Acertó?</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-lanzar" disabled={enviando} onClick={() => confirmar(true)}>
            ✅ Sí, acertó
          </button>
          <button className="btn-secundario" disabled={enviando} onClick={() => confirmar(false)}>
            ❌ No acertó
          </button>
        </div>
      </div>
    )
  }

  // accion === 'responder'
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

      {(!necesitaPremio || premio) && (
        <>
          <p className="paso-titulo">{duelo.preguntas.texto}</p>

          {duelo.modo === 'adivinar' && (
            <>
              <p className="ayuda-texto">Intenta adivinar qué respondió {pareja.nombre}:</p>
              <textarea
                className="pin-input"
                style={{ width: '100%', minHeight: '70px', letterSpacing: 'normal', fontSize: '14px', textAlign: 'left' }}
                value={textoLibre}
                onChange={(e) => setTextoLibre(e.target.value)}
                placeholder="Tu intento…"
              />
              {textoLibre.trim().length > 0 && (
                <button className="btn-lanzar" disabled={enviando} onClick={responder}>
                  {enviando ? 'Enviando…' : 'Confirmar mi respuesta'}
                </button>
              )}
            </>
          )}

          {duelo.modo === 'match' && (
            <>
              {duelo.preguntas.opciones.map((op) => (
                <div key={op} className="opcion-card" onClick={() => setRespuesta(op)}>
                  {op}
                </div>
              ))}
              {respuesta && (
                <button className="btn-lanzar" disabled={enviando} onClick={responder}>
                  {enviando ? 'Enviando…' : `Elegir "${respuesta}"`}
                </button>
              )}
            </>
          )}

          {duelo.modo === 'reto' && (
            <button className="btn-lanzar" disabled={enviando} onClick={responder}>
              {enviando ? 'Enviando…' : '✅ Hecho'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ResultadoVista({ resultado, onVolver }) {
  const { tipo, categoria } = resultado

  const contenido = {
    esperando_confirmacion: (
      <>
        <p className="resultado-emoji">🤔</p>
        <h2 style={{ color: categoria.color }}>Respuesta enviada</h2>
        <p>Tu pareja tiene que confirmar si acertaste.</p>
      </>
    ),
    match: (
      <>
        <p className="resultado-emoji">🎯</p>
        <h2 style={{ color: categoria.color }}>¡MATCH!</h2>
        <p>Los dos elegisteis: {resultado.opcion}</p>
        {resultado.quesito_completo && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
        {resultado.legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO! Roscón completo.</p>}
      </>
    ),
    no_match: (
      <>
        <p className="resultado-emoji">😅</p>
        <h2 style={{ color: categoria.color }}>No hubo match</h2>
        <p>Tú: {resultado.respuesta_b}</p>
        <p>Tu pareja: {resultado.respuesta_a}</p>
      </>
    ),
    reto_completado: (
      <>
        <p className="resultado-emoji">✅</p>
        <h2 style={{ color: categoria.color }}>¡Reto cumplido!</h2>
        {resultado.quesito_completo && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
        {resultado.legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO! Roscón completo.</p>}
      </>
    ),
    acierto: (
      <>
        <p className="resultado-emoji">🎯</p>
        <h2 style={{ color: categoria.color }}>¡Acertó!</h2>
        <p className="premio-texto">Premio: {resultado.premio_ganador}</p>
        {resultado.quesito_completo && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
        {resultado.legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO! Roscón completo.</p>}
      </>
    ),
    fallo: (
      <>
        <p className="resultado-emoji">😏</p>
        <h2 style={{ color: categoria.color }}>No acertó esta vez</h2>
        <p className="premio-texto">Premio: {resultado.premio_ganador}</p>
      </>
    ),
  }

  return (
    <div className="pantalla-centro">
      {contenido[tipo]}
      <button className="btn-primario" onClick={onVolver}>
        Volver
      </button>
    </div>
  )
}
