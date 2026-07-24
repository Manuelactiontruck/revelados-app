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

  if (vista === 'accion' && activo && activo.accion === 'ver_resultado') {
    return <VerResultadoDuelo duelo={activo} yo={yo} pareja={pareja} onVolver={irAMenu} />
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

  if (vista === 'partida') {
    return <PartidaScreen yo={yo} pareja={pareja} recargarPendientes={recargarPendientes} onVolver={irAMenu} />
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
              {d.accion === 'confirmar'
                ? 'confirmar si acertó tu pareja'
                : d.accion === 'ver_resultado'
                ? 'ver el resultado'
                : 'responder'}
              {d.partida_id ? ' (Partida)' : ''}
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

      <div className="opcion-card partida-cta" onClick={() => setVista('partida')}>
        <b>🏆 Partida completa</b>
        <br />
        <small className="ayuda-texto">
          Elige premios por quesito y por ganar, y jugad hasta que alguien complete los 4 quesitos.
        </small>
      </div>

      <h3 className="titulo-centro">O lanza un duelo rápido de hoy:</h3>
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
          {modo === 'adivinar' && (
            <p className="banner-contexto">
              🔒 {yo.nombre}, esta es tu respuesta privada — {pareja.nombre} no la verá hasta intentar adivinarla:
            </p>
          )}
          {modo === 'match' && (
            <p className="banner-contexto">🤝 {yo.nombre}, elige tu opción en secreto:</p>
          )}
          {modo === 'reto' && (
            <p className="banner-contexto">🌶️ Reto que vas a lanzarle a {pareja.nombre}:</p>
          )}

          <p className="paso-titulo">{pregunta.texto}</p>

          {modo === 'adivinar' && (
            <textarea
              className="pin-input"
              style={{ width: '100%', minHeight: '70px', letterSpacing: 'normal', fontSize: '14px', textAlign: 'left' }}
              value={textoLibre}
              onChange={(e) => setTextoLibre(e.target.value)}
              placeholder="Tu respuesta secreta…"
            />
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
  const esPartida = !!duelo.partida_id
  const [premio, setPremio] = useState(null)
  const [respuesta, setRespuesta] = useState(null)
  const [textoLibre, setTextoLibre] = useState('')
  const [enviando, setEnviando] = useState(false)

  const necesitaPremio = duelo.modo === 'adivinar' && !esPartida

  async function enviarResultadoPush(titulo, cuerpo) {
    await enviarPush({ para_quien_id: pareja.id, titulo, cuerpo, url: '/?tab=duelo' })
  }

  async function responder() {
    setEnviando(true)

    if (esPartida) {
      const { error } = await supabase.rpc('revelados_responder_ronda_partida', {
        p_ronda_id: duelo.id,
        p_jugador_id: yo.id,
        p_respuesta: textoLibre.trim(),
      })
      setEnviando(false)
      if (error) {
        alert('Error: ' + error.message)
        return
      }
      await enviarResultadoPush('🤔 Tu pareja ya respondió', `${yo.nombre} adivinó en la Partida (${cat.nombre}). Entra a confirmar si acertó.`)
      onResultado({ tipo: 'esperando_confirmacion', categoria: cat })
      return
    }

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
      onResultado({ tipo: 'match', categoria: cat, opcion: data.opcion, nombre_a: pareja.nombre, nombre_b: yo.nombre, ...data })
      return
    }
    if (data.resultado === 'no_match') {
      await enviarResultadoPush('😅 No hubo match', `${yo.nombre} respondió en ${cat.nombre}, pero no coincidisteis.`)
      onResultado({
        tipo: 'no_match',
        categoria: cat,
        respuesta_a: data.respuesta_a,
        respuesta_b: data.respuesta_b,
        nombre_a: pareja.nombre,
        nombre_b: yo.nombre,
      })
      return
    }
    if (data.resultado === 'completado') {
      await enviarResultadoPush('✅ Reto cumplido', `${yo.nombre} ha cumplido el reto de ${cat.nombre}`)
      onResultado({ tipo: 'reto_completado', categoria: cat, nombre_b: yo.nombre, ...data })
      return
    }
  }

  async function confirmar(acierto) {
    setEnviando(true)

    if (esPartida) {
      const { data, error } = await supabase.rpc('revelados_confirmar_ronda_partida', {
        p_ronda_id: duelo.id,
        p_jugador_id: yo.id,
        p_acierto: acierto,
      })
      setEnviando(false)
      if (error) {
        alert('Error: ' + error.message)
        return
      }
      if (data.partida_ganada) {
        const ganoYo = data.ganador_id === yo.id
        await enviarResultadoPush(
          '👑 ¡Partida ganada!',
          ganoYo
            ? `Has ganado la Partida completa. Premio: ${data.partida_premio}`
            : `${pareja.nombre} ha ganado la Partida completa. Su premio: ${data.partida_premio}`
        )
      } else if (data.categoria_locked) {
        const ganoYo = data.ganador_id === yo.id
        await enviarResultadoPush(
          '🧀 ¡Quesito ganado!',
          ganoYo
            ? `Has ganado el quesito ${cat.nombre}. Premio: ${data.categoria_premio}`
            : `${pareja.nombre} ha ganado el quesito ${cat.nombre}.`
        )
      } else {
        await enviarResultadoPush(
          acierto ? '🎯 Ronda de Partida' : '😏 Ronda de Partida',
          acierto ? `${yo.nombre} acertó en ${cat.nombre} (Partida).` : `${yo.nombre} no acertó en ${cat.nombre} (Partida).`
        )
      }
      onResultado({ tipo: 'partida_ronda', categoria: cat, yoId: yo.id, parejaNombre: pareja.nombre, ...data })
      return
    }

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
    onResultado({
      tipo: acierto ? 'acierto' : 'fallo',
      categoria: cat,
      nombre_a: yo.nombre,
      nombre_b: pareja.nombre,
      ...data,
      gano: acierto ? pareja.id === data.ganador_id : yo.id === data.ganador_id,
    })
  }

  if (duelo.accion === 'confirmar') {
    return (
      <div className="tarjeta-categoria" style={{ borderColor: cat.color }}>
        <button className="link-btn" onClick={onVolver}>
          ← Volver
        </button>
        <h3 style={{ color: cat.color }}>
          {cat.icono} {cat.nombre} {esPartida ? '(Partida)' : ''}
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
        {cat.icono} {cat.nombre} {esPartida ? '(Partida)' : ''}
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
          {duelo.modo === 'adivinar' && (
            <p className="banner-contexto">
              ❓ {yo.nombre}, ponte en la piel de {pareja.nombre} y adivina qué respondería {pareja.nombre} a esto:
            </p>
          )}
          {duelo.modo === 'match' && (
            <p className="banner-contexto">
              🤝 {yo.nombre}, elige tu opción sin saber lo que eligió {pareja.nombre}:
            </p>
          )}
          {duelo.modo === 'reto' && (
            <p className="banner-contexto">🌶️ Reto de {pareja.nombre} para ti, {yo.nombre}:</p>
          )}

          <p className="paso-titulo">{duelo.preguntas.texto}</p>

          {duelo.modo === 'adivinar' && (
            <>
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
        <p>
          {resultado.nombre_a} y {resultado.nombre_b} coincidisteis en: {resultado.opcion}
        </p>
        {resultado.quesito_completo && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
        {resultado.legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO! Roscón completo.</p>}
      </>
    ),
    no_match: (
      <>
        <p className="resultado-emoji">😅</p>
        <h2 style={{ color: categoria.color }}>No hubo match</h2>
        <p>
          {resultado.nombre_a} contestó: {resultado.respuesta_a}
        </p>
        <p>
          {resultado.nombre_b} contestó: {resultado.respuesta_b}
        </p>
      </>
    ),
    reto_completado: (
      <>
        <p className="resultado-emoji">✅</p>
        <h2 style={{ color: categoria.color }}>¡Reto cumplido por {resultado.nombre_b}!</h2>
        {resultado.quesito_completo && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
        {resultado.legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO! Roscón completo.</p>}
      </>
    ),
    acierto: (
      <>
        <p className="resultado-emoji">🎯</p>
        <h2 style={{ color: categoria.color }}>¡{resultado.nombre_b} acertó!</h2>
        <p className="premio-texto">Premio para {resultado.nombre_b}: {resultado.premio_ganador}</p>
        {resultado.quesito_completo && <p className="premio-texto">🧀 ¡Quesito {categoria.nombre} completado!</p>}
        {resultado.legendario && <p className="premio-texto">👑 ¡LOGRO LEGENDARIO! Roscón completo.</p>}
      </>
    ),
    fallo: (
      <>
        <p className="resultado-emoji">😏</p>
        <h2 style={{ color: categoria.color }}>{resultado.nombre_b} no acertó esta vez</h2>
        <p className="premio-texto">Premio para {resultado.nombre_a}: {resultado.premio_ganador}</p>
      </>
    ),
    partida_ronda: resultado.partida_ganada ? (
      <>
        <p className="resultado-emoji">{resultado.ganador_id === resultado.yoId ? '🏆' : '💔'}</p>
        <h2 style={{ color: resultado.ganador_id === resultado.yoId ? '#facc15' : categoria.color }}>
          {resultado.ganador_id === resultado.yoId ? '¡HAS GANADO LA PARTIDA!' : 'Partida perdida'}
        </h2>
        <p className="premio-texto">
          {resultado.ganador_id === resultado.yoId
            ? `Tu premio: ${resultado.partida_premio}`
            : `Le debes a ${resultado.parejaNombre}: ${resultado.partida_premio}`}
        </p>
      </>
    ) : resultado.categoria_locked ? (
      <>
        <p className="resultado-emoji">🧀</p>
        <h2 style={{ color: categoria.color }}>
          {resultado.ganador_id === resultado.yoId
            ? `¡Ganaste el quesito ${categoria.nombre}!`
            : `${resultado.parejaNombre} se lleva el quesito ${categoria.nombre}`}
        </h2>
        {resultado.ganador_id === resultado.yoId ? (
          <p className="premio-texto">Tu premio: {resultado.categoria_premio}</p>
        ) : (
          <p className="premio-texto">Le debes a {resultado.parejaNombre}: {resultado.categoria_premio}</p>
        )}
      </>
    ) : (
      <>
        <p className="resultado-emoji">{resultado.resultado === 'acierto' ? '🎯' : '😏'}</p>
        <h2 style={{ color: categoria.color }}>{resultado.resultado === 'acierto' ? '¡Acertó!' : 'No acertó esta vez'}</h2>
        <p>Ronda para: {resultado.ganador_id === resultado.yoId ? 'ti' : resultado.parejaNombre}</p>
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

function PartidaScreen({ yo, pareja, recargarPendientes, onVolver }) {
  const [cargando, setCargando] = useState(true)
  const [partida, setPartida] = useState(null)
  const [categoriaJugando, setCategoriaJugando] = useState(null)
  const [verNueva, setVerNueva] = useState(false)

  const cargarPartida = useCallback(async () => {
    const { data, error } = await supabase.rpc('revelados_obtener_partida', { p_jugador_id: yo.id })
    if (error) {
      console.error(error)
      setCargando(false)
      return
    }
    setPartida(data && data.id ? data : null)
    setCargando(false)
  }, [yo.id])

  useEffect(() => {
    cargarPartida()
    const canal = supabase
      .channel('partida-canal-' + yo.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidas' }, cargarPartida)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partida_premios' }, cargarPartida)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partida_progreso' }, cargarPartida)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [cargarPartida, yo.id])

  function volverAlTablero() {
    setCategoriaJugando(null)
    cargarPartida()
    recargarPendientes()
  }

  if (cargando) return <p className="ayuda-texto">Cargando…</p>

  if (categoriaJugando) {
    return (
      <LanzarRondaPartida
        partida={partida}
        categoria={CATEGORIAS[categoriaJugando]}
        yo={yo}
        pareja={pareja}
        onVolver={() => setCategoriaJugando(null)}
        onEnviado={volverAlTablero}
      />
    )
  }

  if (partida && partida.estado === 'finalizada' && !verNueva) {
    const ganoYo = partida.ganador_id === yo.id
    const premioGanador = partida.ganador_id === partida.jugador_a_id ? partida.premio_partida_a : partida.premio_partida_b
    return (
      <div className="pantalla-centro">
        <button className="link-btn" onClick={onVolver}>
          ← Volver
        </button>
        <p className="resultado-emoji" style={{ fontSize: '64px' }}>
          {ganoYo ? '🏆' : '💔'}
        </p>
        <h2 style={{ color: ganoYo ? '#facc15' : '#94a3b8' }}>
          {ganoYo ? '¡HAS GANADO LA PARTIDA!' : `${pareja.nombre} ha ganado la Partida`}
        </h2>
        <p className="premio-texto" style={{ fontSize: '16px' }}>
          {ganoYo ? `Tu premio: ${premioGanador}` : `Le debes a ${pareja.nombre}: ${premioGanador}`}
        </p>
        <button className="btn-primario" onClick={() => setVerNueva(true)}>
          🎮 Jugar una Partida nueva
        </button>
      </div>
    )
  }

  if (verNueva && partida && partida.estado === 'finalizada') {
    return (
      <ConfigurarPartida
        yo={yo}
        pareja={pareja}
        onVolver={() => setVerNueva(false)}
        onConfigurado={() => {
          setVerNueva(false)
          cargarPartida()
        }}
      />
    )
  }

  const yoSoyA = partida && partida.jugador_a_id === yo.id
  const misPremioPartida = partida ? (yoSoyA ? partida.premio_partida_a : partida.premio_partida_b) : null
  const yaConfigure = misPremioPartida != null

  if (!partida || partida.estado === 'configurando') {
    if (partida && yaConfigure) {
      return (
        <div className="pantalla-centro">
          <button className="link-btn" onClick={onVolver}>
            ← Volver
          </button>
          <p className="resultado-emoji">⏳</p>
          <h2>Esperando a {pareja.nombre}</h2>
          <p>Ya has elegido tus premios. En cuanto {pareja.nombre} elija los suyos, empieza la Partida.</p>
          <button
            className="btn-primario"
            onClick={async () => {
              await enviarPush({
                para_quien_id: pareja.id,
                titulo: 'REVELADOS 🏆',
                cuerpo: `${yo.nombre} ya está listo para la Partida completa. ¡Elige tus premios!`,
                url: '/?tab=duelo',
              })
              alert('Aviso enviado')
            }}
          >
            🔔 Avisar a {pareja.nombre}
          </button>
        </div>
      )
    }
    return (
      <ConfigurarPartida
        yo={yo}
        pareja={pareja}
        onVolver={onVolver}
        onConfigurado={() => cargarPartida()}
      />
    )
  }

  // en_curso -> tablero
  const progresoDe = (jugadorId, categoria) => {
    const fila = (partida.progreso || []).find((p) => p.jugador_id === jugadorId && p.categoria === categoria)
    return fila ? fila.victorias : 0
  }
  const premioDe = (jugadorId, categoria) => {
    const fila = (partida.premios || []).find((p) => p.jugador_id === jugadorId && p.categoria === categoria)
    return fila ? fila.premio : ''
  }

  const esMiTurno = partida.turno_actual === yo.id
  const rondaActivaAjena = (partida.ronda_pendiente || []).length > 0 && !esMiTurno

  return (
    <div>
      <button className="link-btn" onClick={onVolver}>
        ← Volver
      </button>
      <h3 className="titulo-centro">🏆 Partida en curso</h3>
      <p className="ayuda-texto">Gana 3 preguntas en un quesito para llevártelo. El primero en ganar los 4 se lleva la Partida.</p>

      {esMiTurno ? (
        <p className="aviso-turno aviso-turno-tuyo">🟢 Es tu turno: elige un quesito y lanza la pregunta.</p>
      ) : (
        <p className="aviso-turno">
          ⏳ Es el turno de {pareja.nombre}
          {rondaActivaAjena ? ', esperando su respuesta o tu confirmación.' : '.'}
        </p>
      )}

      {ORDEN_CATEGORIAS.map((id) => {
        const cat = CATEGORIAS[id]
        const misVictorias = progresoDe(yo.id, id)
        const susVictorias = progresoDe(pareja.id, id)
        const bloqueado = misVictorias >= 3 || susVictorias >= 3
        const ganadorId = misVictorias >= 3 ? yo.id : susVictorias >= 3 ? pareja.id : null
        return (
          <div key={id} className="tarjeta-categoria" style={{ borderColor: cat.color, marginBottom: '12px' }}>
            <h3 style={{ color: cat.color }}>
              {cat.icono} {cat.nombre}
            </h3>
            <p>
              Tú: {misVictorias}/3 — {pareja.nombre}: {susVictorias}/3
            </p>
            {bloqueado ? (
              <p className="premio-texto">
                🧀 Quesito de {ganadorId === yo.id ? 'ti' : pareja.nombre}
              </p>
            ) : esMiTurno ? (
              <button className="btn-lanzar" onClick={() => setCategoriaJugando(id)}>
                Jugar pregunta
              </button>
            ) : (
              <button className="btn-lanzar" disabled>
                Espera tu turno
              </button>
            )}
            <details>
              <summary className="ayuda-texto">Ver premios de este quesito</summary>
              <p className="ayuda-texto">Tu premio si lo ganas: {premioDe(yo.id, id)}</p>
              <p className="ayuda-texto">Premio de {pareja.nombre} si lo gana: {premioDe(pareja.id, id)}</p>
            </details>
          </div>
        )
      })}
    </div>
  )
}

function ConfigurarPartida({ yo, pareja, onVolver, onConfigurado }) {
  const [premioPartida, setPremioPartida] = useState('')
  const [premios, setPremios] = useState({ rosa: null, rojo: null, morado: null, azul: null })
  const [enviando, setEnviando] = useState(false)

  const listo = premioPartida.trim().length > 0 && ORDEN_CATEGORIAS.every((id) => premios[id])

  async function enviar() {
    setEnviando(true)
    const { data, error } = await supabase.rpc('revelados_configurar_partida', {
      p_jugador_id: yo.id,
      p_premio_partida: premioPartida.trim(),
      p_premio_rosa: premios.rosa,
      p_premio_rojo: premios.rojo,
      p_premio_morado: premios.morado,
      p_premio_azul: premios.azul,
    })
    setEnviando(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    if (data.estado === 'en_curso') {
      await enviarPush({
        para_quien_id: pareja.id,
        titulo: 'REVELADOS 🏆',
        cuerpo: `¡La Partida completa ha comenzado! Ya podéis jugar.`,
        url: '/?tab=duelo',
      })
    } else {
      await enviarPush({
        para_quien_id: pareja.id,
        titulo: 'REVELADOS 🏆',
        cuerpo: `${yo.nombre} ha creado una Partida completa. Elige tus premios para empezar.`,
        url: '/?tab=duelo',
      })
    }
    onConfigurado()
  }

  return (
    <div>
      <button className="link-btn" onClick={onVolver}>
        ← Volver
      </button>
      <h3 className="titulo-centro">🏆 Configura tu Partida completa</h3>
      <p className="ayuda-texto">
        Elige un premio para ti por cada quesito que ganes, y un premio extra por ganar la Partida entera.
      </p>

      {ORDEN_CATEGORIAS.map((id) => {
        const cat = CATEGORIAS[id]
        return (
          <div key={id} style={{ marginBottom: '14px' }}>
            <p className="paso-titulo" style={{ color: cat.color }}>
              {cat.icono} {cat.nombre} — tu premio si ganas este quesito:
            </p>
            {cat.apuestas.map((ap) => (
              <div
                key={ap}
                className="opcion-card"
                style={{ background: premios[id] === ap ? cat.color : undefined }}
                onClick={() => setPremios((p) => ({ ...p, [id]: ap }))}
              >
                {ap}
              </div>
            ))}
          </div>
        )
      })}

      <p className="paso-titulo">🏆 Tu premio si ganas la Partida entera (los 4 quesitos):</p>
      <textarea
        className="pin-input"
        style={{ width: '100%', minHeight: '60px', letterSpacing: 'normal', fontSize: '14px', textAlign: 'left' }}
        value={premioPartida}
        onChange={(e) => setPremioPartida(e.target.value)}
        placeholder="Escribe el gran premio…"
      />

      {listo && (
        <button className="btn-lanzar" disabled={enviando} onClick={enviar}>
          {enviando ? 'Guardando…' : '✅ Confirmar mis premios'}
        </button>
      )}
    </div>
  )
}

function LanzarRondaPartida({ partida, categoria, yo, pareja, onVolver, onEnviado }) {
  const [pregunta, setPregunta] = useState(null)
  const [textoLibre, setTextoLibre] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    async function elegirPregunta() {
      const [{ data: todas }, { data: usadas }] = await Promise.all([
        supabase.from('preguntas').select('*').eq('categoria', categoria.id).eq('modo', 'adivinar'),
        supabase.from('duelos').select('pregunta_id').eq('partida_id', partida.id).eq('categoria', categoria.id),
      ])
      const usadasIds = new Set((usadas || []).map((u) => u.pregunta_id))
      let disponibles = (todas || []).filter((p) => !usadasIds.has(p.id))
      if (disponibles.length === 0) disponibles = todas || []
      setPregunta(disponibles[Math.floor(Math.random() * disponibles.length)])
    }
    elegirPregunta()
  }, [categoria.id, partida.id])

  async function lanzar() {
    setEnviando(true)
    const { error } = await supabase.rpc('revelados_lanzar_ronda_partida', {
      p_partida_id: partida.id,
      p_categoria: categoria.id,
      p_jugador_id: yo.id,
      p_pregunta_id: pregunta.id,
      p_respuesta: textoLibre.trim(),
    })
    if (error) {
      alert('Error al lanzar: ' + error.message)
      setEnviando(false)
      return
    }
    await enviarPush({
      para_quien_id: pareja.id,
      titulo: 'REVELADOS 🏆',
      cuerpo: `${yo.nombre} ha lanzado una pregunta de la Partida en ${categoria.nombre}`,
      url: '/?tab=duelo',
    })
    setEnviando(false)
    onEnviado()
  }

  if (!pregunta) return <p className="ayuda-texto">Cargando…</p>

  return (
    <div className="tarjeta-categoria" style={{ borderColor: categoria.color }}>
      <button className="link-btn" onClick={onVolver}>
        ← Volver al tablero
      </button>
      <h3 style={{ color: categoria.color }}>
        {categoria.icono} {categoria.nombre} (Partida)
      </h3>
      <p className="banner-contexto">
        🔒 {yo.nombre}, tu respuesta privada de la Partida — {pareja.nombre} no la verá hasta intentar adivinarla:
      </p>
      <p className="paso-titulo">{pregunta.texto}</p>
      <textarea
        className="pin-input"
        style={{ width: '100%', minHeight: '70px', letterSpacing: 'normal', fontSize: '14px', textAlign: 'left' }}
        value={textoLibre}
        onChange={(e) => setTextoLibre(e.target.value)}
        placeholder="Tu respuesta secreta…"
      />
      {textoLibre.trim().length > 0 && (
        <button className="btn-lanzar" disabled={enviando} onClick={lanzar}>
          {enviando ? 'Enviando…' : `⚔️ LANZAR A ${pareja.nombre.toUpperCase()}`}
        </button>
      )}
    </div>
  )
}

function VerResultadoDuelo({ duelo, yo, pareja, onVolver }) {
  const [resultado, setResultado] = useState(null)
  const cat = CATEGORIAS[duelo.categoria]

  useEffect(() => {
    let cancelado = false
    const nombre_a = duelo.jugador_a_id === yo.id ? yo.nombre : pareja.nombre
    const nombre_b = duelo.jugador_b_id === yo.id ? yo.nombre : pareja.nombre

    async function marcarYConstruir() {
      await supabase.rpc('revelados_marcar_visto', { p_duelo_id: duelo.id, p_jugador_id: yo.id })

      if (duelo.partida_id) {
        const { data: partida } = await supabase.rpc('revelados_obtener_partida', { p_jugador_id: yo.id })
        if (cancelado) return
        let categoria_locked = false
        let categoria_premio = null
        let partida_ganada = false
        let partida_premio = null
        if (partida && duelo.ganador_id) {
          const fila = (partida.progreso || []).find(
            (p) => p.jugador_id === duelo.ganador_id && p.categoria === duelo.categoria
          )
          if (fila && fila.victorias >= 3) {
            categoria_locked = true
            const premioFila = (partida.premios || []).find(
              (p) => p.jugador_id === duelo.ganador_id && p.categoria === duelo.categoria
            )
            categoria_premio = premioFila ? premioFila.premio : null
          }
          if (partida.estado === 'finalizada' && partida.ganador_id === duelo.ganador_id) {
            partida_ganada = true
            partida_premio =
              partida.ganador_id === partida.jugador_a_id ? partida.premio_partida_a : partida.premio_partida_b
          }
        }
        setResultado({
          tipo: 'partida_ronda',
          categoria: cat,
          resultado: duelo.resultado,
          ganador_id: duelo.ganador_id,
          yoId: yo.id,
          parejaNombre: pareja.nombre,
          nombre_a,
          nombre_b,
          categoria_locked,
          categoria_premio,
          partida_ganada,
          partida_premio,
        })
        return
      }

      const mapaTipo = { acierto: 'acierto', fallo: 'fallo', match: 'match', no_match: 'no_match', completado: 'reto_completado' }
      setResultado({
        tipo: mapaTipo[duelo.resultado] || 'acierto',
        categoria: cat,
        premio_ganador: duelo.premio_ganador,
        respuesta_a: duelo.respuesta_a,
        respuesta_b: duelo.respuesta_b,
        opcion: duelo.respuesta_b,
        nombre_a,
        nombre_b,
      })
    }

    marcarYConstruir()
    return () => {
      cancelado = true
    }
  }, [duelo, yo.id, yo.nombre, pareja, cat])

  if (!resultado) return <p className="ayuda-texto">Cargando resultado…</p>

  return <ResultadoVista resultado={resultado} onVolver={onVolver} />
}
