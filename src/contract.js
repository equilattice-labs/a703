export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 46630)
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.chain.robinhood.com/rpc'
export const CONTRACT_ADDRESS = import.meta.env.VITE_TOKEN_CONTRACT_ADDRESS || ''
export const EXPLORER_URL = (import.meta.env.VITE_EXPLORER_URL || 'https://explorer.testnet.chain.robinhood.com').replace(/\/$/, '')
export const DEPLOYMENT_BLOCK = Number(import.meta.env.VITE_DEPLOYMENT_BLOCK || 0)
import artifact from './abi/Deedluma.json'
export const ABI = artifact.abi
export const NETWORK = { chainId: `0x${CHAIN_ID.toString(16)}`, chainName: 'RobinHood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: EXPLORER_URL ? [EXPLORER_URL] : undefined }
