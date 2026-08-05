import { useState } from 'react'
import './App.css'
import SentimentView from './SentimentView'
import BacktestView from './BacktestView'

function App() {
  const [view, setView] = useState('sentiment')

  return (
    <div className="app">
      <nav className="nav">
        <button
          className={`nav-tab ${view === 'sentiment' ? 'active' : ''}`}
          onClick={() => setView('sentiment')}
        >
          Sentiment
        </button>
        <button
          className={`nav-tab ${view === 'backtesting' ? 'active' : ''}`}
          onClick={() => setView('backtesting')}
        >
          Backtesting
        </button>
      </nav>
      {view === 'sentiment' ? <SentimentView /> : <BacktestView />}
    </div>
  )
}

export default App
