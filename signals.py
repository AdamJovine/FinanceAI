from abc import ABC, abstractmethod


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
