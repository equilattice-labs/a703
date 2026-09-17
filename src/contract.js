export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 5042002)
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io'
export const CONTRACT_ADDRESS = import.meta.env.VITE_TOKEN_CONTRACT_ADDRESS || ''
// Optional explicit treasury; legacy Deedluma contracts do not expose one.
export const TREASURY_ADDRESS = (import.meta.env.VITE_TREASURY_ADDRESS || '').trim()
export const EXPLORER_URL = (import.meta.env.VITE_EXPLORER_URL || 'https://explorer.testnet.arc.io').replace(/\/$/, '')
export const DEPLOYMENT_BLOCK = Number(import.meta.env.VITE_DEPLOYMENT_BLOCK || 0)
import artifact from './abi/Deedluma.json'
export const ABI = artifact.abi
export const NETWORK = { chainId: `0x${CHAIN_ID.toString(16)}`, chainName: 'Arc Chain Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: EXPLORER_URL ? [EXPLORER_URL] : undefined }
