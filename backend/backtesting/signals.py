import json
import re

import requests

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
