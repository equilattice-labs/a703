import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { ref, computed } from 'vue'
import { Contract as EthersContract, parseUnits, formatUnits, isAddress, ZeroAddress } from 'ethers'

// Exercise the actual composable and ethers Contract runner without a wallet,
// live RPC, .env files, or transactions. Only providers and lifecycle are mocked.
const source = readFileSync(new URL('../src/useKinacta.js', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '')
  .replace(/^import .*\r?\n/gm, '')
  .replace('export function useKinacta()', 'function useKinacta()')
const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const CONTRACT = '0x3333333333333333333333333333333333333333'
const TREASURY = '0x4444444444444444444444444444444444444444'
const CHAIN = 46630

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
async function until(predicate) {
  for (let i = 0; i < 120 && !predicate(); i++) await Promise.resolve()
  assert.ok(predicate(), 'Expected asynchronous state was not reached')
}
function setup(treasury = '') {
  const state = {
    rpcChain: CHAIN, walletChain: CHAIN, accounts: [A], rejectWalletRead: false,
    sendCount: 0, switchCount: 0, nameCount: 0, treasuryCalls: [],
    waitGate: null, signerHook: null, accountGate: null, refreshGate: null,
  }
  const listeners = {}
  let mounted
  const rpc = {
    async send(method) {
      assert.equal(method, 'eth_chainId')
      if (state.refreshGate) await state.refreshGate.promise
      return `0x${state.rpcChain.toString(16)}`
    },
    getCode: async () => '0x1234', getBlockNumber: async () => 2000,
    getLogs: async () => [], getBalance: async address => address === TREASURY ? 12n : 8n,
    destroy() {},
  }
  const readContract = {
    interface: { hasFunction: () => false },
    name: async () => { state.nameCount++; return 'Deedluma' },
    symbol: async () => 'DLU', nextQuestId: async () => 1n, nextProposalId: async () => 1n,
    owner: async () => A, totalSupply: async () => 1000n, APR_BPS: async () => 800n,
    paused: async () => false,
    async balanceOf(address) {
      if (address === TREASURY) { state.treasuryCalls.push(address); return 77n }
      if (address === CONTRACT) return 22n
      if (state.rejectWalletRead) throw new Error('wallet RPC failure')
      if (state.accountGate) await state.accountGate.promise
      return address === B ? 202n : 101n
    },
    positions: async () => ({ amount: 20n, unlockAt: 1n }), pendingYield: async () => 1n,
    quests: async () => ({ title: 'Quest', reward: 1n, expiresAt: 9999999999n, maxClaims: 10n, claims: 0n, active: true }),
    proposals: async () => ({ description: 'Proposal', forVotes: 0n, againstVotes: 0n, endsAt: 9999999999n, executed: false }),
    hasClaimedQuest: async (_, address) => address === A,
    hasVoted: async (_, address) => address === A,
  }
  const ethereum = {
    on: (event, handler) => { listeners[event] = handler }, removeListener() {},
    async request({ method }) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return state.accounts
      if (method === 'eth_chainId') return `0x${state.walletChain.toString(16)}`
      if (method === 'wallet_switchEthereumChain') { state.switchCount++; state.walletChain = CHAIN; return null }
      throw new Error(`Unexpected wallet method: ${method}`)
    },
  }
  const window = { ethereum }
  function Contract(address, abi, runner) {
    assert.equal(address, CONTRACT)
    if (runner === rpc) return readContract
    return {
      async submit() {
        const contract = new EthersContract(CONTRACT, ['function stake(uint256 amount,uint256 lockDuration)'], runner)
        const transaction = await contract.stake(1n, 604800)
        return {
          hash: transaction.hash,
          async wait() {
            if (state.waitGate) await state.waitGate.promise
            return { status: 1, hash: transaction.hash }
          },
        }
      },
    }
  }
  function BrowserProvider(provider, network) {
    assert.equal(provider, ethereum)
    assert.equal(network, CHAIN)
    return {
      destroy() {},
      async getSigner(address) {
        if (state.signerHook) await state.signerHook()
        return {
          getAddress: async () => address,
          async sendTransaction(transaction) {
            state.sendCount++; state.lastTransaction = transaction
            return { hash: '0xabc' }
          },
        }
      },
    }
  }
  const dependencies = {
    ref, computed, onMounted: handler => { mounted = handler }, onUnmounted() {},
    BrowserProvider, Contract, JsonRpcProvider: function () { return rpc },
    parseUnits, formatUnits, isAddress, ZeroAddress, ABI: [], CONTRACT_ADDRESS: CONTRACT,
    TREASURY_ADDRESS: treasury, NETWORK: { chainId: `0x${CHAIN.toString(16)}` },
    CHAIN_ID: CHAIN, RPC_URL: 'mock', EXPLORER_URL: 'https://example.invalid', DEPLOYMENT_BLOCK: 0,
    window, setInterval: () => 0, clearInterval() {},
  }
  const app = new Function(...Object.keys(dependencies), `${source}\nreturn useKinacta();`)(...Object.values(dependencies))
  return { app, state, listeners, mount: () => mounted(), window }
}

test('verifies actual RPC chain and clears previously successful data on failure', async () => {
  const { app, state, mount } = setup()
  await mount()
  assert.equal(app.accountReady.value, true)
  assert.equal(app.treasuryKnown.value, false)
  assert.equal(app.treasury.value, '')
  const previousCalls = state.nameCount
  state.rpcChain = 1
  assert.equal(await app.refresh(), false)
  assert.equal(state.nameCount, previousCalls)
  assert.equal(app.ready.value, false)
  assert.equal(app.accountReady.value, false)
  assert.deepEqual(app.quests.value, [])
  assert.equal(app.totalSupply.value, 0n)
})

test('reads only an explicitly configured treasury instead of inferring the owner', async () => {
  const { app, state, mount } = setup(TREASURY)
  await mount()
  assert.equal(app.treasuryKnown.value, true)
  assert.equal(app.treasury.value, TREASURY)
  assert.equal(app.treasuryBalance.value, 77n)
  assert.deepEqual(state.treasuryCalls, [TREASURY])
})

test('invalid treasury remains unknown without disabling independent contract reads', async () => {
  const { app, mount } = setup('invalid')
  await mount()
  assert.equal(app.ready.value, true)
  assert.equal(app.treasuryKnown.value, false)
  assert.match(app.treasuryError.value, /invalid/)
})

test('failed account hydration blocks sending and marks old account data unavailable', async () => {
  const { app, state, mount } = setup()
  await mount()
  state.rejectWalletRead = true
  assert.equal(await app.transact('Test', contract => contract.submit()), false)
  assert.equal(state.sendCount, 0)
  assert.equal(app.accountReady.value, false)
  assert.match(app.accountError.value, /wallet RPC failure/)
})

test('a delayed previous account read cannot overwrite the newly selected wallet', async () => {
  const { app, state, mount, listeners } = setup()
  await mount()
  const gate = deferred()
  state.accountGate = gate
  const oldRead = app.connect()
  await until(() => app.accountReading.value)
  assert.equal(app.accountReady.value, false)
  state.accounts = [B]; state.accountGate = null
  await listeners.accountsChanged([B])
  gate.resolve(); await oldRead
  assert.equal(app.wallet.value, B)
  assert.equal(app.token.value, 202n)
  assert.equal(app.accountReady.value, true)
  assert.equal(app.quests.value[0].claimed, false)
})

for (const change of ['account', 'network']) {
  test(`blocks ${change} changes while acquiring the signer`, async () => {
    const { app, state, mount } = setup()
    await mount()
    state.signerHook = () => { if (change === 'account') state.accounts = [B]; else state.walletChain = 1 }
    assert.equal(await app.transact('Test', contract => contract.submit()), false)
    assert.equal(state.sendCount, 0)
  })
}

test('rechecks the network at the actual ethers send boundary', async () => {
  const { app, state, mount } = setup()
  await mount()
  assert.equal(await app.transact('Boundary', contract => { state.walletChain = 1; return contract.submit() }), false)
  assert.equal(state.sendCount, 0)
})

test('pending transactions block connection/network prompts and send an explicit chain ID', async () => {
  const { app, state, mount } = setup()
  await mount()
  const gate = deferred()
  state.waitGate = gate
  const transaction = app.transact('Success', contract => contract.submit())
  await until(() => app.txState.value.stage === 'pending')
  assert.equal(await app.switchNetwork(), false)
  assert.equal(await app.connect(), false)
  assert.equal(state.switchCount, 0)
  gate.resolve()
  assert.equal(await transaction, true)
  assert.equal(state.lastTransaction.chainId, CHAIN)
  assert.equal(app.txState.value.stage, 'success')
  assert.equal(app.txState.value.hash, '0xabc')
})

test('missing wallets produce an actionable error and release the busy state', async () => {
  const { app, mount, window } = setup()
  await mount()
  app.wallet.value = ''; window.ethereum = undefined
  assert.equal(await app.transact('No wallet', contract => contract.submit()), false)
  assert.match(app.txState.value.message, /Install MetaMask/)
  assert.equal(app.busy.value, false)
})

test('background refresh retains successful balances and readiness while blocking writes', async () => {
  const { app, state, mount } = setup(TREASURY)
  await mount()
  const rpcGate = deferred(), accountGate = deferred()
  state.refreshGate = rpcGate; state.accountGate = accountGate
  const refresh = app.refresh()
  assert.equal(app.reading.value, true)
  assert.equal(app.ready.value, true)
  assert.equal(app.accountReady.value, true)
  assert.equal(app.treasuryKnown.value, true)
  assert.equal(app.token.value, 101n)
  assert.equal(app.treasuryBalance.value, 77n)
  assert.equal(app.canWrite.value, false)
  assert.equal(await app.transact('Refreshing', contract => contract.submit()), false)
  rpcGate.resolve()
  await until(() => app.accountReading.value)
  assert.equal(app.accountReady.value, true)
  assert.equal(app.token.value, 101n)
  assert.equal(app.quests.value[0].claimed, true)
  assert.equal(app.proposals.value[0].voted, true)
  assert.equal(app.canWrite.value, false)
  accountGate.resolve()
  assert.equal(await refresh, true)
  assert.equal(app.reading.value, false)
  assert.equal(app.accountReading.value, false)
  assert.equal(app.accountReady.value, true)
  assert.equal(app.canWrite.value, true)
  assert.equal(state.sendCount, 0)
})

test('an obsolete hydrate cannot restore readiness after a later refresh failure', async () => {
  const { app, state, listeners, mount } = setup()
  await mount()
  const gate = deferred()
  state.accountGate = gate
  const oldRead = listeners.accountsChanged([A])
  await until(() => app.accountReading.value)
  state.rpcChain = 1
  assert.equal(await app.refresh(), false)
  gate.resolve(); await oldRead
  assert.equal(app.ready.value, false)
  assert.equal(app.accountReady.value, false)
  assert.equal(app.token.value, 0n)
  assert.deepEqual(app.quests.value, [])
})
