import React, { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login({ onLogin }) {
  const [nombre, setNombre] = useState(null)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  function elegirPerfil(n) {
    setError('')
    setPin('')
    setPin2('')
    setNombre(n)
  }

  async function continuar() {
    setError('')
    if (!/^[0-9]{4}$/.test(pin)) {
      setError('El PIN debe tener 4 dígitos.')
      return
    }
    setCargando(true)

    // Intentamos verificar primero.
    const { data: idVerificado } = await supabase.rpc('revelados_check_pin', {
      p_nombre: nombre,
      p_pin: pin,
    })

    if (idVerificado) {
      setCargando(false)
      onLogin(idVerificado)
      return
    }

    // Si no verifica, puede ser primera vez (pin_hash aun no existe) o pin incorrecto.
    if (pin2) {
      if (pin !== pin2) {
        setError('Los PIN no coinciden.')
        setCargando(false)
        return
      }
      const { data: idCreado, error: err } = await supabase.rpc('revelados_set_pin', {
        p_nombre: nombre,
        p_pin: pin,
      })
      setCargando(false)
      if (err || !idCreado) {
        setError('PIN incorrecto.')
        return
      }
      onLogin(idCreado)
      return
    }

    setCargando(false)
    setError('PIN incorrecto, o si es tu primera vez repítelo abajo para crearlo.')
  }

  return (
    <div className="pantalla-centro login-screen">
      <div className="login-card">
        <div className="login-logo">💌</div>
        <h1 className="login-titulo">REVELADOS</h1>
        <p className="login-sub">Un juego para dos.</p>

        {!nombre && (
          <>
            <p className="etiqueta">¿QUIÉN ERES?</p>
            {['Manuel', 'Ali'].map((n) => (
              <button key={n} className="perfil-btn" onClick={() => elegirPerfil(n)}>
                <span className="perfil-avatar">{n[0]}</span>
                <span>{n}</span>
                <span className="flecha">→</span>
              </button>
            ))}
          </>
        )}

        {nombre && (
          <div className="pin-form">
            <p className="etiqueta">Hola, {nombre}</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN (4 dígitos)"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="pin-input"
              autoFocus
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="Repite el PIN (solo la primera vez)"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
              className="pin-input"
            />
            <small className="ayuda-texto">
              Si es tu primera vez, escribe el mismo PIN en los dos campos para crearlo.
            </small>
            {error && <p className="error-texto">{error}</p>}
            <button className="btn-primario" disabled={cargando} onClick={continuar}>
              {cargando ? 'Comprobando…' : 'Entrar →'}
            </button>
            <button className="link-btn" onClick={() => setNombre(null)}>
              ← Cambiar perfil
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
