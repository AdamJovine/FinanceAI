import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv

from online_sentiment import fetch_combined_sentiment

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def decide(ticker, openai_api_key, perigon_api_key, openai_model="gpt-5-mini",
           buy_threshold=0.5, sell_threshold=-0.5, news_weight=0.4, reddit_weight=0.6):
    result = fetch_combined_sentiment(
        ticker,
        openai_api_key,
        perigon_api_key,
        openai_model=openai_model,
        news_weight=news_weight,
        reddit_weight=reddit_weight,
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
        description="Score live Reddit + news sentiment for a ticker and recommend BUY/SELL/HOLD."
    )
    parser.add_argument("ticker")
    parser.add_argument("--buy-threshold", type=float, default=0.5)
    parser.add_argument("--sell-threshold", type=float, default=-0.5)
    parser.add_argument("--news-weight", type=float, default=0.4)
    parser.add_argument("--reddit-weight", type=float, default=0.6)
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
        args.ticker,
        openai_api_key,
        perigon_api_key,
        openai_model=args.openai_model,
        buy_threshold=args.buy_threshold,
        sell_threshold=args.sell_threshold,
        news_weight=args.news_weight,
        reddit_weight=args.reddit_weight,
    )

    if args.json:
        print(json.dumps(decision, indent=2))
    else:
        print(f"Ticker:          {decision['ticker']}")
        print(f"Recommendation:  {decision['action']}")
        print(f"Combined score:  {decision['score']:.2f}")
        print(f"News score:      {decision['news']['score']:.2f} ({decision['news']['scored_count']}/{decision['news']['article_count']} articles scored)")
        print(f"Reddit score:    {decision['reddit']['score']:.2f} ({decision['reddit']['mention_count']} mentions)")
        print(f"Reddit summary:  {decision['reddit']['summary']}")
