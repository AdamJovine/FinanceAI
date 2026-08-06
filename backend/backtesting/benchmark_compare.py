import argparse
import json
from datetime import date, timedelta

from backtest import build_signal_fn, run_backtest
from yahoo_api import get_stock_data


def compare_to_benchmark(ticker="AAPL", start_date=None, end_date=None, cash=100000.0,
                          commission=0.001, signal_fn=None, benchmark_ticker="SPY"):
    """Run a backtest and index its equity curve against a benchmark (default SPY)
    on a common start=100 basis, so a $-value strategy curve and an index-point
    benchmark curve can be compared on one axis.
    """
    end_date = end_date or date.today().isoformat()
    start_date = start_date or (date.today() - timedelta(days=365)).isoformat()

    cerebro, results = run_backtest(ticker, start_date, end_date, cash, commission, signal_fn, verbose=False)
    strat = results[0]

    strategy_dates = [d for d, _ in strat.equity_curve]
    strategy_values = [v for _, v in strat.equity_curve]
    strategy_indexed = [v / strategy_values[0] * 100 for v in strategy_values]

    # Reuse the exact same start/end strings used for the ticker fetch -- yfinance's
    # `end` is exclusive, so deriving this from strategy_dates[-1] instead would
    # silently drop the benchmark's last trading day.
    benchmark_df = get_stock_data(benchmark_ticker, start_date, end_date)
    benchmark_by_date = {ts.date(): close for ts, close in benchmark_df["close"].items()}

    benchmark_first = benchmark_by_date[min(benchmark_by_date)]
    benchmark_indexed = [
        benchmark_by_date.get(d, benchmark_first) / benchmark_first * 100
        for d in strategy_dates
    ]

    return {
        "ticker": ticker,
        "benchmark_ticker": benchmark_ticker,
        "start_date": start_date,
        "end_date": end_date,
        "dates": [d.isoformat() for d in strategy_dates],
        "strategy_indexed": strategy_indexed,
        "benchmark_indexed": benchmark_indexed,
        "strategy_return_pct": strategy_indexed[-1] - 100,
        "benchmark_return_pct": benchmark_indexed[-1] - 100,
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run a backtest and print its equity curve indexed against a benchmark, as JSON."
    )
    parser.add_argument("--ticker", default="AAPL")
    parser.add_argument("--start", default=None)
    parser.add_argument("--end", default=None)
    parser.add_argument("--cash", type=float, default=100000.0)
    parser.add_argument("--commission", type=float, default=0.001)
    parser.add_argument("--benchmark", default="SPY")
    parser.add_argument("--signal-provider", choices=["neutral", "online", "rf"], default="neutral",
                         help="'online' trades on live OpenAI web-search + Perigon sentiment; "
                              "'rf' trades on a random forest over Yahoo Finance data + that sentiment score.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    signal_fn = build_signal_fn(args.signal_provider)
    result = compare_to_benchmark(
        args.ticker, args.start, args.end, args.cash, args.commission, signal_fn, args.benchmark
    )
    # Only line on stdout -- callers (e.g. the Express API route) JSON.parse this directly.
    print(json.dumps(result))
