import {AsyncLocalStorage} from 'node:async_hooks';
import {join,resolve} from 'node:path';

export type AccountIdentity={id:string;workspaceId:string;email:string;name:string};
export const accountContext=new AsyncLocalStorage<AccountIdentity|undefined>();
export const currentAccount=()=>accountContext.getStore();
export const rootDataDirectory=()=>resolve(/* turbopackIgnore: true */ process.env.TERMINAL_DATA_DIR||'.runtime');
export const accountDataDirectory=(id:string)=>{
  if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Invalid account');
  return join(rootDataDirectory(),'accounts',id);
};
export function vaultDirectory(){const account=currentAccount();return account?join(accountDataDirectory(account.id),'vault'):process.env.TERMINAL_VAULT_DIR||'obsidian-vault';}
