import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './screens/Login.jsx'
import Pulsador from './screens/Pulsador.jsx'
import Duelo from './screens/Duelo.jsx'
import Roscon from './screens/Roscon.jsx'
import Vitrina from './screens/Vitrina.jsx'
import TabBar from './components/TabBar.jsx'
import InstalarBanner from './components/InstalarBanner.jsx'

const SESSION_KEY = 'revelados_perfil_id'

export default function App() {
  const [perfilId, setPerfilId] = useState(() => localStorage.getItem(SESSION_KEY))
  const [perfiles, setPerfiles] = useState([])
  const [tab, setTab] = useState('pulsador')

  useEffect(() => {
    supabase.from('perfiles_public').select('*').then(({ data }) => {
      if (data) setPerfiles(data)
    })
  }, [perfilId])

  if (!perfilId) {
    return (
      <Login
        onLogin={(id) => {
          localStorage.setItem(SESSION_KEY, id)
          setPerfilId(id)
        }}
      />
    )
  }

  const yo = perfiles.find((p) => p.id === perfilId)
  const pareja = perfiles.find((p) => p.id !== perfilId)

  if (!yo || !pareja) {
    return (
      <div className="pantalla-centro">
        <p>Cargando…</p>
      </div>
    )
  }

  function cerrarSesion() {
    localStorage.removeItem(SESSION_KEY)
    setPerfilId(null)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>REVELADOS🔥</h1>
        <small>
          Sesión: {yo.nombre}{' '}
          <button className="link-btn" onClick={cerrarSesion}>
            (salir)
          </button>
        </small>
      </header>

      <InstalarBanner perfilId={yo.id} />

      <main className="app-main">
        {tab === 'pulsador' && <Pulsador yo={yo} pareja={pareja} />}
        {tab === 'duelo' && <Duelo yo={yo} pareja={pareja} />}
        {tab === 'roscon' && <Roscon />}
        {tab === 'logros' && <Vitrina />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  )
}
