import random
from functools import partial

from backtest import run_backtest
from signals import neutral_signal, sentiment_signal

BULLISH_PHRASES = [
    "huge gains incoming, buy the dip, bullish rally, moon soon",
    "strong earnings beat, this stock is a buy, breakout coming",
    "calls printing, rocket to the moon, long and strong",
]
BEARISH_PHRASES = [
    "sell now, crash incoming, bearish dump, this is going down",
    "earnings miss, weak guidance, short this, puts printing",
    "plunge warning, bear market, dropping hard, loss city",
]
NEUTRAL_PHRASES = [
    "not sure what to think about this one",
    "waiting for more information before deciding",
    "quiet day, nothing notable to report",
]
PHRASE_POOLS = {"bull": BULLISH_PHRASES, "bear": BEARISH_PHRASES, "neutral": NEUTRAL_PHRASES}


def synthetic_context(ticker, date):
    """Stand-in for real Reddit post text, until a real feed exists.

    Deterministically picks a bullish/bearish/neutral phrase per
    (ticker, date) so evaluation runs are reproducible. Not real data --
    just enough to drive the sentiment model for an evaluation run.
    """
    rng = random.Random(f"{ticker}-{date}")
    pool = PHRASE_POOLS[rng.choice(["bull", "bear", "neutral"])]
    return rng.choice(pool)


def buy_and_hold_signal(ticker, date, data):
    return 1.0


def evaluate(ticker="AAPL", start_date="2022-01-01", end_date="2024-01-01", cash=100000.0):
    scenarios = {
        "neutral (no trades)": neutral_signal,
        "buy & hold": buy_and_hold_signal,
        "sentiment model (synthetic text)": partial(sentiment_signal, context_fn=synthetic_context),
    }

    end_values = {}
    for name, signal_fn in scenarios.items():
        print(f"\n=== {name} ===")
        cerebro, _ = run_backtest(ticker, start_date, end_date, cash=cash, signal_fn=signal_fn)
        end_values[name] = cerebro.broker.getvalue()

    print("\n=== Summary ===")
    for name, end_value in end_values.items():
        print(f"{name:35s} {end_value:>12.2f}  ({(end_value / cash - 1) * 100:+.2f}%)")

    return end_values


if __name__ == "__main__":
    evaluate()
