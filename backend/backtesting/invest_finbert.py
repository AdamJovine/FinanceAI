import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv

from finbert_sentiment import fetch_finbert_sentiment

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def decide(ticker, perigon_api_key, buy_threshold=0.15, sell_threshold=-0.15):
    result = fetch_finbert_sentiment(ticker, perigon_api_key, as_of_date=None, include_yahoo=True)

    if result["score"] >= buy_threshold:
        action = "BUY"
    elif result["score"] <= sell_threshold:
        action = "SELL"
    else:
        action = "HOLD"

    return {"ticker": ticker.upper(), "action": action, **result}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Score Perigon + Yahoo Finance news with local FinBERT (no OpenAI, no Reddit) "
                     "and recommend BUY/SELL/HOLD for a ticker."
    )
    parser.add_argument("ticker")
    parser.add_argument("--buy-threshold", type=float, default=0.15)
    parser.add_argument("--sell-threshold", type=float, default=-0.15)
    parser.add_argument("--json", action="store_true", help="Print raw JSON instead of a summary.")
    return parser.parse_args()


if __name__ == "__main__":
    load_dotenv(ENV_PATH)
    args = parse_args()

    perigon_api_key = os.environ.get("PERIGON_API_KEY")
    if not perigon_api_key:
        raise SystemExit("PERIGON_API_KEY must be set in .env")

    decision = decide(
        args.ticker, perigon_api_key,
        buy_threshold=args.buy_threshold, sell_threshold=args.sell_threshold,
    )

    if args.json:
        print(json.dumps(decision, indent=2))
    else:
        print(f"Ticker:          {decision['ticker']}")
        print(f"Recommendation:  {decision['action']}")
        print(f"Combined score:  {decision['score']:.2f}")
        print(f"Articles scored: {decision['article_count']} (Perigon: {decision['perigon_count']}, Yahoo: {decision['yahoo_count']})")
        print("Sample articles:")
        for a in decision["articles"][:5]:
            print(f"  [{a['label']:8s}] {a['title'][:90]}")
