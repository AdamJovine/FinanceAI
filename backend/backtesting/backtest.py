import argparse
import os
from datetime import date, timedelta
from functools import partial
from pathlib import Path

import backtrader as bt
from dotenv import load_dotenv

from signals import finbert_signal, neutral_signal, online_signal, rf_signal
from strategy import SentimentStrategy
from yahoo_api import get_stock_data

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def build_signal_fn(name, start_date=None, end_date=None):
    if name == "neutral":
        return neutral_signal
    if name in ("online", "rf"):
        load_dotenv(ENV_PATH)
        openai_api_key = os.environ.get("OPENAI_API_KEY")
        perigon_api_key = os.environ.get("PERIGON_API_KEY")
        if not openai_api_key or not perigon_api_key:
            raise SystemExit("OPENAI_API_KEY and PERIGON_API_KEY must be set in .env")
        fn = online_signal if name == "online" else rf_signal
        return partial(fn, openai_api_key=openai_api_key, perigon_api_key=perigon_api_key)
    if name == "finbert":
        load_dotenv(ENV_PATH)
        perigon_api_key = os.environ.get("PERIGON_API_KEY")
        if not perigon_api_key:
            raise SystemExit("PERIGON_API_KEY must be set in .env")
        # Resolve the same way run_backtest does -- finbert_signal needs the
        # *actual* window to compute its halfway checkpoint correctly, not
        # raw (possibly None) CLI args.
        resolved_end = end_date or date.today().isoformat()
        resolved_start = start_date or (date.today() - timedelta(days=365)).isoformat()
        return partial(finbert_signal, perigon_api_key=perigon_api_key,
                        start_date=resolved_start, end_date=resolved_end)
    raise ValueError(f"Unknown signal provider: {name}")


def run_backtest(ticker="AAPL", start_date=None, end_date=None, cash=100000.0, commission=0.001, signal_fn=None, verbose=True):
    end_date = end_date or date.today().isoformat()
    start_date = start_date or (date.today() - timedelta(days=365)).isoformat()

    cerebro = bt.Cerebro()

    df = get_stock_data(ticker, start_date, end_date)
    data = bt.feeds.PandasData(dataname=df, name=ticker)
    cerebro.adddata(data)

    cerebro.addstrategy(SentimentStrategy, signal_fn=signal_fn or neutral_signal)

    cerebro.broker.setcash(cash)
    cerebro.broker.setcommission(commission=commission)

    cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name="sharpe")
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
    cerebro.addanalyzer(bt.analyzers.Returns, _name="returns")
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")

    start_value = cerebro.broker.getvalue()
    results = cerebro.run()
    end_value = cerebro.broker.getvalue()
    strat = results[0]

    if verbose:
        print(f"Ticker:        {ticker}")
        print(f"Period:        {start_date} -> {end_date}")
        print(f"Start value:   {start_value:.2f}")
        print(f"End value:     {end_value:.2f}")
        print(f"Return:        {(end_value / start_value - 1) * 100:.2f}%")
        print(f"Sharpe ratio:  {strat.analyzers.sharpe.get_analysis().get('sharperatio')}")
        print(f"Max drawdown:  {strat.analyzers.drawdown.get_analysis().max.drawdown:.2f}%")

    return cerebro, results


def parse_args():
    parser = argparse.ArgumentParser(description="Run a backtrader backtest against Yahoo Finance data.")
    parser.add_argument("--ticker", default="AAPL")
    parser.add_argument("--start", default=None)
    parser.add_argument("--end", default=None)
    parser.add_argument("--cash", type=float, default=100000.0)
    parser.add_argument("--commission", type=float, default=0.001)
    parser.add_argument("--signal-provider", choices=["neutral", "online", "rf", "finbert"], default="neutral",
                         help="'online' trades on live OpenAI web-search + Perigon sentiment; "
                              "'rf' trades on a random forest over Yahoo Finance data + that sentiment score; "
                              "'finbert' trades on local FinBERT-scored Perigon news only (no OpenAI, no Reddit).")
    parser.add_argument("--plot", action="store_true", help="Render the backtrader chart after running.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    signal_fn = build_signal_fn(args.signal_provider, start_date=args.start, end_date=args.end)
    cerebro, _ = run_backtest(args.ticker, args.start, args.end, args.cash, args.commission, signal_fn=signal_fn)
    if args.plot:
        cerebro.plot()
