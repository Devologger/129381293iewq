import {withAccount} from '../../../../lib/server/accounts.ts';
import {marketResponse} from '../../../../lib/server/market.ts';
export const GET=withAccount(marketResponse);
