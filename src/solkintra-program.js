import { AnchorProvider, BN, Program, web3 } from '@coral-xyz/anchor'
import idl from './idl/solkintra.json' with { type: 'json' }

const encoder = new TextEncoder()
const seed = value => encoder.encode(value)
const u64Bytes = value => {
  let number = BigInt(value?.toString?.() ?? value)
  if (number < 0n || number > 0xffffffffffffffffn) throw new Error('Invalid on-chain identifier.')
  const bytes = new Uint8Array(8)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number(number & 255n)
    number >>= 8n
  }
  return bytes
}

export const communityPda = programId => web3.PublicKey.findProgramAddressSync(
  [seed('config')], new web3.PublicKey(programId),
)[0]

export const questPda = (programId, id) => web3.PublicKey.findProgramAddressSync(
  [seed('quest'), u64Bytes(id)], new web3.PublicKey(programId),
)[0]

export const claimPda = (programId, id, owner) => web3.PublicKey.findProgramAddressSync(
  [seed('claim'), u64Bytes(id), new web3.PublicKey(owner).toBytes()],
  new web3.PublicKey(programId),
)[0]

export const proposalPda = (programId, id) => web3.PublicKey.findProgramAddressSync(
  [seed('proposal'), u64Bytes(id)], new web3.PublicKey(programId),
)[0]

export const votePda = (programId, id, owner) => web3.PublicKey.findProgramAddressSync(
  [seed('vote'), u64Bytes(id), new web3.PublicKey(owner).toBytes()],
  new web3.PublicKey(programId),
)[0]

export function createProgramClient(programId, rpcUrl, walletApi = null) {
  if (!programId) throw new Error('No Solana program is configured for this cluster.')
  const connection = new web3.Connection(rpcUrl, { commitment: 'confirmed' })
  const publicKey = walletApi?.publicKey
    ? new web3.PublicKey(walletApi.publicKey.toString())
    : web3.PublicKey.default
  const wallet = {
    publicKey,
    signTransaction: async transaction => {
      if (!walletApi?.signTransaction) throw new Error('Connect a Solana wallet to sign this transaction.')
      return walletApi.signTransaction.call(walletApi, transaction)
    },
    signAllTransactions: async transactions => {
      if (!walletApi?.signAllTransactions) throw new Error('Connect a Solana wallet to sign these transactions.')
      return walletApi.signAllTransactions.call(walletApi, transactions)
    },
  }
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
  return new Program({ ...idl, address: programId }, provider)
}

const bigint = value => BigInt(value?.toString?.() ?? value ?? 0)
const numeric = value => Number(value?.toString?.() ?? value ?? 0)

export async function fetchCommunity(program, walletAddress = '') {
  const programId = program.programId
  const [configAddress] = web3.PublicKey.findProgramAddressSync(
    [seed('config')], programId,
  )
  const config = await program.account.config.fetchNullable(configAddress)
  if (!config) return { initialized: false, authority: '', paused: false, quests: [], proposals: [] }

  const [questRows, proposalRows] = await Promise.all([
    program.account.quest.all(),
    program.account.proposal.all(),
  ])
  const questAccounts = questRows.map(row => row.account)
  const proposalAccounts = proposalRows.map(row => row.account)
  const receiptKeys = walletAddress
    ? [
      ...questAccounts.map(quest => claimPda(programId, quest.id, walletAddress)),
      ...proposalAccounts.map(proposal => votePda(programId, proposal.id, walletAddress)),
    ]
    : []
  const receipts = receiptKeys.length
    ? await program.provider.connection.getMultipleAccountsInfo(receiptKeys, 'confirmed')
    : []
  const claimOffset = 0
  const voteOffset = questAccounts.length

  const quests = questAccounts.map((quest, index) => ({
    id: numeric(quest.id),
    title: quest.title,
    detail: quest.details,
    claims: numeric(quest.claimCount),
    maxClaims: numeric(quest.maxClaims),
    expiresAt: numeric(quest.expiresAt),
    active: quest.active,
    claimed: Boolean(receipts[claimOffset + index]),
    reward: 0n,
    sample: false,
  })).sort((left, right) => left.id - right.id)

  const proposals = proposalAccounts.map((proposal, index) => ({
    id: numeric(proposal.id),
    description: proposal.description,
    creator: proposal.creator.toBase58(),
    endsAt: numeric(proposal.endsAt),
    forVotes: bigint(proposal.forVotes),
    againstVotes: bigint(proposal.againstVotes),
    voted: Boolean(receipts[voteOffset + index]),
    sample: false,
  })).sort((left, right) => left.id - right.id)

  return {
    initialized: true,
    authority: config.authority.toBase58(),
    paused: config.paused,
    quests,
    proposals,
  }
}

export function asAnchorU64(value) {
  return new BN(value?.toString?.() ?? String(value))
}
