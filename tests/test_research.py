import math
import unittest
from unittest.mock import patch
from research.terminal_research import research, simulate


def candles():
    result = []
    price = 100.0
    for i in range(400):
        previous = price
        price = 100 + math.sin(i * .15) * 2 + math.sin(i * 1.73) * .3 + i * .01
        result.append(dict(time=1760000400 + i * 900, open=previous, high=max(previous, price) + .2,
                           low=min(previous, price) - .2, close=price, volume=10))
    return result


class TerminalResearchTests(unittest.TestCase):
    def test_real_canonical_model_and_chronological_split(self):
        result = research(candles())
        self.assertEqual(result["split"], 280)
        self.assertEqual(len(result["studies"]), 3)
        self.assertEqual(result["snapshot"]["checked_fib_ratios"][0], .618)
        self.assertGreater(len(result["snapshot"]["anchors"]), 0)
        self.assertGreater(sum(s["train"]["trades"] for s in result["studies"]), 0)

    def test_model_never_sees_current_or_future_bar(self):
        data = candles()
        seen = []
        def model(history, **kwargs):
            seen.append(history[-1]["time"])
            return {"anchors": []}
        with patch("research.terminal_research.build_directional_fib_snapshot", side_effect=model):
            result = simulate(data, .08, 80, 100)
        self.assertEqual(result["trades"], 0)
        self.assertEqual(seen[0], data[79]["time"])
        self.assertLess(max(seen), data[99]["time"])

    def test_insufficient_holdout_never_promotes(self):
        with patch("research.terminal_research.simulate", return_value=dict(trades=1, net_r=2, drawdown_r=0, win_rate=100)):
            result = research(candles(), auto_apply=True)
        self.assertIsNone(result["candidate"])
        self.assertEqual(result["decision"], "keep_baseline")
        self.assertEqual(result["active_tolerance"], .08)


if __name__ == "__main__":
    unittest.main()
