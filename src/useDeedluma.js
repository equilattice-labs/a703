import { ref, computed, onMounted, onUnmounted } from 'vue'
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits, formatUnits, isAddress, ZeroAddress } from 'ethers'
import { ABI, CONTRACT_ADDRESS, NETWORK, CHAIN_ID, RPC_URL, EXPLORER_URL, DEPLOYMENT_BLOCK } from './contract'

const ERRORS = {
  AlreadyClaimed: 'You already claimed this quest.', QuestClosed: 'This quest is closed.', InvalidQuest: 'This quest does not exist.',
  AlreadyVoted: 'This wallet has already voted.', VotingClosed: 'Voting has ended.', InvalidProposal: 'The proposal parameters are invalid.',
  LockActive: 'Your principal is still locked. Check the unlock date.', ZeroAmount: 'The amount or voting power must be greater than zero.',
  MaxSupplyExceeded: 'The token supply cap has been reached.', EnforcedPause: 'The protocol is paused by its steward.',
  OwnableUnauthorizedAccount: 'Only the contract owner can perform this action.', ERC20InsufficientBalance: 'Your DLU balance is too low.',
  ProofNotApproved: 'The steward must approve your contribution before you can claim.'
}
export function useDeedluma() {
  const configured = isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ZeroAddress
  const rpc = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true, batchMaxCount: 10 })
  const contract = configured ? new Contract(CONTRACT_ADDRESS, ABI, rpc) : null
  let injected, accountEpoch = 0, refreshPromise, timer
  const wallet = ref(''), chain = ref(0), token = ref(0n), native = ref(0n), owner = ref(''), treasury = ref('')
  const totalSupply = ref(0n), treasuryBalance = ref(0n), treasuryNative = ref(0n), totalStaked = ref(0n), apr = ref(800n), paused = ref(false)
  const quests = ref([]), proposals = ref([]), activity = ref([]), eventsError = ref(''), accountError = ref(''), readError = ref('')
  const reading = ref(false), ready = ref(false), connecting = ref(false), now = ref(Math.floor(Date.now() / 1000)), lastRead = ref('')
  const position = ref({ amount: 0n, unlockAt: 0n, yield: 0n })
  const txState = ref({ stage: 'idle', label: '', hash: '', message: '' })
  const connected = computed(() => Boolean(wallet.value))
  const wrongChain = computed(() => connected.value && chain.value !== CHAIN_ID)
  const isOwner = computed(() => connected.value && wallet.value.toLowerCase() === owner.value.toLowerCase())
  const busy = computed(() => ['preparing', 'wallet', 'pending'].includes(txState.value.stage))
  const canWrite = computed(() => configured && ready.value && !busy.value && !paused.value)
  const unlocked = computed(() => Number(position.value.unlockAt) <= now.value)
  const short = a => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''
  const chainNumber = value => typeof value === 'string' && value.startsWith('0x') ? parseInt(value, 16) : Number(value)
  const units = (value, precision = 4) => Number(formatUnits(value || 0n, 18)).toLocaleString('en-US', { maximumFractionDigits: precision })
  const exact = value => formatUnits(value || 0n, 18)
  const date = value => value ? new Date(Number(value) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not set'
  const explorer = (kind, value) => `${EXPLORER_URL}/${kind}/${value}`
  function readableError(e) {
    if (e.code === 4001 || e.code === 'ACTION_REJECTED') return 'Request cancelled in your wallet. Nothing was submitted.'
    if (e.code === 'INSUFFICIENT_FUNDS') return 'You need testnet ETH to pay transaction gas.'
    const name = e.revert?.name || e.reason?.split('(')[0]
    if (ERRORS[name]) return ERRORS[name]
    const reason = e.shortMessage || e.reason || e.message || 'Unexpected error. Please retry.'
    return reason.length > 220 ? reason.slice(0, 220) + '...' : reason
  }
  function notify(message) { txState.value = { stage: 'error', label: 'Action unavailable', message, hash: '' } }
  function resetAccount() {
    ++accountEpoch; token.value = 0n; native.value = 0n; accountError.value = ''
    position.value = { amount: 0n, unlockAt: 0n, yield: 0n }
    quests.value = quests.value.map(q => ({ ...q, claimed: false }))
    proposals.value = proposals.value.map(p => ({ ...p, voted: false }))
  }
  async function hydrate() {
    const address = wallet.value, epoch = accountEpoch
    if (!address) return
    try {
      const amount = await rpc.getBalance(address)
      if (epoch !== accountEpoch) return
      native.value = amount
      if (!contract || !ready.value) return
      const [balance, p, yieldValue] = await Promise.all([contract.balanceOf(address), contract.positions(address), contract.pendingYield(address)])
      if (epoch !== accountEpoch) return
      token.value = balance; position.value = { amount: p.amount, unlockAt: p.unlockAt, yield: yieldValue }
      const [claimed, voted] = await Promise.all([
        Promise.all(quests.value.map(q => contract.hasClaimedQuest(q.id, address))),
        Promise.all(proposals.value.map(p => contract.hasVoted(p.id, address)))
      ])
      if (epoch !== accountEpoch) return
      quests.value = quests.value.map((q, i) => ({ ...q, claimed: claimed[i] }))
      proposals.value = proposals.value.map((p, i) => ({ ...p, voted: voted[i] }))
      accountError.value = ''
    } catch (e) { if (epoch === accountEpoch) accountError.value = `Wallet balances could not refresh: ${readableError(e)}` }
  }
  async function loadEvents(block) {
    try {
      // A bounded window avoids provider range limits. The explorer retains the full history.
      const fromBlock = Math.max(DEPLOYMENT_BLOCK, block - 1999)
      const logs = await rpc.getLogs({ address: CONTRACT_ADDRESS, fromBlock, toBlock: block })
      activity.value = logs.map(log => {
        try { const event = contract.interface.parseLog(log); return event && { name: event.name, hash: log.transactionHash, index: log.index, block: log.blockNumber, args: event.args } } catch { return null }
      }).filter(Boolean).filter(x => x.name !== 'Transfer').reverse().slice(0, 15)
      eventsError.value = ''
    } catch (e) { eventsError.value = `Recent logs could not load: ${readableError(e)}` }
  }
  async function refresh() {
    if (!configured) return
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      reading.value = true; readError.value = ''
      try {
        const [code, network] = await Promise.all([rpc.getCode(CONTRACT_ADDRESS), rpc.getNetwork()])
        if (Number(network.chainId) !== CHAIN_ID) throw new Error('The configured RPC is on a different chain.')
        if (code === '0x') throw new Error('No contract exists at the configured address on this network.')
        const [qCount, pCount, ownerAddress, supply, reserve, rate, isPaused, block] = await Promise.all([
          contract.nextQuestId(), contract.nextProposalId(), contract.owner(), contract.totalSupply(), contract.balanceOf(CONTRACT_ADDRESS), contract.APR_BPS(), contract.paused(), rpc.getBlockNumber()
        ])
        owner.value = ownerAddress; totalSupply.value = supply; totalStaked.value = reserve; apr.value = rate; paused.value = isPaused
        // Treasury is explicit in new deployments; legacy deployments use the owner as treasury.
        treasury.value = contract.interface.hasFunction('treasury') ? await contract.treasury().catch(() => ownerAddress) : ownerAddress
        const [treasuryTokens, treasuryEth, questRows, proposalRows] = await Promise.all([
          contract.balanceOf(treasury.value), rpc.getBalance(treasury.value),
          Promise.all(Array.from({ length: Number(qCount) }, async (_, id) => { const q = await contract.quests(id); return { id, title: q.title, reward: q.reward, expiresAt: Number(q.expiresAt), maxClaims: Number(q.maxClaims), claims: Number(q.claims), active: q.active, claimed: false } })),
          Promise.all(Array.from({ length: Number(pCount) }, async (_, id) => { const p = await contract.proposals(id); return { id, description: p.description, forVotes: p.forVotes, againstVotes: p.againstVotes, endsAt: Number(p.endsAt), executed: p.executed, voted: false } }))
        ])
        treasuryBalance.value = treasuryTokens; treasuryNative.value = treasuryEth; quests.value = questRows; proposals.value = proposalRows
        ready.value = true; lastRead.value = new Date().toLocaleTimeString('en-US')
        await Promise.all([hydrate(), loadEvents(block)])
      } catch (e) { readError.value = readableError(e); ready.value = false }
      finally { reading.value = false; refreshPromise = undefined }
    })()
    return refreshPromise
  }
  async function connect() {
    if (!window.ethereum) { notify('Install MetaMask or another EVM wallet, then reload this page.'); return false }
    if (connecting.value) return false
    connecting.value = true
    try {
      const addresses = await window.ethereum.request({ method: 'eth_requestAccounts' })
      resetAccount(); wallet.value = addresses[0] || ''
      chain.value = chainNumber(await window.ethereum.request({ method: 'eth_chainId' }))
      await hydrate(); return Boolean(wallet.value)
    } catch (e) { notify(readableError(e)); return false }
    finally { connecting.value = false }
  }
  async function switchNetwork() {
    if (!window.ethereum) return notify('Connect an EVM wallet first.')
    try {
      try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: NETWORK.chainId }] }) }
      catch (e) {
        if (e.code !== 4902 && e.data?.originalError?.code !== 4902) throw e
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [NETWORK] })
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: NETWORK.chainId }] })
      }
      chain.value = chainNumber(await window.ethereum.request({ method: 'eth_chainId' }))
      return chain.value === CHAIN_ID
    } catch (e) { notify(readableError(e)); return false }
  }
  async function transact(label, action) {
    if (busy.value) return false
    if (!configured) { notify('This is a sample preview. Configure a deployed contract to transact.'); return false }
    if (!ready.value) { notify('Contract data is unavailable. Refresh before transacting.'); return false }
    if (paused.value) { notify('The protocol is paused. Please wait for the steward to resume it.'); return false }
    txState.value = { stage: 'preparing', label, message: 'Checking wallet and network...', hash: '' }
    try {
      if (!wallet.value && !await connect()) return false
      chain.value = chainNumber(await window.ethereum.request({ method: 'eth_chainId' }))
      if (chain.value !== CHAIN_ID) { notify('Switch to Robinhood Chain Testnet before submitting.'); return false }
      const p = new BrowserProvider(window.ethereum)
      const signer = await p.getSigner(wallet.value)
      txState.value = { stage: 'wallet', label, message: 'Review and confirm in your wallet.', hash: '' }
      const result = await action(new Contract(CONTRACT_ADDRESS, ABI, signer))
      txState.value = { stage: 'pending', label, message: 'Submitted. Waiting for confirmation...', hash: result.hash }
      const receipt = await result.wait()
      if (!receipt || receipt.status !== 1) throw new Error('The transaction reverted.')
      txState.value = { stage: 'success', label, message: 'Confirmed on Robinhood Chain.', hash: receipt.hash }
      await refresh(); return true
    } catch (e) {
      if (e.code === 'TRANSACTION_REPLACED' && !e.cancelled && e.receipt?.status === 1) {
        txState.value = { stage: 'success', label, message: 'Replacement transaction confirmed.', hash: e.receipt.hash }; await refresh(); return true
      }
      txState.value = { stage: 'error', label, message: readableError(e), hash: txState.value.hash }; return false
    } finally { if (txState.value.stage === 'preparing') txState.value = { stage: 'idle', label: '', message: '', hash: '' } }
  }
  function questStatus(q) {
    if (q.sample) return 'Sample'
    if (q.claimed) return 'Claimed'
    if (!q.active) return 'Paused'
    if (q.expiresAt <= now.value) return 'Expired'
    if (q.claims >= q.maxClaims) return 'Filled'
    return 'Open'
  }
  function proposalStatus(p) { return p.sample ? 'Sample' : p.endsAt <= now.value ? 'Closed' : p.voted ? 'Voted' : 'Open' }
  function votePercent(p) { const total = p.forVotes + p.againstVotes; return total ? Number(p.forVotes * 10000n / total) / 100 : 0 }
  function parseAmount(input, label = 'Amount') {
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(String(input).trim())) throw new Error(`${label} must be a positive decimal number.`)
    let amount; try { amount = parseUnits(String(input).trim(), 18) } catch { throw new Error(`${label} supports up to 18 decimal places.`) }
    if (amount <= 0n) throw new Error(`${label} must be greater than zero.`)
    return amount
  }
  async function accountsChanged(addresses) { resetAccount(); wallet.value = addresses[0] || ''; await hydrate() }
  async function chainChanged(value) { chain.value = chainNumber(value); resetAccount(); await hydrate() }
  onMounted(async () => {
    injected = window.ethereum
    injected?.on?.('accountsChanged', accountsChanged); injected?.on?.('chainChanged', chainChanged)
    if (injected) { try { wallet.value = (await injected.request({ method: 'eth_accounts' }))[0] || ''; chain.value = chainNumber(await injected.request({ method: 'eth_chainId' })) } catch { /* wallet remains disconnected */ } }
    await refresh()
    timer = setInterval(() => { now.value = Math.floor(Date.now() / 1000); if (!busy.value) refresh() }, 20000)
  })
  onUnmounted(() => { clearInterval(timer); injected?.removeListener?.('accountsChanged', accountsChanged); injected?.removeListener?.('chainChanged', chainChanged); rpc.destroy() })
  return { configured, wallet, chain, token, native, owner, treasury, totalSupply, treasuryBalance, treasuryNative, totalStaked, apr, paused, quests, proposals, activity, eventsError, accountError, readError, reading, ready, lastRead, connected, wrongChain, isOwner, busy, canWrite, unlocked, position, txState, connecting, short, units, exact, date, explorer, readableError, notify, refresh, connect, switchNetwork, transact, questStatus, proposalStatus, votePercent, parseAmount }
}
