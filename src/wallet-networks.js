const clusterChains = {
  'mainnet-beta': ['solana:mainnet', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
  devnet: ['solana:devnet', 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'],
  testnet: ['solana:testnet', 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z'],
}

export function supportsSolanaCluster(chains, cluster) {
  if (cluster === 'custom') return (chains || []).some(chain => String(chain).startsWith('solana:'))
  return (clusterChains[cluster] || []).some(chain => (chains || []).includes(chain))
}
