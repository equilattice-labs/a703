// Keep the cluster, RPC, and explorer links aligned. Testnet is the default
// because the community program is deployed there.
const env = import.meta.env || globalThis.__KINTRAVA_ENV__ || (typeof process !== 'undefined' ? process.env : {})
const value = key => {
  const candidate = env[key]
  return candidate !== undefined && candidate !== null && String(candidate).trim() ? String(candidate).trim() : ''
}

const clusters = {
  devnet: { name: 'Solana Devnet', rpc: 'https://api.devnet.solana.com' },
  testnet: { name: 'Solana Testnet', rpc: 'https://api.testnet.solana.com' },
  'mainnet-beta': { name: 'Solana Mainnet', rpc: 'https://api.mainnet-beta.solana.com' },
}
const FALLBACK_CLUSTER = 'testnet'
const explicitCluster = value('VITE_SOLANA_CLUSTER')
const requestedCluster = explicitCluster || FALLBACK_CLUSTER
const knownCluster = Object.hasOwn(clusters, requestedCluster)
const defaultRpc = knownCluster ? clusters[requestedCluster].rpc : ''
const customRpc = value('VITE_SOLANA_RPC_URL')
const rpcMatchesKnownCluster = Object.values(clusters).some(cluster => cluster.rpc === customRpc)
export const SOLANA_CLUSTER = explicitCluster
  ? (knownCluster ? requestedCluster : FALLBACK_CLUSTER)
  : (customRpc && !rpcMatchesKnownCluster ? 'custom' : FALLBACK_CLUSTER)
export const SOLANA_CONFIG_ERROR = explicitCluster && !knownCluster
  ? `Unsupported Solana cluster "${explicitCluster}". Use devnet, testnet, or mainnet-beta.`
  : ''
export const SOLANA_NETWORK_NAME = SOLANA_CLUSTER === 'custom' ? 'Custom Solana RPC' : clusters[SOLANA_CLUSTER].name
export const SOLANA_NETWORK_ID = `solana:${SOLANA_CLUSTER}`
export const SOLANA_RPC_URL = customRpc || clusters[SOLANA_CLUSTER]?.rpc || defaultRpc

// A mint and a program are independent Solana public keys.
export const TOKEN_MINT_ADDRESS = value('VITE_SOLANA_TOKEN_MINT')
const programIds = {
  devnet: value('VITE_SOLANA_PROGRAM_ID_DEVNET'),
  testnet: value('VITE_SOLANA_PROGRAM_ID_TESTNET') || 'D7nYqa5Y1a2MQqDQb1NpU5kVS7TxDrj92mbCY9UitHq6',
  'mainnet-beta': value('VITE_SOLANA_PROGRAM_ID_MAINNET'),
}
// Never reuse one cluster's ID on another known cluster. The generic override
// is only for explicitly custom RPC endpoints.
export const PROGRAM_ID = programIds[SOLANA_CLUSTER] || (SOLANA_CLUSTER === 'custom' ? value('VITE_SOLANA_PROGRAM_ID') : '') || ''
// The Anchor instruction/account interface is implemented. Live actions still
// require a deployed program ID and initialized config account on this cluster.
export const PROGRAM_INTERFACE_READY = true

// VITE_TREASURY_ADDRESS is the treasury wallet owner, not an SPL token account.
export const TREASURY_ADDRESS = value('VITE_TREASURY_ADDRESS')
// These are display fallbacks only. Live mint decimals come from getTokenSupply.
export const TOKEN_NAME = value('VITE_TOKEN_NAME')
export const TOKEN_SYMBOL = value('VITE_TOKEN_SYMBOL')
const decimals = Number(value('VITE_TOKEN_DECIMALS') || 9)
export const TOKEN_DECIMALS = Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : 9

export const EXPLORER_URL = (value('VITE_EXPLORER_URL') || 'https://explorer.solana.com').replace(/\/$/, '')
export const EXPLORER_CLUSTER_QUERY = SOLANA_CLUSTER === 'mainnet-beta' || SOLANA_CLUSTER === 'custom' ? '' : `?cluster=${SOLANA_CLUSTER}`
export const NETWORK = {
  chainId: SOLANA_NETWORK_ID,
  name: SOLANA_NETWORK_NAME,
  cluster: SOLANA_CLUSTER,
  nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  rpcUrls: [SOLANA_RPC_URL],
}

