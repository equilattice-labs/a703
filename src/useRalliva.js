import { ref, computed, onMounted, onUnmounted } from 'vue'
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits, formatUnits, isAddress, ZeroAddress } from 'ethers'
import { ABI, CONTRACT_ADDRESS, TREASURY_ADDRESS, NETWORK, CHAIN_ID, RPC_URL, EXPLORER_URL, DEPLOYMENT_BLOCK } from './contract'

const ERRORS = {
  AlreadyClaimed: 'You already claimed this quest.', QuestClosed: 'This quest is closed.', InvalidQuest: 'This quest does not exist.',
  AlreadyVoted: 'This wallet has already voted.', VotingClosed: 'Voting has ended.', InvalidProposal: 'The proposal parameters are invalid.',
  LockActive: 'Your principal is still locked. Check the unlock date.', ZeroAmount: 'The amount or voting power must be greater than zero.',
  MaxSupplyExceeded: 'The token supply cap has been reached.', EnforcedPause: 'The protocol is paused by its steward.',
  OwnableUnauthorizedAccount: 'Only the contract owner can perform this action.',
  ProofNotApproved: 'The steward must approve your contribution before you can claim.'
}
export function useRalliva() {
  const configured = isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ZeroAddress
  const rpc = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true, batchMaxCount: 10 })
  const contract = configured ? new Contract(CONTRACT_ADDRESS, ABI, rpc) : null
  // Application branding is independent of the deployed ERC-20 identity.
  const tokenName = ref(configured ? '' : 'Deedluma'), tokenSymbol = ref(configured ? 'token' : 'DLU')
  let injected, accountEpoch = 0, hydrationId = 0, refreshPromise, timer
  const wallet = ref(''), chain = ref(0), token = ref(0n), native = ref(0n), owner = ref(''), treasury = ref('')
  const totalSupply = ref(0n), treasuryBalance = ref(0n), treasuryNative = ref(0n), totalStaked = ref(0n), apr = ref(800n), paused = ref(false)
  const quests = ref([]), proposals = ref([]), activity = ref([]), eventsError = ref(''), accountError = ref(''), readError = ref('')
  const reading = ref(false), ready = ref(false), connecting = ref(false), now = ref(Math.floor(Date.now() / 1000)), lastRead = ref('')
  const accountReading = ref(false), accountReady = ref(false), treasuryKnown = ref(false), treasuryError = ref(''), switching = ref(false)
  const position = ref({ amount: 0n, unlockAt: 0n, yield: 0n })
  const txState = ref({ stage: 'idle', label: '', hash: '', message: '' })
  const connected = computed(() => Boolean(wallet.value))
  const wrongChain = computed(() => connected.value && chain.value !== CHAIN_ID)
  const isOwner = computed(() => ready.value && connected.value && wallet.value.toLowerCase() === owner.value.toLowerCase())
  const busy = computed(() => ['preparing', 'wallet', 'pending'].includes(txState.value.stage))
  const canWrite = computed(() => configured && ready.value && !reading.value && !busy.value && !paused.value && !connecting.value && !switching.value && !wrongChain.value && (!connected.value || accountReady.value))
  const unlocked = computed(() => Number(position.value.unlockAt) <= now.value)
  const short = a => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''
  const chainNumber = value => typeof value === 'string' && value.startsWith('0x') ? parseInt(value, 16) : Number(value)
  const units = (value, precision = 4) => Number(formatUnits(value || 0n, 18)).toLocaleString('en-US', { maximumFractionDigits: precision })
  const exact = value => formatUnits(value || 0n, 18)
  const date = value => value ? new Date(Number(value) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not set'
  const explorer = (kind, value) => `${EXPLORER_URL}/${kind}/${value}`
  function readableError(e) {
    if (e.code === 4001 || e.code === 'ACTION_REJECTED') return 'Request cancelled in your wallet. Nothing was submitted.'
    if (e.code === 'INSUFFICIENT_FUNDS') return 'You need testnet USDC to pay transaction gas.'
    const name = e.revert?.name || e.reason?.split('(')[0]
    if (name === 'ERC20InsufficientBalance') return `Your ${tokenSymbol.value} balance is too low.`
    if (ERRORS[name]) return ERRORS[name]
    const reason = e.shortMessage || e.reason || e.message || 'Unexpected error. Please retry.'
    return reason.length > 220 ? reason.slice(0, 220) + '...' : reason
  }
  function notify(message, stage = 'error') { if (busy.value) return; txState.value = { stage, label: stage === 'info' ? 'Preview mode' : 'Action unavailable', message, hash: '' } }
  function invalidateAccountRead(preservePrevious = false) {
    ++hydrationId; accountReading.value = false
    if (!preservePrevious) accountReady.value = false
  }
  function resetAccount() {
    ++accountEpoch; invalidateAccountRead(); token.value = 0n; native.value = 0n; accountError.value = ''
    position.value = { amount: 0n, unlockAt: 0n, yield: 0n }
    quests.value = quests.value.map(q => ({ ...q, claimed: false }))
    proposals.value = proposals.value.map(p => ({ ...p, voted: false }))
  }
  async function hydrate() {
    const address = wallet.value, epoch = accountEpoch, requestId = ++hydrationId
    if (!address || !contract || !ready.value) { accountReading.value = false; accountReady.value = false; return false }
    accountReading.value = true; accountError.value = ''
    const questRows = quests.value, proposalRows = proposals.value
    const current = () => epoch === accountEpoch && requestId === hydrationId && ready.value
    try {
      const [amount, balance, p, yieldValue, claimed, voted] = await Promise.all([
        rpc.getBalance(address), contract.balanceOf(address), contract.positions(address), contract.pendingYield(address),
        Promise.all(questRows.map(q => contract.hasClaimedQuest(q.id, address))),
        Promise.all(proposalRows.map(p => contract.hasVoted(p.id, address)))
      ])
      if (!current()) return false
      native.value = amount; token.value = balance; position.value = { amount: p.amount, unlockAt: p.unlockAt, yield: yieldValue }
      quests.value = questRows.map((q, i) => ({ ...q, claimed: claimed[i] }))
      proposals.value = proposalRows.map((p, i) => ({ ...p, voted: voted[i] }))
      accountError.value = ''; accountReady.value = true
      return true
    } catch (e) {
      if (current()) { accountReady.value = false; accountError.value = `Wallet data could not refresh: ${readableError(e)}` }
      return false
    } finally { if (requestId === hydrationId) accountReading.value = false }
  }
  async function readTreasury() {
    try {
      const address = TREASURY_ADDRESS || (contract.interface.hasFunction('treasury') ? await contract.treasury() : '')
      if (!address) return { address: '', balance: 0n, native: 0n, known: false, error: '' }
      if (!isAddress(address) || address === ZeroAddress) throw new Error('The treasury address is invalid.')
      const [balance, amount] = await Promise.all([contract.balanceOf(address), rpc.getBalance(address)])
      return { address, balance, native: amount, known: true, error: '' }
    } catch (e) {
      return { address: '', balance: 0n, native: 0n, known: false, error: `Treasury data is unavailable: ${readableError(e)}` }
    }
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
    } catch (e) { activity.value = []; eventsError.value = `Recent logs could not load: ${readableError(e)}` }
  }
  async function refresh() {
    if (!configured) return false
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      // Retain the last successful view while syncing; reading blocks writes.
      // Invalidating the request ID prevents earlier hydration from replacing it.
      reading.value = true; readError.value = ''; invalidateAccountRead(true)
      try {
        // getNetwork() only returns the configured chain when staticNetwork is enabled.
        if (chainNumber(await rpc.send('eth_chainId', [])) !== CHAIN_ID) throw new Error('The configured RPC is on a different chain.')
        const code = await rpc.getCode(CONTRACT_ADDRESS)
        if (code === '0x') throw new Error('No contract exists at the configured address on this network.')
        const [name, symbol, qCount, pCount, ownerAddress, supply, reserve, rate, isPaused, block] = await Promise.all([
          contract.name(), contract.symbol(), contract.nextQuestId(), contract.nextProposalId(), contract.owner(), contract.totalSupply(), contract.balanceOf(CONTRACT_ADDRESS), contract.APR_BPS(), contract.paused(), rpc.getBlockNumber()
        ])
        if (!name.trim() || !symbol.trim()) throw new Error('The configured contract did not provide a token name and symbol.')
        const [treasuryData, questRows, proposalRows] = await Promise.all([
          readTreasury(),
          Promise.all(Array.from({ length: Number(qCount) }, async (_, id) => { const q = await contract.quests(id); return { id, title: q.title, reward: q.reward, expiresAt: Number(q.expiresAt), maxClaims: Number(q.maxClaims), claims: Number(q.claims), active: q.active, claimed: false } })),
          Promise.all(Array.from({ length: Number(pCount) }, async (_, id) => { const p = await contract.proposals(id); return { id, description: p.description, forVotes: p.forVotes, againstVotes: p.againstVotes, endsAt: Number(p.endsAt), executed: p.executed, voted: false } }))
        ])
        tokenName.value = name; tokenSymbol.value = symbol
        owner.value = ownerAddress; totalSupply.value = supply; totalStaked.value = reserve; apr.value = rate; paused.value = isPaused
        treasury.value = treasuryData.address; treasuryBalance.value = treasuryData.balance; treasuryNative.value = treasuryData.native
        treasuryKnown.value = treasuryData.known; treasuryError.value = treasuryData.error
        // Keep per-account badges stable until the fresh account read commits.
        const previousClaims = new Map(quests.value.map(q => [q.id, q.claimed]))
        const previousVotes = new Map(proposals.value.map(p => [p.id, p.voted]))
        quests.value = questRows.map(q => ({ ...q, claimed: previousClaims.get(q.id) || false }))
        proposals.value = proposalRows.map(p => ({ ...p, voted: previousVotes.get(p.id) || false }))
        ready.value = true; lastRead.value = new Date().toLocaleTimeString('en-US')
        await Promise.all([hydrate(), loadEvents(block)])
        return true
      } catch (e) {
        readError.value = readableError(e); ready.value = false; lastRead.value = ''
        resetAccount(); owner.value = ''; treasury.value = ''; treasuryKnown.value = false
        tokenName.value = ''; tokenSymbol.value = 'token'; apr.value = 0n; paused.value = false
        treasuryBalance.value = 0n; treasuryNative.value = 0n; totalSupply.value = 0n; totalStaked.value = 0n
        quests.value = []; proposals.value = []; activity.value = []
        return false
      }
      finally { reading.value = false; refreshPromise = undefined }
    })()
    return refreshPromise
  }
  async function requestWallet() {
    if (!window.ethereum) throw new Error('Install MetaMask or another EVM wallet, then reload this page.')
    if (connecting.value) return false
    connecting.value = true
    try {
      const addresses = await window.ethereum.request({ method: 'eth_requestAccounts' })
      resetAccount(); wallet.value = addresses[0] || ''
      chain.value = chainNumber(await window.ethereum.request({ method: 'eth_chainId' }))
      await hydrate(); return Boolean(wallet.value)
    } finally { connecting.value = false }
  }
  async function connect() {
    if (busy.value || connecting.value || switching.value) return false
    try { return await requestWallet() }
    catch (e) { notify(readableError(e)); return false }
  }
  async function switchNetwork() {
    if (busy.value || connecting.value || switching.value) return false
    if (!window.ethereum) { notify('Connect an EVM wallet first.'); return false }
    switching.value = true
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
    finally { switching.value = false }
  }
  async function transact(label, action) {
    if (busy.value || connecting.value || switching.value) return false
    if (!configured) { notify('This is a sample preview. Configure a deployed contract to transact.'); return false }
    if (!ready.value || reading.value) { notify('Contract data is unavailable or refreshing. Wait for a successful sync before transacting.'); return false }
    if (paused.value) { notify('The protocol is paused. Please wait for the steward to resume it.'); return false }
    txState.value = { stage: 'preparing', label, message: 'Checking wallet and network...', hash: '' }
    let signerProvider
    try {
      if (!wallet.value && !await requestWallet()) throw new Error('No wallet account is selected.')
      const ethereum = window.ethereum, address = wallet.value, epoch = accountEpoch
      if (!ethereum) throw new Error('Reconnect your EVM wallet before submitting.')
      async function assertWallet() {
        const [addresses, network] = await Promise.all([
          ethereum.request({ method: 'eth_accounts' }), ethereum.request({ method: 'eth_chainId' })
        ])
        chain.value = chainNumber(network)
        if (chain.value !== CHAIN_ID) throw new Error('Switch to Arc Chain Testnet before submitting.')
        if (epoch !== accountEpoch || ethereum !== window.ethereum || wallet.value.toLowerCase() !== address.toLowerCase() || addresses[0]?.toLowerCase() !== address.toLowerCase()) {
          throw new Error('Your wallet account or network changed. Review the current account and try again.')
        }
      }
      function assertReadState() {
        if (!ready.value || reading.value || !accountReady.value || accountReading.value) throw new Error('Wallet or contract data changed. Wait for a successful refresh and try again.')
        if (paused.value) throw new Error('The protocol is paused. Please wait for the steward to resume it.')
      }
      await assertWallet()
      if (!await hydrate()) throw new Error(accountError.value || 'Wallet data could not be verified. Refresh before submitting.')
      signerProvider = new BrowserProvider(ethereum, CHAIN_ID)
      const signer = await signerProvider.getSigner(address)
      await assertWallet(); assertReadState()
      // Check again at the send boundary, after ethers has populated the call.
      // The explicit chain ID also prevents a wallet from signing it for another chain.
      const guardedSigner = {
        provider: signerProvider,
        getAddress: () => signer.getAddress(),
        resolveName: name => signer.resolveName(name),
        call: transaction => signer.call(transaction),
        estimateGas: transaction => signer.estimateGas(transaction),
        sendTransaction: async transaction => {
          await assertWallet(); assertReadState()
          return signer.sendTransaction({ ...transaction, chainId: CHAIN_ID })
        }
      }
      txState.value = { stage: 'wallet', label, message: 'Review and confirm in your wallet.', hash: '' }
      const result = await action(new Contract(CONTRACT_ADDRESS, ABI, guardedSigner))
      txState.value = { stage: 'pending', label, message: 'Submitted. Waiting for confirmation...', hash: result.hash }
      const receipt = await result.wait()
      if (!receipt || receipt.status !== 1) throw new Error('The transaction reverted.')
      txState.value = { stage: 'success', label, message: 'Confirmed on Arc Chain.', hash: receipt.hash }
      await refresh(); return true
    } catch (e) {
      if (e.code === 'TRANSACTION_REPLACED' && !e.cancelled && e.receipt?.status === 1) {
        txState.value = { stage: 'success', label, message: 'Replacement transaction confirmed.', hash: e.receipt.hash }; await refresh(); return true
      }
      txState.value = { stage: 'error', label, message: readableError(e), hash: txState.value.hash }; return false
    } finally {
      signerProvider?.destroy()
      if (txState.value.stage === 'preparing') txState.value = { stage: 'idle', label: '', message: '', hash: '' }
    }
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
    timer = setInterval(() => { now.value = Math.floor(Date.now() / 1000); if (!busy.value && !connecting.value && !switching.value) refresh() }, 20000)
  })
  onUnmounted(() => { clearInterval(timer); injected?.removeListener?.('accountsChanged', accountsChanged); injected?.removeListener?.('chainChanged', chainChanged); rpc.destroy() })
  return { configured, wallet, chain, token, tokenName, tokenSymbol, native, owner, treasury, treasuryKnown, treasuryError, totalSupply, treasuryBalance, treasuryNative, totalStaked, apr, paused, quests, proposals, activity, eventsError, accountError, accountReading, accountReady, readError, reading, ready, lastRead, connected, wrongChain, isOwner, busy, canWrite, unlocked, position, txState, connecting, switching, short, units, exact, date, explorer, readableError, notify, refresh, connect, switchNetwork, transact, questStatus, proposalStatus, votePercent, parseAmount }
}

