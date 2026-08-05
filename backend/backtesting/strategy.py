import backtrader as bt

from signals import neutral_signal


class SentimentStrategy(bt.Strategy):
    """Trades a single feed based on a signal_fn(ticker, date, data) callable.

    The function is injected so the same strategy runs today (against the
    neutral placeholder) and later (against real Reddit-sentiment scores)
    with no changes here.
    """

    params = (
        ("signal_fn", None),
        ("buy_threshold", 0.5),
        ("sell_threshold", -0.5),
        ("stake_pct", 0.95),
    )

    def __init__(self):
        self.signal_fn = self.p.signal_fn or neutral_signal

    def next(self):
        data = self.datas[0]
        date = data.datetime.date(0)
        ticker = data._name
        signal = self.signal_fn(ticker, date, data)

        position_size = self.getposition(data).size

        if signal >= self.p.buy_threshold and position_size == 0:
            cash = self.broker.get_cash()
            price = data.close[0]
            size = int((cash * self.p.stake_pct) / price)
            if size > 0:
                self.buy(data=data, size=size)

        elif signal <= self.p.sell_threshold and position_size > 0:
            self.close(data=data)
