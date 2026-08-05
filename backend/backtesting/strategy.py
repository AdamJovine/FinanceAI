import backtrader as bt

from signals import NeutralSignalProvider


class SentimentStrategy(bt.Strategy):
    """Trades a single feed based on a signal pulled from a SignalProvider.

    The provider is injected so the same strategy runs today (against the
    neutral placeholder) and later (against real Reddit-sentiment scores)
    with no changes here.
    """

    params = (
        ("signal_provider", None),
        ("buy_threshold", 0.5),
        ("sell_threshold", -0.5),
        ("stake_pct", 0.95),
    )

    def __init__(self):
        self.signal_provider = self.p.signal_provider or NeutralSignalProvider()

    def next(self):
        date = self.datas[0].datetime.date(0)
        ticker = self.datas[0]._name
        signal = self.signal_provider.get_signal(ticker, date)

        position_size = self.getposition(self.datas[0]).size

        if signal >= self.p.buy_threshold and position_size == 0:
            cash = self.broker.get_cash()
            price = self.datas[0].close[0]
            size = int((cash * self.p.stake_pct) / price)
            if size > 0:
                self.buy(data=self.datas[0], size=size)

        elif signal <= self.p.sell_threshold and position_size > 0:
            self.close(data=self.datas[0])
