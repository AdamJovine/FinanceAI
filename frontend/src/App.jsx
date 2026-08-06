import { useState } from 'react'
import { Activity, History, Briefcase } from 'lucide-react'
import './App.css'
import SentimentView from './SentimentView'
import BacktestView from './BacktestView'
import PortfolioView from './PortfolioView'

function App() {
  const [view, setView] = useState('sentiment')

  return (
    <div className="app">
      <nav className="nav">
        <button
          className={`nav-tab ${view === 'sentiment' ? 'active' : ''}`}
          onClick={() => setView('sentiment')}
        >
          <Activity size={15} />
          Sentiment
        </button>
        <button
          className={`nav-tab ${view === 'backtesting' ? 'active' : ''}`}
          onClick={() => setView('backtesting')}
        >
          <History size={15} />
          Backtesting
        </button>
        <button
          className={`nav-tab ${view === 'portfolio' ? 'active' : ''}`}
          onClick={() => setView('portfolio')}
        >
          <Briefcase size={15} />
          My Portfolio
        </button>
      </nav>
      {view === 'sentiment' && <SentimentView />}
      {view === 'backtesting' && <BacktestView />}
      {view === 'portfolio' && <PortfolioView />}
    </div>
  )
}

export default App
