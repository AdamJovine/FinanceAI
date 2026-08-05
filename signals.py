import json
import re
from abc import ABC, abstractmethod

import requests


class SignalProvider(ABC):
    """Interface between a strategy and whatever produces trade signals.

    A future Reddit-sentiment component implements this to turn post/comment
    analysis into a per-bar signal. Nothing about Reddit or sentiment scoring
    is implemented here — this is just the seam the strategy calls through.
    """

    @abstractmethod
    def get_signal(self, ticker, date):
        """Return a signal in [-1.0, 1.0] for `ticker` on `date`.

        -1.0 = maximally bearish, 0.0 = neutral, 1.0 = maximally bullish.
        """
        raise NotImplementedError


class NeutralSignalProvider(SignalProvider):
    """Placeholder provider that always returns neutral (no opinion).

    Used until the Reddit sentiment provider exists, so the strategy and
    backtest runner can be built and tested end-to-end without it.
    """

    def get_signal(self, ticker, date):
        return 0.0


class LlamaCppSignalProvider(SignalProvider):
    """Turns arbitrary text into a signal via a chat-completions server.

    Targets llama.cpp's server by default (which mimics OpenAI's Chat
    Completions API), but the same request/response shape means pointing
    base_url at "https://api.openai.com" with a real model name and api_key
    works too.

    This knows nothing about Reddit — `context_fn(ticker, date)` supplies
    whatever text should be scored (Reddit posts, comments, anything else)
    and this class just sends it to the model and parses back a number.
    Wiring up a real Reddit `context_fn` is a separate piece of work.

    Signals are cached per (ticker, date): backtests shouldn't re-hit the
    server for a bar they've already scored, and LLM sampling isn't
    guaranteed deterministic call to call.
    """

    SYSTEM_PROMPT = (
        "You are a financial sentiment scorer. Given text about a stock, "
        'respond with ONLY a JSON object: {"sentiment": <float between -1.0 and 1.0>}. '
        "-1.0 is maximally bearish, 0.0 is neutral, 1.0 is maximally bullish."
    )

    def __init__(
        self,
        context_fn,
        base_url="http://localhost:8080",
        model="local",
        temperature=0.0,
        timeout=30,
        api_key=None,
    ):
        self.context_fn = context_fn
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.timeout = timeout
        self.api_key = api_key
        self._cache = {}

    def get_signal(self, ticker, date):
        key = (ticker, date)
        if key not in self._cache:
            context = self.context_fn(ticker, date)
            self._cache[key] = self._query_model(context) if context else 0.0
        return self._cache[key]

    def warm_cache(self, contexts):
        """Precompute signals for {(ticker, date): context_text, ...}.

        Call this once before cerebro.run() so a backtest never blocks on
        the server mid-strategy — get_signal then just reads the cache.
        """
        for key, context in contexts.items():
            if key not in self._cache:
                self._cache[key] = self._query_model(context) if context else 0.0

    def _query_model(self, context):
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        response = requests.post(
            f"{self.base_url}/v1/chat/completions",
            json={
                "model": self.model,
                "temperature": self.temperature,
                "messages": [
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": context},
                ],
            },
            headers=headers,
            timeout=self.timeout,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return self._parse_sentiment(content)

    @staticmethod
    def _parse_sentiment(content):
        try:
            value = float(json.loads(content)["sentiment"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            match = re.search(r"-?\d+\.?\d*", content)
            value = float(match.group()) if match else 0.0
        return max(-1.0, min(1.0, value))
