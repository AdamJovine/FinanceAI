# FinanceAI

A trading dashboard with three tabs — live sentiment analysis, strategy backtesting against multiple models, and a simulated portfolio.

## Setup

### 1. API keys

Create a `.env` file at the **repo root** (not inside `backend/`):

```
OPENAI_API_KEY=sk-...
PERIGON_API_KEY=...
```

- `PERIGON_API_KEY` is required for all real sentiment features (news data).
- `OPENAI_API_KEY` is required for the "Sentiment analyzer" and "Random forest" models (they use OpenAI's `web_search` tool for Reddit sentiment). The FinBERT model does **not** need it — it scores news locally and only needs `PERIGON_API_KEY`.

### 2. Backend (Express)

```
cd backend
npm install
npm start
```

Runs on `http://localhost:5001`.

### 3. Python backtesting engine

The backend spawns Python scripts as subprocesses for sentiment/backtest requests, so these must be installed too:

```
cd backend/backtesting
pip install -r requirements.txt
```

Note: this includes `torch` + `transformers` for the local FinBERT model — the first run downloads its weights (~400MB, cached afterward, no API key needed).

### 4. Frontend (Vite + React)

```
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`. Start the backend first — the frontend calls it directly at `http://localhost:5001`.

## Tabs

### Sentiment

Look up live sentiment for a ticker: real Reddit sentiment (via OpenAI's `web_search` tool, with real quoted posts and source URLs) combined with real Perigon news sentiment, plus a real 90-day price chart. The 14-day sentiment/mention-volume trend charts and the overall positive/neutral/negative breakdown are still simulated — each field in the response is tagged `real` or `simulated` so it's clear which is which.

### Backtesting

Run a historical backtest against one of three models, or compare all three:

| Model | Data sources | Notes |
|---|---|---|
| **Sentiment analyzer** (`online`) | OpenAI `web_search` (Reddit) + Perigon (news) | Live LLM-judged sentiment. Slow (20-120s per call). |
| **Random forest** (`rf`) | Yahoo Finance technicals/fundamentals + the sentiment model's score | Trains a `RandomForestClassifier` per run. In practice the technical features dominate — sentiment/fundamentals are live-only constants across the training window, so they get ~0 feature importance. |
| **FinBERT** (`finbert`) | Perigon news only, scored locally via FinBERT | No OpenAI, no Reddit. Fast enough to genuinely walk forward through a backtest — queries Perigon twice per run (start of the window + its midpoint) rather than freezing one live snapshot. |

Caveat that applies to `online` and `rf`: their signal is a **live snapshot** (today's sentiment), cached once and reused across the whole backtest window — so a backtest isn't really replaying historical sentiment day-by-day for those two, more "would today's read have paid off holding this stock over this period." `finbert` is the one model that's genuinely point-in-time within a backtest.

Standalone CLIs (same models, for one-off use outside the UI), run from `backend/backtesting/`:

```
python3 invest.py <TICKER>          # sentiment analyzer: BUY/SELL/HOLD
python3 invest_rf.py <TICKER>       # random forest: BUY/SELL/HOLD
python3 invest_finbert.py <TICKER>  # FinBERT: BUY/SELL/HOLD
python3 backtest.py --ticker <TICKER> --signal-provider {online,rf,finbert,neutral}
python3 evaluate.py                 # compares neutral/buy-and-hold/synthetic-sentiment baselines
python3 model_showdown.py           # sentiment vs. RF, each picks its own ticker from a universe
python3 apple_trader.py             # sentiment vs. RF, AAPL-only, periodic buy/sell/size decisions
```

### My Portfolio

Simulated holdings, totals, and a 30-day value chart —- mock data, not a real brokerage connection.

## API endpoints (backend)

- `GET /api/sentiment/:ticker`
- `POST /api/backtest` — stats for one run (`ticker`, `start`, `end`, `cash`, `commission`, `signalProvider`)
- `POST /api/backtest/chart` — equity curve indexed against a benchmark
- `GET /api/price/:ticker`
- `GET /api/portfolio`
