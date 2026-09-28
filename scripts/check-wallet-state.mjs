import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { web3 } from '@coral-xyz/anchor'
import {
  claimPda,
  communityPda,
  createProgramClient,
  questPda,
} from '../src/community-program.js'
import { supportsSolanaCluster } from '../src/wallet-networks.js'

const moduleUrl = new URL('../src/useCommunityApp.js', import.meta.url)
const solanaConfigUrl = new URL('../src/solana.js', import.meta.url)

test('discovers and validates Wallet Standard accounts on MetaMask Solana CAIP networks', () => {
  const metamaskTestnet = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z'
  const metamaskDevnet = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
  assert.equal(supportsSolanaCluster([metamaskTestnet], 'testnet'), true)
  assert.equal(supportsSolanaCluster(['solana:testnet'], 'testnet'), true)
  assert.equal(supportsSolanaCluster([metamaskDevnet], 'testnet'), false)
  assert.equal(supportsSolanaCluster([metamaskDevnet], 'devnet'), true)
  assert.equal(supportsSolanaCluster([], 'testnet'), false)
  assert.equal(supportsSolanaCluster(['solana:localnet'], 'custom'), true)
})

test('builds quest instructions from the shipped Anchor IDL and PDA seeds', async () => {
  const programId = 'D7nYqa5Y1a2MQqDQb1NpU5kVS7TxDrj92mbCY9UitHq6'
  const claimant = web3.Keypair.generate().publicKey
  const questId = 42n
  const program = createProgramClient(programId, 'http://127.0.0.1:8899')
  const instruction = await program.methods.claimQuest().accounts({
    config: communityPda(programId),
    quest: questPda(programId, questId),
    claimant,
    receipt: claimPda(programId, questId, claimant),
    systemProgram: web3.SystemProgram.programId,
  }).instruction()

  assert.equal(program.programId.toBase58(), programId)
  assert.equal(instruction.programId.toBase58(), programId)
  assert.deepEqual(instruction.keys.map(({ pubkey }) => pubkey.toBase58()), [
    communityPda(programId).toBase58(),
    questPda(programId, questId).toBase58(),
    claimant.toBase58(),
    claimPda(programId, questId, claimant).toBase58(),
    web3.SystemProgram.programId.toBase58(),
  ])
})

test('defaults to the deployed Testnet program and never reuses it on mainnet', () => {
  const defaultNetwork = runScenario(`
    globalThis.window = {}
    const config = await import(${JSON.stringify(solanaConfigUrl.href)})
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    console.log(JSON.stringify({
      cluster: config.SOLANA_CLUSTER,
      rpc: config.SOLANA_RPC_URL,
      programId: config.PROGRAM_ID,
      explorer: app.explorer('address', 'SomePublicKey'),
    }))
  `)
  assert.deepEqual(defaultNetwork, {
    cluster: 'testnet',
    rpc: 'https://api.testnet.solana.com',
    programId: 'D7nYqa5Y1a2MQqDQb1NpU5kVS7TxDrj92mbCY9UitHq6',
    explorer: 'https://explorer.solana.com/address/SomePublicKey?cluster=testnet',
  })

  const mainnet = runScenario(`
    const config = await import(${JSON.stringify(solanaConfigUrl.href)})
    console.log(JSON.stringify({ cluster: config.SOLANA_CLUSTER, programId: config.PROGRAM_ID }))
  `, {
    VITE_SOLANA_CLUSTER: 'mainnet-beta',
    VITE_SOLANA_PROGRAM_ID: 'D7nYqa5Y1a2MQqDQb1NpU5kVS7TxDrj92mbCY9UitHq6',
  })
  assert.deepEqual(mainnet, { cluster: 'mainnet-beta', programId: '' })
})

function runScenario(source, config = {}) {
  const script = `
    globalThis.__SOLSTIR_ENV__ = ${JSON.stringify(config)}
    globalThis.__rpcCalls = []
    globalThis.__rpcImpl = async (method) => {
      if (method === 'getVersion') return { result: { solanaCore: '1.18.0' } }
      if (method === 'getTokenSupply') return { result: { value: { amount: '1000000000', decimals: 9 } } }
      if (method === 'getBalance') return { result: { value: 0 } }
      if (method === 'getTokenAccountsByOwner') return { result: { value: [] } }
      return { result: {} }
    }
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body)
      __rpcCalls.push(request)
      const response = await __rpcImpl(request.method, request.params)
      if (response?.httpStatus) return { ok: false, status: response.httpStatus, json: async () => ({}) }
      return { ok: true, json: async () => response }
    }
    ${source}
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: process.env
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim().split('\n').at(-1))
}

test('keeps a mint-less app in sample preview mode and never enables writes', () => {
  const result = runScenario(`
    globalThis.window = {}
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    console.log(JSON.stringify({ configured: app.configured, programReady: app.programReady.value, canWrite: app.canWrite.value, symbol: app.tokenSymbol.value, decimals: app.tokenDecimals.value }))
  `)
  assert.deepEqual(result, { configured: true, programReady: false, canWrite: false, symbol: '', decimals: 9 })
})

test('reads native SOL without requiring a deployed token mint', () => {
  const result = runScenario(`
    globalThis.window = {}
    globalThis.__rpcImpl = async method => {
      if (method === 'getVersion') return { result: { solanaCore: '1.18.0' } }
      if (method === 'getBalance') return { result: { value: '1250000000' } }
      return { result: {} }
    }
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    app.wallet.value = 'Wallet111111111111111111111111111111111111'
    const refreshed = await app.refresh()
    console.log(JSON.stringify({
      refreshed,
      ready: app.ready.value,
      mintConfigured: app.mintConfigured,
      accountReady: app.accountReady.value,
      sol: app.solUnits(app.native.value),
      supplyCalls: __rpcCalls.filter(call => call.method === 'getTokenSupply').length,
      canWrite: app.canWrite.value,
    }))
  `)
  assert.deepEqual(result, {
    refreshed: true,
    ready: true,
    mintConfigured: false,
    accountReady: true,
    sol: '1.25',
    supplyCalls: 0,
    canWrite: false,
  })
})

test('reads mint decimals and treasury SPL balances; displays wallet and treasury SOL at 9 decimals', () => {
  const result = runScenario(`
    globalThis.window = {}
    globalThis.__rpcImpl = async (method, params) => {
      if (method === 'getVersion') return { result: { solanaCore: '1.18.0' } }
      if (method === 'getTokenSupply') return { result: { value: { amount: '1000000000', decimals: 6 } } }
      if (method === 'getBalance') return { result: { value: params[0] === 'Wallet111111111111111111111111111111111111' ? '2500000000' : '5000000000' } }
      if (method === 'getTokenAccountsByOwner') {
        const amount = params[0] === 'Wallet111111111111111111111111111111111111' ? '1234500' : '7000000'
        return { result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { amount, decimals: 6 } } } } } }] } }
      }
      return { result: {} }
    }
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    app.wallet.value = 'Wallet111111111111111111111111111111111111'
    await app.refresh()
    console.log(JSON.stringify({
      configured: app.configured,
      programReady: app.programReady.value,
      canWrite: app.canWrite.value,
      ready: app.ready.value,
      decimals: app.tokenDecimals.value,
      totalSupply: app.units(app.totalSupply.value),
      walletToken: app.units(app.token.value),
      walletSol: app.solUnits(app.native.value),
      treasuryToken: app.units(app.treasuryBalance.value),
      treasurySol: app.solUnits(app.treasuryNative.value),
      treasuryKnown: app.treasuryKnown.value,
      parsedAmount: String(app.parseAmount('1.2')),
      writeResult: await app.transact('test'),
      sendCalls: __rpcCalls.filter(call => call.method === 'sendTransaction').length
    }))
  `, {
    VITE_SOLANA_TOKEN_MINT: 'Mint111111111111111111111111111111111111111',
    VITE_SOLANA_PROGRAM_ID: 'Program1111111111111111111111111111111111111',
    VITE_TREASURY_ADDRESS: 'Treasury111111111111111111111111111111111111'
  })
  assert.deepEqual(result, {
    configured: true,
    programReady: false,
    canWrite: false,
    ready: true,
    decimals: 6,
    totalSupply: '1,000',
    walletToken: '1.2345',
    walletSol: '2.5',
    treasuryToken: '7',
    treasurySol: '5',
    treasuryKnown: true,
    parsedAmount: '1200000',
    writeResult: false,
    sendCalls: 0
  })
})

test('does not present treasury token balance as zero when the SPL balance read fails', () => {
  const result = runScenario(`
    globalThis.window = {}
    globalThis.__rpcImpl = async (method) => {
      if (method === 'getVersion') return { result: { solanaCore: '1.18.0' } }
      if (method === 'getTokenSupply') return { result: { value: { amount: '1000000000', decimals: 9 } } }
      if (method === 'getBalance') return { result: { value: 5000000000 } }
      if (method === 'getTokenAccountsByOwner') return { error: { message: 'token account query failed' } }
    }
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    await app.refresh()
    console.log(JSON.stringify({ ready: app.ready.value, known: app.treasuryKnown.value, tokenKnown: app.treasuryTokenKnown.value, nativeKnown: app.treasuryNativeKnown.value, token: String(app.treasuryBalance.value), error: app.treasuryError.value }))
  `, {
    VITE_SOLANA_TOKEN_MINT: 'Mint111111111111111111111111111111111111111',
    VITE_TREASURY_ADDRESS: 'Treasury111111111111111111111111111111111111'
  })
  assert.deepEqual(result, { ready: true, known: false, tokenKnown: false, nativeKnown: true, token: '0', error: 'Treasury data is incomplete. token balance: token account query failed' })
})

test('rejects a detectable Phantom cluster mismatch and leaves the wallet disconnected', () => {
  const result = runScenario(`
    globalThis.window = { phantom: { solana: { cluster: 'mainnet-beta', connect: async () => ({ publicKey: 'Wallet111111111111111111111111111111111111' }) } } }
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    const connected = await app.connect()
    console.log(JSON.stringify({ connected, wallet: app.wallet.value, message: app.txState.value.message }))
  `, { VITE_SOLANA_TOKEN_MINT: 'Mint111111111111111111111111111111111111111' })
  assert.equal(result.connected, false)
  assert.equal(result.wallet, '')
  assert.match(result.message, /Phantom is on mainnet-beta, but this app reads testnet/)
})

test('disconnect and account changes clear stale balances and guard late RPC responses', () => {
  const result = runScenario(`
    const { createRenderer, h } = await import('vue')
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const listeners = new Map()
    let activeKey = 'Wallet111111111111111111111111111111111111'
    const provider = {
      cluster: 'testnet',
      get publicKey() { return activeKey },
      connect: async () => ({ publicKey: activeKey }),
      on: (event, callback) => listeners.set(event, callback),
      removeListener: event => listeners.delete(event)
    }
    globalThis.window = { phantom: { solana: provider } }
    let app
    const renderer = createRenderer({
      createElement: type => ({ type, children: [], parent: null }),
      createText: text => ({ text, parent: null }),
      createComment: text => ({ comment: text, parent: null }),
      setText: (node, text) => { node.text = text },
      setElementText: (node, text) => { node.text = text },
      parentNode: node => node.parent,
      nextSibling: node => { const siblings = node.parent?.children || []; return siblings[siblings.indexOf(node) + 1] || null },
      insert: (node, parent, anchor = null) => { node.parent = parent; const index = anchor ? parent.children.indexOf(anchor) : -1; if (index < 0) parent.children.push(node); else parent.children.splice(index, 0, node) },
      remove: node => { const siblings = node.parent?.children || []; const index = siblings.indexOf(node); if (index >= 0) siblings.splice(index, 1); node.parent = null }
    })
    const root = { type: 'root', children: [], parent: null }
    const vueApp = renderer.createApp({ setup() { app = useCommunityApp(); return () => h('div') } })
    vueApp.mount(root)
    await app.refresh()
    await app.connect()
    let releaseFirstTokenRead
    let firstTokenReadStarted
    const started = new Promise(resolve => { firstTokenReadStarted = resolve })
    const delayed = new Promise(resolve => { releaseFirstTokenRead = resolve })
    globalThis.__rpcImpl = async (method, params) => {
      if (method === 'getVersion') return { result: { solanaCore: '1.18.0' } }
      if (method === 'getTokenSupply') return { result: { value: { amount: '1000000000', decimals: 6 } } }
      if (method === 'getBalance') return { result: { value: params[0].startsWith('Wallet2') ? 9000000000 : 2000000000 } }
      if (method === 'getTokenAccountsByOwner') {
        const amount = params[0].startsWith('Wallet111') ? '111' : '222'
        if (amount === '111') {
          firstTokenReadStarted()
          await delayed
        }
        const row = { account: { data: { parsed: { info: { tokenAmount: { amount, decimals: 6 } } } } } }
        return { result: { value: [row] } }
      }
      return { result: {} }
    }
    activeKey = 'Wallet111111111111111111111111111111111111'
    listeners.get('accountChanged')(activeKey)
    await started
    activeKey = 'Wallet222222222222222222222222222222222222'
    const currentAccount = listeners.get('accountChanged')(activeKey)
    await currentAccount
    releaseFirstTokenRead()
    await new Promise(resolve => setTimeout(resolve, 0))
    const beforeDisconnect = { wallet: app.wallet.value, token: String(app.token.value), native: String(app.native.value), accountReady: app.accountReady.value }
    listeners.get('disconnect')()
    const afterDisconnect = { wallet: app.wallet.value, token: String(app.token.value), native: String(app.native.value), accountReady: app.accountReady.value }
    vueApp.unmount()
    console.log(JSON.stringify({ beforeDisconnect, afterDisconnect }))
  `, {
    VITE_SOLANA_TOKEN_MINT: 'Mint111111111111111111111111111111111111111'
  })
  assert.deepEqual(result.beforeDisconnect, {
    wallet: 'Wallet222222222222222222222222222222222222', token: '222', native: '9000000000', accountReady: true
  })
  assert.deepEqual(result.afterDisconnect, { wallet: '', token: '0', native: '0', accountReady: false })
})

test('keeps custom RPC endpoints labeled custom and omits a guessed explorer cluster', () => {
  const result = runScenario(`
    globalThis.window = {}
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    console.log(JSON.stringify({ cluster: app.solanaCluster, name: app.solanaNetworkName, link: app.explorer('address', 'SomePublicKey') }))
  `, {
    VITE_SOLANA_TOKEN_MINT: 'Mint111111111111111111111111111111111111111',
    VITE_SOLANA_RPC_URL: 'https://rpc.example.org/solana'
  })
  assert.deepEqual(result, { cluster: 'custom', name: 'Custom Solana RPC', link: 'https://explorer.solana.com/address/SomePublicKey' })
})

test('surfaces RPC failures and clears readiness', () => {
  const result = runScenario(`
    globalThis.window = {}
    globalThis.__rpcImpl = async () => ({ httpStatus: 503 })
    const { useCommunityApp } = await import(${JSON.stringify(moduleUrl.href)})
    const app = useCommunityApp()
    const refreshed = await app.refresh()
    console.log(JSON.stringify({ refreshed, ready: app.ready.value, error: app.readError.value }))
  `, { VITE_SOLANA_TOKEN_MINT: 'Mint111111111111111111111111111111111111111' })
  assert.equal(result.refreshed, false)
  assert.equal(result.ready, false)
  assert.match(result.error, /HTTP 503/)
})


