import json
import re
from datetime import date, timedelta

import requests
from openai import OpenAI

PERIGON_URL = "https://api.goperigon.com/v1/all"

REDDIT_SYSTEM_PROMPT = (
    "You are a financial sentiment analyst. Use web search to find recent Reddit "
    "discussion (r/wallstreetbets, r/stocks, r/investing, r/StockMarket, and similar "
    "subreddits) about the given stock ticker. Weigh recent, high-engagement posts and "
    "comments more heavily than old or low-engagement ones. "
    "After searching, respond with ONLY a JSON object as your final line, with nothing "
    'after it: {"sentiment": <float -1.0 to 1.0>, "mention_count": <int>, "summary": <string>}. '
    "-1.0 is maximally bearish, 0.0 is neutral or no clear signal found, 1.0 is maximally bullish."
)


def fetch_perigon_news_sentiment(ticker, api_key, days=3, page_size=25, timeout=20):
    """Average Perigon's per-article sentiment for recent news mentioning `ticker`.

    Perigon tags each article with a {positive, negative, neutral} sentiment
    breakdown; this collapses that into a single [-1.0, 1.0] score.
    """
    params = {
        "apiKey": api_key,
        "q": f'"{ticker}"',
        "from": (date.today() - timedelta(days=days)).isoformat(),
        "sortBy": "relevance",
        "size": page_size,
        "language": "en",
    }
    response = requests.get(PERIGON_URL, params=params, timeout=timeout)
    response.raise_for_status()
    articles = response.json().get("articles", [])

    scored = []
    for article in articles:
        sentiment = article.get("sentiment") or {}
        pos, neg = sentiment.get("positive"), sentiment.get("negative")
        if pos is None or neg is None:
            continue
        scored.append(pos - neg)

    score = sum(scored) / len(scored) if scored else 0.0
    return {
        "score": max(-1.0, min(1.0, score)),
        "article_count": len(articles),
        "scored_count": len(scored),
        "articles": [
            {"title": a.get("title"), "url": a.get("url"), "sentiment": a.get("sentiment")}
            for a in articles[:5]
        ],
    }


def fetch_reddit_sentiment(ticker, api_key, model="gpt-5-mini", timeout=60):
    """Search Reddit for `ticker` sentiment via OpenAI's web_search tool."""
    client = OpenAI(api_key=api_key, timeout=timeout)
    response = client.responses.create(
        model=model,
        tools=[{"type": "web_search"}],
        input=[
            {"role": "system", "content": REDDIT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Search Reddit (site:reddit.com) for the most recent discussion and "
                    f"sentiment about ${ticker} stock. Focus on posts and comments from the "
                    f"last few days."
                ),
            },
        ],
    )
    return _parse_reddit_response(response.output_text)


def _parse_reddit_response(text):
    try:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        payload = json.loads(match.group()) if match else {}
    except (json.JSONDecodeError, AttributeError):
        payload = {}

    try:
        sentiment = max(-1.0, min(1.0, float(payload.get("sentiment", 0.0))))
    except (TypeError, ValueError):
        sentiment = 0.0

    return {
        "score": sentiment,
        "mention_count": payload.get("mention_count", 0),
        "summary": payload.get("summary", ""),
    }


def fetch_combined_sentiment(ticker, openai_api_key, perigon_api_key, openai_model="gpt-5-mini",
                              news_weight=0.4, reddit_weight=0.6):
    """News tends to move price on fundamentals/events; Reddit leads retail-driven
    momentum. Weighting Reddit higher favors the meme-stock use case this app targets."""
    news = fetch_perigon_news_sentiment(ticker, perigon_api_key)
    reddit = fetch_reddit_sentiment(ticker, openai_api_key, model=openai_model)
    combined = news_weight * news["score"] + reddit_weight * reddit["score"]
    return {
        "score": max(-1.0, min(1.0, combined)),
        "news": news,
        "reddit": reddit,
    }
