import { ref, shallowRef, markRaw, computed, onMounted, onUnmounted, getCurrentInstance } from 'vue'
import { getWallets } from '@wallet-standard/app'
import { StandardWalletAdapter } from '@solana/wallet-standard-wallet-adapter-base'
import { createSolanaClient } from '@metamask/connect-solana'
import {
  SOLANA_RPC_URL, SOLANA_CLUSTER, SOLANA_NETWORK_NAME, SOLANA_CONFIG_ERROR,
  EXPLORER_URL, EXPLORER_CLUSTER_QUERY, TOKEN_MINT_ADDRESS, PROGRAM_ID,
  PROGRAM_INTERFACE_READY, TREASURY_ADDRESS, TOKEN_NAME, TOKEN_SYMBOL,
  TOKEN_DECIMALS,
} from './solana.js'
import { web3 } from '@coral-xyz/anchor'
import { supportsSolanaCluster } from './wallet-networks.js'
import {
  asAnchorU64, claimPda, communityPda, createProgramClient,
  fetchCommunity, proposalPda, questPda, votePda,
} from './solkintra-program.js'

const rpcRequest = async (method, params = []) => {
  if (SOLANA_CONFIG_ERROR) throw new Error(SOLANA_CONFIG_ERROR)
  const response = await fetch(SOLANA_RPC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  })
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}.`)
  const body = await response.json()
  if (body.error) throw new Error(body.error.message || 'Solana RPC request failed.')
  return body.result
}

const keyString = value => typeof value === 'string' ? value : value?.toString?.() || ''
const lamports = value => BigInt(value || 0)
const parseUnits = (input, decimals) => {
  const [whole, fraction = ''] = String(input).trim().split('.')
  if (fraction.length > decimals) throw new Error('Too many decimal places.')
  return BigInt(whole || 0) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || 0)
}
const formatUnits = (value, decimals) => {
  const raw = BigInt(value || 0)
  const base = 10n ** BigInt(decimals)
  const whole = raw / base
  const fraction = (raw % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}
const accountTokenAmount = row => BigInt(row?.account?.data?.parsed?.info?.tokenAmount?.amount || 0)
const supportedCluster = value => {
  const normalized = String(value || '').toLowerCase().replace(/_/g, '-')
  return normalized === 'mainnet' ? 'mainnet-beta' : normalized
}

export function useSolkintra() {
  // Token reads and program actions are independent. Quest/vote actions use
  // the Anchor interface; staking remains unavailable until a mint is supplied.
  const mintConfigured = Boolean(TOKEN_MINT_ADDRESS)
  const configured = Boolean(PROGRAM_ID)
  const programReady = ref(false)
  const tokenName = ref(TOKEN_NAME || (mintConfigured ? '' : 'Solkintra preview token'))
  const tokenSymbol = ref(TOKEN_SYMBOL || (mintConfigured ? 'SPL' : 'SKTR'))
  const tokenDecimals = ref(TOKEN_DECIMALS)
  const tokenDecimalsKnown = ref(false)
  let injected, walletEpoch = 0, refreshPromise, timer
  let walletRegistry, walletRegistryOff, walletRegistryUnregisterOff, metamaskClient, metamaskRegistrationTimer, standardAdapter
  let injectedAccountListener, injectedDisconnectListener
  const wallet = ref(''), token = ref(0n), native = ref(0n), owner = ref(''), treasury = ref(TREASURY_ADDRESS)
  const totalSupply = ref(0n), treasuryBalance = ref(0n), treasuryNative = ref(0n), paused = ref(false)
  const quests = ref([]), proposals = ref([]), activity = ref([]), eventsError = ref(''), accountError = ref(''), readError = ref('')
  const reading = ref(false), ready = ref(false), connecting = ref(false), now = ref(Math.floor(Date.now() / 1000)), lastRead = ref('')
  const accountReading = ref(false), accountReady = ref(false), treasuryKnown = ref(false), treasuryNativeKnown = ref(false), treasuryTokenKnown = ref(false), treasuryError = ref('')
  const txState = ref({ stage: 'idle', label: '', hash: '', message: '' })
  const walletOptions = shallowRef([])
  const walletPickerOpen = ref(false)
  const connected = computed(() => Boolean(wallet.value))
  const isOwner = computed(() => Boolean(owner.value && wallet.value && owner.value === wallet.value))
  const busy = computed(() => ['preparing', 'wallet', 'pending'].includes(txState.value.stage))
  const canWrite = computed(() => programReady.value && ready.value && !reading.value && !busy.value && !paused.value && !connecting.value && (!connected.value || accountReady.value))
  const short = a => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''
  const units = (value, precision = 4) => Number(formatUnits(value || 0n, tokenDecimals.value)).toLocaleString('en-US', { maximumFractionDigits: precision })
  const solUnits = (value, precision = 4) => Number(formatUnits(value || 0n, 9)).toLocaleString('en-US', { maximumFractionDigits: precision })
  const date = value => value ? new Date(Number(value) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not set'
  const explorer = (kind, value) => `${EXPLORER_URL}/${kind === 'tx' ? 'tx' : 'address'}/${value}${EXPLORER_CLUSTER_QUERY}`
  function readableError(e) {
    if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') return 'Wallet request cancelled. Nothing was submitted.'
    const reason = e?.shortMessage || e?.message || 'Unexpected error. Please retry.'
    return reason.length > 220 ? reason.slice(0, 220) + '...' : reason
  }
  function notify(message, stage = 'error') { if (busy.value) return; txState.value = { stage, label: stage === 'info' ? 'Preview mode' : 'Action unavailable', message, hash: '' } }
  function supportsCurrentCluster(candidate) {
    return supportsSolanaCluster(candidate.chains, SOLANA_CLUSTER)
  }
  function standardAccountSupportsCurrentCluster() {
    const account = standardAdapter?.wallet?.accounts?.[0]
    if (!account) return false
    return supportsSolanaCluster(account.chains, SOLANA_CLUSTER)
  }
  function syncWalletOptions() {
    const seen = new Set()
    walletOptions.value = (walletRegistry?.get?.() || [])
      .filter(candidate => supportsCurrentCluster(candidate) && !seen.has(candidate.name) && seen.add(candidate.name))
      .map(markRaw)
  }
  async function setupWalletDiscovery() {
    if (typeof window === 'undefined') return
    walletRegistry = getWallets()
    syncWalletOptions()
    walletRegistryOff = walletRegistry.on('register', syncWalletOptions)
    walletRegistryUnregisterOff = walletRegistry.on('unregister', syncWalletOptions)
    try {
      const metamaskNetwork = SOLANA_CLUSTER === 'mainnet-beta'
        ? 'mainnet'
        : SOLANA_CLUSTER === 'devnet' || SOLANA_CLUSTER === 'testnet'
          ? SOLANA_CLUSTER
          : 'testnet'
      metamaskClient = await createSolanaClient({
        dapp: { name: 'Solkintra', url: window.location.origin },
        api: { supportedNetworks: { [metamaskNetwork]: SOLANA_RPC_URL } },
        analytics: { enabled: false },
      })
      syncWalletOptions()
      metamaskRegistrationTimer = setTimeout(() => {
        syncWalletOptions()
        metamaskRegistrationTimer = undefined
      }, 1250)
    } catch {
      // MetaMask is optional; Phantom and other registered wallets remain available.
    }
  }
  function closeWalletPicker() { walletPickerOpen.value = false }
  function destroyStandardAdapter() {
    standardAdapter?.removeAllListeners?.()
    standardAdapter?.destroy?.()
    standardAdapter = undefined
  }
  function detachWalletDiscovery() {
    if (metamaskRegistrationTimer) { clearTimeout(metamaskRegistrationTimer); metamaskRegistrationTimer = undefined }
    destroyStandardAdapter()
    if (walletRegistryOff) { walletRegistryOff(); walletRegistryOff = undefined }
    if (walletRegistryUnregisterOff) { walletRegistryUnregisterOff(); walletRegistryUnregisterOff = undefined }
  }
  async function chooseWallet(candidate) {
    closeWalletPicker()
    if (!candidate) return false
    try {
      return await requestStandardWallet(candidate)
    } catch (e) {
      notify(readableError(e))
      return false
    }
  }
  function resetAccount() {
    walletEpoch++
    token.value = 0n
    native.value = 0n
    accountReady.value = false
    accountReading.value = false
    accountError.value = ''
    quests.value = quests.value.map(q => ({ ...q, claimed: false }))
    proposals.value = proposals.value.map(p => ({ ...p, voted: false }))
  }

  async function hydrate() {
    if (!wallet.value || !ready.value) { accountReady.value = false; return false }
    const epoch = walletEpoch
    const address = wallet.value
    accountReading.value = true
    accountError.value = ''
    try {
      const balance = await rpcRequest('getBalance', [address])
      if (epoch !== walletEpoch || address !== wallet.value) return false
      const nextNative = lamports(balance?.value)
      let nextToken = 0n
      if (mintConfigured) {
        const result = await rpcRequest('getTokenAccountsByOwner', [address, { mint: TOKEN_MINT_ADDRESS }, { encoding: 'jsonParsed' }])
        if (epoch !== walletEpoch || address !== wallet.value) return false
        const accounts = result?.value || []
        nextToken = accounts.reduce((sum, row) => sum + accountTokenAmount(row), 0n)
        const decimals = accounts.find(row => Number.isInteger(row.account?.data?.parsed?.info?.tokenAmount?.decimals))?.account?.data?.parsed?.info?.tokenAmount?.decimals
        if (Number.isInteger(decimals) && !tokenDecimalsKnown.value) tokenDecimals.value = decimals
      }
      if (epoch !== walletEpoch || address !== wallet.value) return false
      native.value = nextNative
      token.value = nextToken
      accountReady.value = true
      return true
    } catch (e) {
      if (epoch === walletEpoch && address === wallet.value) {
        native.value = 0n
        token.value = 0n
        accountReady.value = false
        accountError.value = `Wallet data could not refresh: ${readableError(e)}`
      }
      return false
    } finally {
      if (epoch === walletEpoch) accountReading.value = false
    }
  }

  async function readTreasury() {
    if (!TREASURY_ADDRESS) return { address: '', balance: 0n, native: 0n, known: false, nativeKnown: false, tokenKnown: false, error: '' }
    let nativeBalance = 0n
    let nativeKnown = false
    let tokenBalance = 0n
    let tokenKnown = false
    const errors = []
    try {
      const result = await rpcRequest('getBalance', [TREASURY_ADDRESS])
      nativeBalance = lamports(result?.value)
      nativeKnown = true
    } catch (e) { errors.push(`SOL balance: ${readableError(e)}`) }
    if (mintConfigured) {
      try {
        const result = await rpcRequest('getTokenAccountsByOwner', [TREASURY_ADDRESS, { mint: TOKEN_MINT_ADDRESS }, { encoding: 'jsonParsed' }])
        tokenBalance = (result?.value || []).reduce((sum, row) => sum + accountTokenAmount(row), 0n)
        tokenKnown = true
      } catch (e) { errors.push(`token balance: ${readableError(e)}`) }
    }
    return {
      address: TREASURY_ADDRESS,
      balance: tokenBalance,
      native: nativeBalance,
      known: nativeKnown && (!mintConfigured || tokenKnown),
      nativeKnown,
      tokenKnown,
      error: errors.length ? `Treasury data is incomplete. ${errors.join(' ')}` : '',
    }
  }

  async function readProgramState() {
    if (!configured || !PROGRAM_INTERFACE_READY) {
      programReady.value = false
      owner.value = ''
      paused.value = false
      quests.value = []
      proposals.value = []
      eventsError.value = ''
      return false
    }
    const epoch = walletEpoch
    const address = wallet.value
    try {
      const program = createProgramClient(PROGRAM_ID, SOLANA_RPC_URL, injected)
      const community = await fetchCommunity(program, address)
      if (epoch !== walletEpoch || address !== wallet.value) return false
      if (!community.initialized) {
        programReady.value = false
        owner.value = ''
        paused.value = false
        quests.value = []
        proposals.value = []
        eventsError.value = 'The program is deployed, but its community account has not been initialized.'
        return false
      }
      owner.value = community.authority
      paused.value = community.paused
      quests.value = community.quests
      proposals.value = community.proposals
      programReady.value = true
      eventsError.value = ''
      return true
    } catch (e) {
      if (epoch === walletEpoch && address === wallet.value) {
        programReady.value = false
        owner.value = ''
        paused.value = false
        quests.value = []
        proposals.value = []
        eventsError.value = `Program data could not refresh: ${readableError(e)}`
      }
      return false
    }
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      reading.value = true
      readError.value = ''
      try {
        const [version, supply, treasuryData] = await Promise.all([
          rpcRequest('getVersion'),
          mintConfigured ? rpcRequest('getTokenSupply', [TOKEN_MINT_ADDRESS]) : null,
          readTreasury(),
        ])
        if (!version) throw new Error(`${SOLANA_NETWORK_NAME} RPC did not respond.`)
        if (mintConfigured) {
          if (!supply?.value) throw new Error('The configured Solana mint did not return supply data.')
          const decimals = Number(supply.value.decimals)
          if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('The mint returned invalid decimal metadata.')
          totalSupply.value = BigInt(supply.value.amount || 0)
          tokenDecimals.value = decimals
          tokenDecimalsKnown.value = true
          tokenName.value = TOKEN_NAME || tokenName.value
          tokenSymbol.value = TOKEN_SYMBOL || tokenSymbol.value
        } else {
          totalSupply.value = 0n
          tokenDecimalsKnown.value = false
        }
        treasury.value = treasuryData.address
        treasuryBalance.value = treasuryData.balance
        treasuryNative.value = treasuryData.native
        treasuryKnown.value = treasuryData.known
        treasuryNativeKnown.value = treasuryData.nativeKnown
        treasuryTokenKnown.value = treasuryData.tokenKnown
        treasuryError.value = treasuryData.error
        ready.value = true
        lastRead.value = new Date().toLocaleTimeString('en-US')
        await readProgramState()
        await hydrate()
        return true
      } catch (e) {
        readError.value = readableError(e)
        ready.value = false
        totalSupply.value = 0n
        tokenDecimalsKnown.value = false
        treasuryBalance.value = 0n
        treasuryNative.value = 0n
        treasuryKnown.value = false
        treasuryNativeKnown.value = false
        treasuryTokenKnown.value = false
        treasuryError.value = ''
        programReady.value = false
        owner.value = ''
        paused.value = false
        quests.value = []
        proposals.value = []
        eventsError.value = ''
        resetAccount()
        return false
      } finally { reading.value = false; refreshPromise = undefined }
    })()
    return refreshPromise
  }

  async function requestWallet() {
    if (standardAdapter?.connected && standardAdapter.publicKey) {
      attachInjectedListeners(standardAdapter)
      return true
    }
    if (walletOptions.value.length) {
      if (walletOptions.value.length > 1) {
        walletPickerOpen.value = true
        return false
      }
      return requestStandardWallet(walletOptions.value[0])
    }
    injected = window.phantom?.solana || window.solana
    if (!injected?.connect) throw new Error('Install Phantom, Solflare, MetaMask, or another Solana wallet, then reload this page.')
    const reportedNetwork = injected.network || injected.cluster
    if (reportedNetwork && SOLANA_CLUSTER !== 'custom' && supportedCluster(reportedNetwork) !== SOLANA_CLUSTER) {
      throw new Error(`Phantom is on ${supportedCluster(reportedNetwork)}, but this app reads ${SOLANA_CLUSTER}.`)
    }
    if (connecting.value) return false
    connecting.value = true
    try {
      const response = await injected.connect()
      const address = keyString(response?.publicKey || injected.publicKey)
      resetAccount()
      wallet.value = address
      await hydrate()
      await readProgramState()
      return Boolean(wallet.value)
    } finally { connecting.value = false }
  }
  async function requestStandardWallet(candidate) {
    if (!supportsCurrentCluster(candidate)) throw new Error(`${candidate.name} does not support ${SOLANA_NETWORK_NAME}.`)
    if (connecting.value) return false
    connecting.value = true
    try {
      detachInjectedListeners()
      destroyStandardAdapter()
      standardAdapter = new StandardWalletAdapter({ wallet: candidate })
      standardAdapter.on('disconnect', walletDisconnected)
      injected = standardAdapter
      await standardAdapter.connect()
      if (!standardAccountSupportsCurrentCluster()) {
        await standardAdapter.disconnect().catch(() => {})
        throw new Error(`${candidate.name} connected on a different Solana network. Switch it to ${SOLANA_NETWORK_NAME} and retry.`)
      }
      const address = keyString(standardAdapter.publicKey)
      if (!address) throw new Error(`${candidate.name} did not return a Solana account.`)
      resetAccount()
      wallet.value = address
      await hydrate()
      await readProgramState()
      standardAdapter.on('connect', accountsChanged)
      return Boolean(wallet.value)
    } finally { connecting.value = false }
  }
  async function connect() { if (busy.value || connecting.value) return false; try { return await requestWallet() } catch (e) { notify(readableError(e)); return false } }
  async function transact(label, submit = null) {
    if (busy.value || connecting.value) return false
    if (!configured || !PROGRAM_INTERFACE_READY) { notify('This is a sample preview. Configure a deployed Solana program before enabling community actions.'); return false }
    if (!programReady.value) { notify(eventsError.value || 'The Solana program is not initialized on this cluster yet.'); return false }
    if (!ready.value || reading.value) { notify('Solana data is unavailable or refreshing. Wait for a successful sync before transacting.'); return false }
    if (paused.value) { notify('Community actions are paused by the program authority.'); return false }
    if (typeof submit !== 'function') { notify('This action requires a token mint and token-specific program instructions.'); return false }
    txState.value = { stage: 'preparing', label, message: `Checking wallet and ${SOLANA_NETWORK_NAME}...`, hash: '' }
    try {
      if (!wallet.value && !await requestWallet()) throw new Error('Select a wallet to continue.')
      if (standardAdapter && !standardAccountSupportsCurrentCluster()) {
        throw new Error(`Your wallet account is not on ${SOLANA_NETWORK_NAME}. Switch networks before signing.`)
      }
      const reportedNetwork = injected?.network || injected?.cluster
      if (reportedNetwork && SOLANA_CLUSTER !== 'custom' && supportedCluster(reportedNetwork) !== SOLANA_CLUSTER) {
        throw new Error(`Phantom is on ${supportedCluster(reportedNetwork)}, but this app writes to ${SOLANA_CLUSTER}.`)
      }
      if (!accountReady.value) throw new Error('Wallet data is not ready. Refresh the page and retry.')
      const program = createProgramClient(PROGRAM_ID, SOLANA_RPC_URL, injected)
      txState.value = { stage: 'wallet', label, message: 'Review the transaction in your wallet.', hash: '' }
      const hash = await submit(program, new web3.PublicKey(wallet.value))
      txState.value = { stage: 'pending', label, message: 'Waiting for Solana confirmation...', hash }
      await refresh()
      txState.value = { stage: 'success', label, message: `Confirmed on ${SOLANA_NETWORK_NAME}.`, hash }
      return true
    } catch (e) { txState.value = { stage: 'error', label, message: readableError(e), hash: txState.value.hash }; return false }
  }

  async function claimQuest(q) {
    if (!q || q.sample) { notify('Sample quests are for preview only.', 'info'); return false }
    const id = asAnchorU64(q.id)
    return transact(`Record quest #${q.id}`, (program, claimant) => program.methods.claimQuest().accounts({
      config: communityPda(PROGRAM_ID),
      quest: questPda(PROGRAM_ID, id),
      claimant,
      receipt: claimPda(PROGRAM_ID, id, claimant),
      systemProgram: web3.SystemProgram.programId,
    }).rpc())
  }

  async function createQuest({ title, details, maxClaims, expiresAt }) {
    if (!isOwner.value) { notify('Only the configured program authority can publish or pause quests.'); return false }
    const cleanTitle = String(title || '').trim()
    const cleanDetails = String(details || '').trim()
    if (!cleanTitle || new TextEncoder().encode(cleanTitle).length > 80) { notify('Quest title must contain 1 to 80 UTF-8 bytes.'); return false }
    if (new TextEncoder().encode(cleanDetails).length > 240) { notify('Quest details must be 240 UTF-8 bytes or fewer.'); return false }
    const cap = Number(maxClaims)
    if (!Number.isInteger(cap) || cap < 1 || cap > 0xffffffff) { notify('Claim limit must be a positive whole number.'); return false }
    const expiry = BigInt(expiresAt)
    return transact('Publish quest', async (program, authority) => {
      const state = await program.account.config.fetch(communityPda(PROGRAM_ID))
      const id = state.nextQuestId
      return program.methods.createQuest(
        id, cleanTitle, cleanDetails, cap, asAnchorU64(expiry),
      ).accounts({
        config: communityPda(PROGRAM_ID),
        authority,
        quest: questPda(PROGRAM_ID, id),
        systemProgram: web3.SystemProgram.programId,
      }).rpc()
    })
  }

  async function setQuestActive(q, active) {
    if (!q || q.sample) return false
    if (!isOwner.value) { notify('Only the configured program authority can change quest status.'); return false }
    const id = asAnchorU64(q.id)
    return transact(`${active ? 'Resume' : 'Pause'} quest #${q.id}`, (program, authority) => program.methods.setQuestActive(active).accounts({
      config: communityPda(PROGRAM_ID),
      authority,
      quest: questPda(PROGRAM_ID, id),
    }).rpc())
  }

  async function createProposal(description, votingDays) {
    const cleanDescription = String(description || '').trim()
    const bytes = new TextEncoder().encode(cleanDescription).length
    const days = Number(votingDays)
    if (bytes < 10 || bytes > 2000) { notify('Proposal text must contain 10 to 2,000 UTF-8 bytes.'); return false }
    if (!Number.isInteger(days) || days < 1 || days > 30) { notify('Voting period must be from 1 to 30 days.'); return false }
    return transact('Create advisory proposal', async (program, creator) => {
      const state = await program.account.config.fetch(communityPda(PROGRAM_ID))
      const id = state.nextProposalId
      return program.methods.createProposal(id, cleanDescription, days).accounts({
        config: communityPda(PROGRAM_ID),
        creator,
        proposal: proposalPda(PROGRAM_ID, id),
        systemProgram: web3.SystemProgram.programId,
      }).rpc()
    })
  }

  async function castVote(p, support) {
    if (!p || p.sample) { notify('Sample proposals are for preview only.', 'info'); return false }
    const id = asAnchorU64(p.id)
    return transact(`Vote ${support ? 'For' : 'Against'} #${p.id}`, (program, voter) => program.methods.castVote(Boolean(support)).accounts({
      config: communityPda(PROGRAM_ID),
      proposal: proposalPda(PROGRAM_ID, id),
      voter,
      receipt: votePda(PROGRAM_ID, id, voter),
      systemProgram: web3.SystemProgram.programId,
    }).rpc())
  }
  function questStatus(q) { if (q.sample) return 'Sample'; if (q.claimed) return 'Claimed'; if (!q.active) return 'Paused'; if (q.expiresAt <= now.value) return 'Expired'; if (q.claims >= q.maxClaims) return 'Filled'; return 'Open' }
  function proposalStatus(p) { return p.sample ? 'Sample' : p.endsAt <= now.value ? 'Closed' : p.voted ? 'Voted' : 'Open' }
  function votePercent(p) { const total = p.forVotes + p.againstVotes; return total ? Number(p.forVotes * 10000n / total) / 100 : 0 }
  function parseAmount(input, label = 'Amount') {
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(String(input).trim())) throw new Error(`${label} must be a positive decimal number.`)
    let amount
    try { amount = parseUnits(String(input).trim(), tokenDecimals.value) } catch { throw new Error(`${label} supports up to ${tokenDecimals.value} decimal places.`) }
    if (amount <= 0n) throw new Error(`${label} must be greater than zero.`)
    return amount
  }
  async function accountsChanged(publicKey) {
    resetAccount()
    wallet.value = keyString(publicKey)
    if (wallet.value) await hydrate()
    await readProgramState()
  }
  function walletDisconnected() { resetAccount(); wallet.value = '' }
  function detachInjectedListeners() {
    if (!injected) return
    if (injectedAccountListener) {
      injected.removeListener?.('accountChanged', injectedAccountListener)
      injectedAccountListener = undefined
    }
    if (injectedDisconnectListener) {
      injected.removeListener?.('disconnect', injectedDisconnectListener)
      injectedDisconnectListener = undefined
    }
  }
  function attachInjectedListeners(provider) {
    detachInjectedListeners()
    injected = provider
    if (provider instanceof StandardWalletAdapter || !provider?.on) return
    injectedAccountListener = accountsChanged
    injectedDisconnectListener = walletDisconnected
    provider.on('accountChanged', injectedAccountListener)
    provider.on('disconnect', injectedDisconnectListener)
  }
  async function disconnectWallet() {
    try {
      if (standardAdapter?.connected) await standardAdapter.disconnect()
      else if (injected?.disconnect) await injected.disconnect()
    } catch (e) {
      notify(readableError(e))
    } finally {
      walletDisconnected()
    }
  }
  if (getCurrentInstance()) {
    onMounted(async () => {
      await setupWalletDiscovery()
      attachInjectedListeners(standardAdapter || window.phantom?.solana || window.solana)
      if (injected?.publicKey) wallet.value = keyString(injected.publicKey)
      await refresh()
      timer = setInterval(() => { now.value = Math.floor(Date.now() / 1000); if (!busy.value && !connecting.value) refresh() }, 20000)
    })
    onUnmounted(() => {
      clearInterval(timer)
      detachInjectedListeners()
      detachWalletDiscovery()
    })
  }
  return {
    configured, mintConfigured, programReady, wallet, token, tokenName, tokenSymbol,
    tokenDecimals, tokenDecimalsKnown, native, owner, treasury, treasuryKnown,
    treasuryNativeKnown, treasuryTokenKnown, treasuryError, totalSupply, treasuryBalance, treasuryNative,
    paused, quests, proposals, activity, eventsError, accountError,
    accountReading, accountReady, readError, reading, ready, lastRead, connected,
    isOwner, busy, canWrite, txState, connecting, short, units,
    walletOptions, walletPickerOpen, closeWalletPicker, chooseWallet,
    disconnectWallet,
    solUnits, date, explorer, readableError, notify, refresh, connect,
    transact, claimQuest, createQuest, setQuestActive, createProposal, castVote,
    questStatus, proposalStatus, votePercent, parseAmount,
    solanaCluster: SOLANA_CLUSTER, solanaNetworkName: SOLANA_NETWORK_NAME,
  }
}
