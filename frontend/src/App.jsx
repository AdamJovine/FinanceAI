import { useState } from 'react'
import { Activity, History, Briefcase, Menu, X } from 'lucide-react'
import './App.css'
import SentimentView from './SentimentView'
import BacktestView from './BacktestView'
import PortfolioView from './PortfolioView'

const NAV_ITEMS = [
  { key: 'sentiment', label: 'Sentiment', icon: Activity },
  { key: 'backtesting', label: 'Backtesting', icon: History },
  { key: 'portfolio', label: 'My Portfolio', icon: Briefcase },
]

function App() {
  const [view, setView] = useState('sentiment')
  const [menuOpen, setMenuOpen] = useState(false)

  function selectView(key) {
    setView(key)
    setMenuOpen(false)
  }

  return (
    <div className="app">
      <header className="nav-bar">
        <div className="nav-bar-spacer" />
        <span className="app-title">FinanceAI</span>
        <div className="nav-bar-spacer" />
      </header>

      <button
        className="nav-menu-toggle"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`nav-menu-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />
      <div className={`nav-menu ${menuOpen ? 'open' : ''}`}>
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-menu-item ${view === key ? 'active' : ''}`}
            onClick={() => selectView(key)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="view-fade" key={view}>
        {view === 'sentiment' && <SentimentView />}
        {view === 'backtesting' && <BacktestView />}
        {view === 'portfolio' && <PortfolioView />}
      </div>
    </div>
  )
}

export default App
