import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import { enviarPush } from '../lib/push'

async function mandarAlerta(tipo, yo, pareja, setEnviado) {
  await supabase.from('alertas_rapidas').insert({
    tipo,
    de_quien: yo.id,
    para_quien: pareja.id,
  })
  const mensajes = {
    pensando_en_ti: `⚡ ${yo.nombre} está pensando en ti`,
    foto_efimera: `📸 ${yo.nombre} te ha mandado una foto efímera`,
    audio_susurrado: `🎙️ ${yo.nombre} te ha mandado un audio susurrado`,
  }
  await enviarPush({
    para_quien_id: pareja.id,
    titulo: 'REVELADOS',
    cuerpo: mensajes[tipo],
    url: '/',
  })
  setEnviado(tipo)
  setTimeout(() => setEnviado(null), 2500)
}

export default function Pulsador({ yo, pareja }) {
  const [enviado, setEnviado] = useState(null)

  return (
    <div className="pulsador-vista">
      <button
        className="boton-pensando"
        onClick={() => mandarAlerta('pensando_en_ti', yo, pareja, setEnviado)}
      >
        ⚡ PENSANDO
        <br />
        EN TI
      </button>

      <div className="botones-secundarios">
        <button className="btn-secundario" onClick={() => mandarAlerta('foto_efimera', yo, pareja, setEnviado)}>
          📸 Foto Efímera (5s)
        </button>
        <button className="btn-secundario" onClick={() => mandarAlerta('audio_susurrado', yo, pareja, setEnviado)}>
          🎙️ Audio Susurrado
        </button>
      </div>

      {enviado && <p className="toast-enviado">✅ Enviado a {pareja.nombre}</p>}
    </div>
  )
}
