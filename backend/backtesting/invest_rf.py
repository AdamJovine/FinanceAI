import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv

from random_forest_model import train_and_predict

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def decide(ticker, openai_api_key, perigon_api_key, openai_model="gpt-5-mini",
           buy_threshold=0.2, sell_threshold=-0.2, start_date=None, end_date=None):
    result = train_and_predict(
        ticker, openai_api_key, perigon_api_key,
        start_date=start_date, end_date=end_date, openai_model=openai_model,
    )

    if result["score"] >= buy_threshold:
        action = "BUY"
    elif result["score"] <= sell_threshold:
        action = "SELL"
    else:
        action = "HOLD"

    return {"ticker": ticker.upper(), "action": action, **result}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train a random forest on Yahoo Finance technical/fundamental data plus the "
                     "live sentiment model's score, and recommend BUY/SELL/HOLD for a ticker."
    )
    parser.add_argument("ticker")
    parser.add_argument("--buy-threshold", type=float, default=0.2)
    parser.add_argument("--sell-threshold", type=float, default=-0.2)
    parser.add_argument("--openai-model", default=os.environ.get("OPENAI_MODEL", "gpt-5-mini"))
    parser.add_argument("--json", action="store_true", help="Print raw JSON instead of a summary.")
    return parser.parse_args()


if __name__ == "__main__":
    load_dotenv(ENV_PATH)
    args = parse_args()

    openai_api_key = os.environ.get("OPENAI_API_KEY")
    perigon_api_key = os.environ.get("PERIGON_API_KEY")
    if not openai_api_key or not perigon_api_key:
        raise SystemExit("OPENAI_API_KEY and PERIGON_API_KEY must be set in .env")

    decision = decide(
        args.ticker, openai_api_key, perigon_api_key,
        openai_model=args.openai_model,
        buy_threshold=args.buy_threshold,
        sell_threshold=args.sell_threshold,
    )

    if args.json:
        print(json.dumps(decision, indent=2))
    else:
        print(f"Ticker:          {decision['ticker']}")
        print(f"Recommendation:  {decision['action']}")
        print(f"Signal:          {decision['score']:.2f}")
        print(f"Up probability:  {decision['up_probability']:.2%}")
        print(f"Training rows:   {decision['training_rows']}")
        print(f"Sentiment score: {decision['sentiment']['score']:.2f}")
        print("Top features:")
        for name, importance in list(decision["feature_importances"].items())[:6]:
            print(f"  {name:20s} {importance:.3f}")
