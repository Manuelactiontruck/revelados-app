import React, { useEffect, useState } from 'react'
import { activarNotificaciones, esStandalone } from '../lib/push'

export default function InstalarBanner({ perfilId }) {
  const [cerrado, setCerrado] = useState(() => localStorage.getItem('revelados_banner_cerrado') === '1')
  const [notifOk, setNotifOk] = useState(false)
  const instalado = esStandalone()

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') setNotifOk(true)
  }, [])

  if (cerrado) return null

  function cerrar() {
    localStorage.setItem('revelados_banner_cerrado', '1')
    setCerrado(true)
  }

  if (instalado && notifOk) return null

  return (
    <div className="banner-instalar">
      {!instalado && (
        <p>
          📲 Para recibir notificaciones reales, añade REVELADOS a tu pantalla de inicio:
          <br />
          <b>iPhone:</b> botón Compartir → "Añadir a pantalla de inicio".
          <br />
          <b>Android:</b> menú ⋮ → "Instalar aplicación".
        </p>
      )}
      {instalado && !notifOk && (
        <button
          className="btn-primario"
          onClick={async () => {
            const r = await activarNotificaciones(perfilId)
            if (r.ok) setNotifOk(true)
          }}
        >
          🔔 Activar notificaciones
        </button>
      )}
      <button className="link-btn" onClick={cerrar}>
        cerrar
      </button>
    </div>
  )
}
