import unittest
from unittest.mock import patch
from research.strategy_lab import volume_profile, research, simulate, signal
from tests.test_research import candles

class StrategyLabTests(unittest.TestCase):
    def test_profile_conserves_volume_and_covers_value_area(self):
        data=candles()
        p=volume_profile(data[-120:])
        self.assertAlmostEqual(p['total_volume'],sum(c['volume'] for c in data[-120:]),places=7)
        self.assertGreaterEqual(p['value_area_fraction'],.7)
        self.assertLessEqual(p['val'],p['poc']); self.assertGreaterEqual(p['vah'],p['poc'])
        self.assertEqual(p['end_time'],data[-1]['time'])
    def test_zero_volume_veto_and_flat_range(self):
        with self.assertRaises(ValueError):volume_profile([dict(low=100,high=100,close=100,time=1,volume=0)])
        p=volume_profile([dict(low=100,high=100,close=100,time=1,volume=5)])
        self.assertEqual(p['total_volume'],5)
    def test_profile_freezes_before_signal_bars(self):
        data=candles()[-180:];seen=[]
        def capture(history):
            seen.append(history[-1]['time']);return {'vah':100,'val':90,'poc':95}
        with patch('research.strategy_lab.volume_profile',side_effect=capture):signal(data,'frvp_vah_retest',100)
        self.assertEqual(seen,[data[-3]['time']])
    def test_features_never_see_entry_or_future_bar(self):
        data=candles();seen=[]
        def capture(history,*args):seen.append(history[-1]['time']);return False
        with patch('research.strategy_lab.signal',side_effect=capture):simulate(data,'frvp_poc_reclaim',100,160,180)
        self.assertEqual(seen[0],data[159]['time']);self.assertLess(max(seen),data[179]['time'])
    def test_final_holdout_cannot_choose_strategy(self):
        data=candles();baseline=research(data);changed=[dict(c) for c in data]
        for c in changed[320:]:
            for key in ['open','high','low','close']:c[key]*=1.5
        result=research(changed)
        self.assertEqual(result['training_selected'],baseline['training_selected'])
        self.assertEqual([s['train'] for s in result['studies']],[s['train'] for s in baseline['studies']])
        self.assertEqual(len(result['studies']),6)
    def test_small_sample_never_claims_live_promotion(self):
        metrics=dict(trades=1,net_r=2,drawdown_r=0,win_rate=100,profit_factor=None)
        with patch('research.strategy_lab.simulate',return_value=metrics):result=research(candles())
        self.assertIsNone(result['candidate']);self.assertEqual(result['decision'],'insufficient_edge_evidence')
    def test_fixed_range_selection(self):
        data=candles();r=research(data,data[30]['time'],data[70]['time'])
        self.assertEqual(r['profile']['bars'],41);self.assertEqual(r['profile']['start_time'],data[30]['time'])
        with self.assertRaises(ValueError):research(data,1,2)
if __name__=='__main__':unittest.main()
