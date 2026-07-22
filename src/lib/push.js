import { supabase, VAPID_PUBLIC_KEY } from '../supabaseClient'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.error('SW error', e)
    return null
  }
}

export function esStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export async function activarNotificaciones(perfilId) {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, motivo: 'no_soportado' }
  }
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return { ok: false, motivo: 'permiso_denegado' }

  const registration = await navigator.serviceWorker.ready
  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  await supabase.rpc('revelados_set_push', { p_perfil_id: perfilId, p_subscription: sub.toJSON() })
  return { ok: true }
}

export async function enviarPush({ para_quien_id, titulo, cuerpo, url }) {
  try {
    await supabase.functions.invoke('send-push', {
      body: { para_quien_id, titulo, cuerpo, url },
    })
  } catch (e) {
    console.error('push error', e)
  }
}
