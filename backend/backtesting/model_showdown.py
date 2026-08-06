import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

from backtest import run_backtest
from online_sentiment import fetch_combined_sentiment
from random_forest_model import train_and_predict
from signals import neutral_signal
from yahoo_api import get_stock_data

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

# A mix of meme-stock and high-volatility retail names -- where a live sentiment
# signal is most likely to actually diverge from pure price action.
TICKER_UNIVERSE = ["GME", "AMC", "PLTR", "TSLA", "NVDA", "AMD", "COIN", "SOFI", "RIVN", "MSTR"]


def buy_and_hold_signal(ticker, date, data):
    return 1.0


def score_universe(tickers, score_fn, max_workers=8):
    """Score every ticker in `tickers` with `score_fn(ticker) -> float`, in parallel
    (each call is a live OpenAI/Perigon round trip, so this is I/O-bound).

    A ticker whose call errors (timeout, rate limit, etc.) is scored 0.0 (neutral)
    with a note printed to stderr, rather than taking down the whole batch --
    a single flaky call shouldn't block picking a favorite from the other nine.
    """
    def safe_score(ticker):
        try:
            return score_fn(ticker)
        except Exception as exc:
            print(f"  [warn] scoring {ticker} failed ({exc}); treating as neutral 0.0", file=sys.stderr)
            return 0.0

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        scores = list(pool.map(safe_score, tickers))
    return dict(zip(tickers, scores))


def pick_favorite(tickers, score_fn):
    scores = score_universe(tickers, score_fn)
    favorite = max(scores, key=scores.get)
    return favorite, scores


def index_curve(curve):
    base = curve[0][1]
    return [{"date": d.isoformat(), "value": v / base * 100} for d, v in curve]


def run_showdown(tickers=TICKER_UNIVERSE, months=6, cash=100000.0, openai_model="gpt-5-mini"):
    """Let the sentiment model and the random-forest model each independently pick
    their favorite ticker from `tickers`, "invest" in it (buy-and-hold if their
    conviction is net bullish, otherwise stay in cash) over the trailing `months`,
    and return both equity curves indexed against a shared S&P 500 benchmark.
    """
    load_dotenv(ENV_PATH)
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    perigon_api_key = os.environ.get("PERIGON_API_KEY")
    if not openai_api_key or not perigon_api_key:
        raise SystemExit("OPENAI_API_KEY and PERIGON_API_KEY must be set in .env")

    end_date = date.today().isoformat()
    start_date_obj = date.today() - timedelta(days=months * 30)
    start_date = start_date_obj.isoformat()

    # Score and pick as of the simulated buy date (start_date), not today -- otherwise
    # the pick would be made using sentiment (and, for the RF model, price history)
    # that didn't exist yet when the backtest's buy is dated to have happened.
    sentiment_pick, sentiment_scores = pick_favorite(
        tickers,
        lambda t: fetch_combined_sentiment(
            t, openai_api_key, perigon_api_key, as_of_date=start_date_obj, openai_model=openai_model,
        )["score"],
    )
    rf_pick, rf_scores = pick_favorite(
        tickers,
        lambda t: train_and_predict(
            t, openai_api_key, perigon_api_key, end_date=start_date, openai_model=openai_model,
        )["score"],
    )

    models = {}
    for name, pick, scores in (("sentiment", sentiment_pick, sentiment_scores), ("random_forest", rf_pick, rf_scores)):
        invests = scores[pick] > 0
        signal_fn = buy_and_hold_signal if invests else neutral_signal
        _, results = run_backtest(pick, start_date, end_date, cash, signal_fn=signal_fn, verbose=False)
        curve = index_curve(results[0].equity_curve)
        models[name] = {
            "ticker": pick,
            "conviction_score": scores[pick],
            "invested": invests,
            "all_scores": scores,
            "curve": curve,
            "return_pct": curve[-1]["value"] - 100,
        }

    benchmark_df = get_stock_data("SPY", start_date, end_date)
    benchmark_by_date = {ts.date(): close for ts, close in benchmark_df["close"].items()}
    bench_dates = [entry["date"] for entry in models["sentiment"]["curve"]]
    bench_first = benchmark_by_date[min(benchmark_by_date)]
    benchmark_curve = [
        {"date": d, "value": benchmark_by_date.get(date.fromisoformat(d), bench_first) / bench_first * 100}
        for d in bench_dates
    ]

    return {
        "start_date": start_date,
        "end_date": end_date,
        "universe": tickers,
        "models": models,
        "benchmark": {
            "ticker": "SPY",
            "curve": benchmark_curve,
            "return_pct": benchmark_curve[-1]["value"] - 100,
        },
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description="Let the sentiment model and the random-forest model each pick their own "
                     "ticker from a universe, and compare 6-month performance."
    )
    parser.add_argument("--months", type=int, default=6)
    parser.add_argument("--cash", type=float, default=100000.0)
    parser.add_argument("--openai-model", default=os.environ.get("OPENAI_MODEL", "gpt-5-mini"))
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    result = run_showdown(months=args.months, cash=args.cash, openai_model=args.openai_model)
    print(json.dumps(result, indent=2))
