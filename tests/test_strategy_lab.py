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

class DistributionContextTests(unittest.TestCase):
    def profile(self):
        return dict(poc=100, val=95, vah=105, end_time=10)
    def bars(self, rows):
        return [dict(time=11+i, low=low, high=high, close=close) for i,(low,high,close) in enumerate(rows)]
    def test_poc_support_requires_touch_and_following_hold(self):
        from research.strategy_lab import distribution_context
        result=distribution_context(self.profile(),self.bars([(99.8,103,102),(101,104,103)]))
        self.assertEqual(result['bias'],'bullish');self.assertTrue(result['confirmed_retest'])
        self.assertEqual(result['confirmation'],'poc_support_retest_confirmed')
    def test_poc_resistance_requires_touch_and_following_rejection(self):
        from research.strategy_lab import distribution_context
        result=distribution_context(self.profile(),self.bars([(97,100.2,98),(96,99,97)]))
        self.assertEqual(result['bias'],'bearish');self.assertTrue(result['confirmed_retest'])
    def test_inside_band_missing_bars_or_mixed_sides_stay_neutral(self):
        from research.strategy_lab import distribution_context
        for rows in [[(99,101,100)],[(99,101,100.1),(99,101,99.9)],[(99,103,102),(97,101,98)]]:
            self.assertEqual(distribution_context(self.profile(),self.bars(rows))['bias'],'neutral')
        old=[dict(time=9,low=99,high=103,close=102),dict(time=10,low=99,high=104,close=103)]
        self.assertEqual(distribution_context(self.profile(),old)['bias'],'neutral')
    def test_last_bar_touch_without_follow_up_is_not_retest_confirmation(self):
        from research.strategy_lab import distribution_context
        result=distribution_context(self.profile(),self.bars([(101,104,103),(99.9,103,102)]))
        self.assertEqual(result['bias'],'bullish');self.assertFalse(result['confirmed_retest'])
    def test_poc_strategy_freezes_before_reclaim_and_requires_retest_hold(self):
        data=candles()[-180:]
        for i, close, low in [(-3,99,98),(-2,102,101),(-1,103,100)]:
            data[i]=dict(data[i],open=close,close=close,low=low,high=close+1)
        seen=[]
        def frozen(history):
            seen.append(history[-1]['time']);return dict(poc=100,val=95,vah=105)
        with patch('research.strategy_lab.volume_profile',side_effect=frozen),patch('research.strategy_lab.atr',return_value=2):
            self.assertTrue(signal(data,'frvp_poc_reclaim',100))
            self.assertEqual(seen,[data[-4]['time']])
            data[-1]=dict(data[-1],close=99,low=98)
            self.assertFalse(signal(data,'frvp_poc_reclaim',100))

    def test_default_display_distribution_excludes_confirmation_bars(self):
        data=candles();result=research(data)
        self.assertEqual(result['profile']['end_time'],data[-3]['time'])
        self.assertEqual(result['profile_context']['confirmation_bars'],2)

if __name__=='__main__':unittest.main()
