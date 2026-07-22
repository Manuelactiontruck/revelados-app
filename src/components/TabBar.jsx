import React from 'react'

const TABS = [
  { id: 'pulsador', label: '⚡ Pulsador' },
  { id: 'duelo', label: '🎲 El Duelo' },
  { id: 'roscon', label: '🧀 Roscón' },
  { id: 'logros', label: '🏆 Vitrina' },
]

export default function TabBar({ tab, setTab }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab-btn ${tab === t.id ? 'activo' : ''}`}
          onClick={() => setTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
