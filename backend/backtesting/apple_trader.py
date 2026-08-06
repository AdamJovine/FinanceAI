import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

from online_sentiment import fetch_combined_sentiment
from random_forest_model import train_and_predict
from yahoo_api import get_stock_data

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
TICKER = "AAPL"


def pick_rebalance_dates(trading_dates, every_n=21):
    """Roughly-monthly checkpoints (~21 trading days/month) from the available
    trading calendar. This is the practical granularity: each checkpoint is a
    live, point-in-time API round trip, so daily rebalancing would take hours."""
    return trading_dates[0::every_n]


def score_dates_parallel(dates, score_fn, max_workers=6):
    """Score every date with `score_fn(date) -> float`, in parallel. A date whose
    call errors (timeout, rate limit) is scored 0.0 (neutral) with a warning,
    rather than taking down the whole run."""
    def safe_score(d):
        try:
            return d, score_fn(d)
        except Exception as exc:
            print(f"  [warn] scoring {d} failed ({exc}); treating as neutral 0.0", file=sys.stderr)
            return d, 0.0

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        results = list(pool.map(safe_score, dates))
    return dict(results)


def simulate(price_df, scores_by_date, cash=100000.0, max_stake=0.95, commission=0.001):
    """Walk forward day by day. On each date with a score, size the AAPL position
    proportionally to conviction: target_fraction = clamp(score, 0, 1) * max_stake
    of portfolio value (long-only -- a negative score means "hold no position",
    not "short"). Rebalance toward that target; otherwise just mark to market.
    """
    shares = 0
    balance = cash
    equity_curve = []
    decisions = []

    for ts, row in price_df.iterrows():
        d = ts.date()
        price = float(row["close"])

        if d in scores_by_date:
            score = scores_by_date[d]
            portfolio_value = balance + shares * price
            target_fraction = max(0.0, min(1.0, score)) * max_stake
            target_shares = int((portfolio_value * target_fraction) / price)
            delta = target_shares - shares

            if delta > 0:
                cost = delta * price * (1 + commission)
                if cost <= balance:
                    shares += delta
                    balance -= cost
                    action = "BUY"
                else:
                    affordable = int(balance / (price * (1 + commission)))
                    shares += affordable
                    balance -= affordable * price * (1 + commission)
                    action = "BUY (cash-limited)"
            elif delta < 0:
                proceeds = -delta * price * (1 - commission)
                shares += delta
                balance += proceeds
                action = "SELL"
            else:
                action = "HOLD"

            decisions.append({
                "date": d.isoformat(),
                "score": round(score, 3),
                "action": action,
                "shares_after": shares,
                "target_fraction": round(target_fraction, 3),
                "portfolio_value": round(balance + shares * price, 2),
            })

        equity_curve.append({"date": d.isoformat(), "value": balance + shares * price})

    return equity_curve, decisions


def run_apple_showdown(months=6, cash=100000.0, openai_model="gpt-5-mini", max_stake=0.95, commission=0.001):
    """Let the sentiment model and the random-forest model each independently trade
    AAPL only -- choosing when to buy, when to sell, and how much (conviction-sized),
    at ~monthly checkpoints, each scored with point-in-time (not live/today) data.
    """
    load_dotenv(ENV_PATH)
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    perigon_api_key = os.environ.get("PERIGON_API_KEY")
    if not openai_api_key or not perigon_api_key:
        raise SystemExit("OPENAI_API_KEY and PERIGON_API_KEY must be set in .env")

    end_date = date.today().isoformat()
    start_date = (date.today() - timedelta(days=months * 30)).isoformat()

    price_df = get_stock_data(TICKER, start_date, end_date)
    trading_dates = [ts.date() for ts in price_df.index]
    rebalance_dates = pick_rebalance_dates(trading_dates)

    sentiment_scores = score_dates_parallel(
        rebalance_dates,
        lambda d: fetch_combined_sentiment(
            TICKER, openai_api_key, perigon_api_key, as_of_date=d, openai_model=openai_model,
        )["score"],
    )
    rf_scores = score_dates_parallel(
        rebalance_dates,
        lambda d: train_and_predict(
            TICKER, openai_api_key, perigon_api_key, end_date=d.isoformat(), openai_model=openai_model,
        )["score"],
    )

    models = {}
    for name, scores in (("sentiment", sentiment_scores), ("random_forest", rf_scores)):
        curve, decisions = simulate(price_df, scores, cash=cash, max_stake=max_stake, commission=commission)
        base = curve[0]["value"]
        indexed = [{"date": e["date"], "value": e["value"] / base * 100} for e in curve]
        models[name] = {
            "curve": indexed,
            "decisions": decisions,
            "return_pct": indexed[-1]["value"] - 100,
        }

    buy_hold_base = float(price_df["close"].iloc[0])
    buy_hold_curve = [
        {"date": ts.date().isoformat(), "value": float(close) / buy_hold_base * 100}
        for ts, close in price_df["close"].items()
    ]

    return {
        "ticker": TICKER,
        "start_date": start_date,
        "end_date": end_date,
        "rebalance_dates": [d.isoformat() for d in rebalance_dates],
        "models": models,
        "buy_and_hold": {
            "curve": buy_hold_curve,
            "return_pct": buy_hold_curve[-1]["value"] - 100,
        },
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description="Let the sentiment model and random-forest model actively trade AAPL only -- "
                     "choosing when to buy/sell and how much, at ~monthly checkpoints."
    )
    parser.add_argument("--months", type=int, default=6)
    parser.add_argument("--cash", type=float, default=100000.0)
    parser.add_argument("--openai-model", default=os.environ.get("OPENAI_MODEL", "gpt-5-mini"))
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    result = run_apple_showdown(months=args.months, cash=args.cash, openai_model=args.openai_model)
    print(json.dumps(result, indent=2))
