import json
import re

import requests

from online_sentiment import fetch_combined_sentiment
from random_forest_model import train_and_predict

POSITIVE_WORDS = {
    "buy", "bull", "bullish", "moon", "mooning", "rocket", "gain", "gains",
    "profit", "long", "calls", "surge", "beat", "beats", "strong", "up",
    "breakout", "rally",
}
NEGATIVE_WORDS = {
    "sell", "bear", "bearish", "crash", "crashing", "loss", "losses",
    "short", "puts", "drop", "dropping", "plunge", "miss", "misses",
    "weak", "down", "dump", "dumping",
}


def analyze_sentiment(text):
    """Really simple keyword-count sentiment scorer, in [-1.0, 1.0].

    Not a real NLP model -- just enough of a stand-in to exercise the
    trading framework end-to-end before a real Reddit/LLM-based analyzer
    replaces it.
    """
    if not text:
        return 0.0

    words = re.findall(r"[a-z']+", text.lower())
    pos = sum(1 for w in words if w in POSITIVE_WORDS)
    neg = sum(1 for w in words if w in NEGATIVE_WORDS)

    total = pos + neg
    return (pos - neg) / total if total else 0.0


def neutral_signal(ticker, date, data=None):
    """Baseline signal function: always neutral, so nothing trades."""
    return 0.0


def sentiment_signal(ticker, date, data, context_fn):
    """Score context_fn(ticker, date) text with analyze_sentiment.

    context_fn supplies whatever text should be scored (Reddit posts,
    comments, anything else) -- wiring a real Reddit context_fn in is a
    separate piece of work. Bind context_fn with functools.partial before
    passing this to the strategy as its signal_fn.
    """
    return analyze_sentiment(context_fn(ticker, date))


LLAMA_SYSTEM_PROMPT = (
    "You are a financial sentiment scorer. Given text about a stock, "
    'respond with ONLY a JSON object: {"sentiment": <float between -1.0 and 1.0>}. '
    "-1.0 is maximally bearish, 0.0 is neutral, 1.0 is maximally bullish."
)


def llama_signal(ticker, date, data, context_fn, base_url="http://localhost:8080", model="local", temperature=0.0, timeout=30):
    """Score context_fn(ticker, date) text via a local llama.cpp server.

    Bind context_fn (and any of the other kwargs) with functools.partial
    before passing this to the strategy as its signal_fn.
    """
    context = context_fn(ticker, date)
    if not context:
        return 0.0

    response = requests.post(
        f"{base_url.rstrip('/')}/v1/chat/completions",
        json={
            "model": model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": LLAMA_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
        },
        timeout=timeout,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]

    try:
        value = float(json.loads(content)["sentiment"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        match = re.search(r"-?\d+\.?\d*", content)
        value = float(match.group()) if match else 0.0
    return max(-1.0, min(1.0, value))


_online_sentiment_cache = {}


def online_signal(ticker, date, data, openai_api_key, perigon_api_key, as_of_date=None,
                   openai_model="gpt-5-mini", news_weight=0.4, reddit_weight=0.6):
    """Reddit + news sentiment via OpenAI web search and Perigon.

    By default this is *live* sentiment (as of right now) -- it can't be
    replayed bar-by-bar over the past, so the score is fetched once per
    ticker and cached for every date a backtest asks about it. That makes the
    default most meaningful for a live/paper-trading style decision on the
    current day, not a multi-year historical sweep.

    Pass `as_of_date` to instead fetch sentiment as of that specific date
    (point-in-time for the news leg, best-effort for the Reddit leg -- see
    fetch_reddit_sentiment) -- still fetched once and cached, not re-fetched
    per bar. Bind the API keys (and as_of_date, if used) with functools.partial
    before passing this to the strategy as its signal_fn.
    """
    key = (ticker, as_of_date)
    if key not in _online_sentiment_cache:
        _online_sentiment_cache[key] = fetch_combined_sentiment(
            ticker,
            openai_api_key,
            perigon_api_key,
            as_of_date=as_of_date,
            openai_model=openai_model,
            news_weight=news_weight,
            reddit_weight=reddit_weight,
        )
    return _online_sentiment_cache[key]["score"]


_rf_model_cache = {}


def rf_signal(ticker, date, data, openai_api_key, perigon_api_key, as_of_date=None, openai_model="gpt-5-mini"):
    """Random-forest signal trained on Yahoo Finance technical/fundamental data
    plus the sentiment model's score as one input feature (see random_forest_model.py).

    Like online_signal, this trains once per ticker (and as_of_date) and
    caches the resulting signal for every date a backtest asks about --
    fundamentals stay a live/current snapshot regardless (see
    train_and_predict), but sentiment is point-in-time-as-of `as_of_date`
    when given, live/today otherwise. Bind the API keys (and as_of_date, if
    used) with functools.partial before passing this to the strategy as its
    signal_fn.
    """
    key = (ticker, as_of_date)
    if key not in _rf_model_cache:
        _rf_model_cache[key] = train_and_predict(
            ticker, openai_api_key, perigon_api_key,
            end_date=as_of_date.isoformat() if as_of_date else None,
            openai_model=openai_model,
        )
    return _rf_model_cache[key]["score"]
