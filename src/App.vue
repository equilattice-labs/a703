<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePartivio } from './usePartivio'
import { CHAIN_ID, CONTRACT_ADDRESS } from './contract'
import partivioMark from './assets/partivio-mark.png'

const partivio = usePartivio()
const { configured, wallet, token, native, treasury, totalSupply, treasuryBalance, treasuryNative, totalStaked, apr, paused,
  quests, proposals, activity, eventsError, accountError, readError, reading, ready, lastRead, connected, wrongChain, isOwner,
  busy, unlocked, position, txState, connecting, short, units, exact, date, explorer, notify, refresh, connect, switchNetwork,
  transact, questStatus, proposalStatus, votePercent, parseAmount } = partivio
const validTabs = ['home', 'quests', 'stake', 'governance', 'treasury', 'learn']
const tab = ref(validTabs.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home')
function syncFromHash() {
  const next = location.hash.slice(1)
  if (validTabs.includes(next)) tab.value = next
  else if (!next) tab.value = 'home'
}
function go(next) { tab.value = next; history.pushState(null, '', `#${next}`); window.scrollTo({ top: 0, behavior: 'smooth' }) }
onMounted(() => { window.addEventListener('hashchange', syncFromHash); window.addEventListener('popstate', syncFromHash) })
onUnmounted(() => { window.removeEventListener('hashchange', syncFromHash); window.removeEventListener('popstate', syncFromHash) })
const nav = [['home', 'Field notes'], ['quests', 'Quests'], ['stake', 'Stake'], ['governance', 'Governance'], ['treasury', 'Treasury'], ['learn', 'Learn']]
const stakeAmount = ref(''), lockDays = ref(30), proposalText = ref(''), proposalDays = ref(7), showProposal = ref(false)
const adminTitle = ref(''), adminReward = ref(''), adminMax = ref(100), adminDays = ref(30), questFilter = ref('all')
const samples = [
  { id: 'sample-1', sample: true, title: 'Read the Partivio charter', reward: 12n * 10n ** 18n, detail: 'A sample welcome quest. Learn how rewards and stewardship work.' },
  { id: 'sample-2', sample: true, title: 'Map a useful signal', reward: 28n * 10n ** 18n, detail: 'A sample research quest. Share a source-backed observation.' },
  { id: 'sample-3', sample: true, title: 'Review a treasury route', reward: 45n * 10n ** 18n, detail: 'A sample review quest. Compare proposals and explain your reasoning.' }
]
const sampleProposals = [{ id: 'sample-1', sample: true, description: 'Reserve a season budget for community research bounties', forVotes: 0n, againstVotes: 0n, endsAt: 0 }]
const visibleQuests = computed(() => (configured ? quests.value : samples).filter(q => questFilter.value === 'all' || questStatus(q).toLowerCase() === questFilter.value))
const visibleProposals = computed(() => configured ? proposals.value : sampleProposals)
const estimate = computed(() => { try { return units(parseAmount(stakeAmount.value) * apr.value * BigInt(lockDays.value) / 365n / 10000n, 6) } catch { return '0' } })
const actionDisabled = computed(() => busy.value || (configured && (!ready.value || paused.value)))
function preview() { notify('Sample preview only. A deployed contract is required to submit a transaction.') }
function guard(fn) { try { return fn() } catch (e) { notify(e.message) } }
async function claim(q) {
  if (q.sample) return preview()
  if (questStatus(q) !== 'Open') return notify('This quest is not available to claim.')
  await transact(`Claim quest #${q.id}`, c => c.claimQuest(q.id))
}
async function stake() {
  if (!configured) return preview()
  await guard(async () => {
    let amount; try { amount = parseAmount(stakeAmount.value) } catch (e) { return notify(e.message) }
    if (![7, 30, 90, 365].includes(Number(lockDays.value))) return notify('Choose a supported lock duration.')
    if (connected.value && amount > token.value) return notify('The amount exceeds your available DLU balance.')
    if (await transact('Stake DLU', c => c.stake(amount, Number(lockDays.value) * 86400))) stakeAmount.value = ''
  })
}
async function claimYield() { await transact('Claim staking yield', c => c.claimYield()) }
async function unstake() {
  if (!unlocked.value) return notify(`Your position unlocks on ${date(position.value.unlockAt)}.`)
  await transact('Withdraw staked DLU', c => c.unstake())
}
async function vote(p, support) {
  if (p.sample) return preview()
  if (proposalStatus(p) !== 'Open') return notify('Voting is closed or you already voted.')
  await transact(`Vote ${support ? 'For' : 'Against'} #${p.id}`, c => c.vote(p.id, support))
}
async function createProposal() {
  if (!configured) return preview()
  const description = proposalText.value.trim()
  if (description.length < 10 || description.length > 2000) return notify('Use 10 to 2,000 characters for your proposal.')
  if (!Number.isInteger(Number(proposalDays.value)) || proposalDays.value < 1 || proposalDays.value > 30) return notify('Voting duration must be 1 to 30 whole days.')
  if (await transact('Create governance proposal', c => c.createProposal(description, Number(proposalDays.value) * 86400))) { proposalText.value = ''; showProposal.value = false }
}
async function createQuest() {
  const title = adminTitle.value.trim()
  if (!title || title.length > 200) return notify('Use a quest title between 1 and 200 characters.')
  let reward; try { reward = parseAmount(adminReward.value, 'Reward') } catch (e) { return notify(e.message) }
  if (!Number.isInteger(Number(adminMax.value)) || adminMax.value < 1 || adminMax.value > 1000000) return notify('Maximum claims must be 1 to 1,000,000.')
  if (!Number.isInteger(Number(adminDays.value)) || adminDays.value < 1 || adminDays.value > 365) return notify('Expiry must be 1 to 365 whole days from today.')
  const expiry = Math.floor(Date.now() / 1000) + Number(adminDays.value) * 86400
  if (await transact('Publish quest', c => c.createQuest(title, reward, expiry, Number(adminMax.value)))) { adminTitle.value = ''; adminReward.value = '' }
}
async function setQuest(q) { await transact(`${q.active ? 'Pause' : 'Resume'} quest #${q.id}`, c => c.setQuestActive(q.id, !q.active)) }
function eventDescription(e) {
  const a = e.args
  switch (e.name) {
    case 'QuestCreated': return `Quest #${a.questId} published: ${a.title}`
    case 'QuestClaimed': return `${short(a.account)} claimed ${units(a.reward)} DLU`
    case 'Staked': return `${short(a.account)} staked ${units(a.amount)} DLU`
    case 'YieldClaimed': return `${short(a.account)} claimed ${units(a.amount, 6)} DLU yield`
    case 'Unstaked': return `${short(a.account)} withdrew ${units(a.principal)} DLU`
    case 'ProposalCreated': return `Proposal #${a.proposalId} opened`
    case 'VoteCast': return `${short(a.voter)} voted ${a.support ? 'For' : 'Against'} on #${a.proposalId}`
    case 'TreasuryMint': return `${units(a.amount)} DLU issued to ${short(a.treasury)}`
    case 'QuestStatusChanged': return `Quest #${a.questId} ${a.active ? 'resumed' : 'paused'}`
    default: return e.name.replace(/([a-z])([A-Z])/g, '$1 $2')
  }
}
</script>

<template>
<div class="shell">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="top">
    <button class="logo" aria-label="Partivio home" @click="go('home')"><img :src="partivioMark" alt="" aria-hidden="true"> <span>PARTIVIO</span></button>
    <nav aria-label="Main navigation"><button v-for="n in nav" :key="n[0]" :class="{on:tab===n[0]}" :aria-current="tab===n[0]?'page':undefined" @click="go(n[0])">{{ n[1] }}</button></nav>
    <div class="top-actions"><button class="network" :class="{wrong:wrongChain}" @click="switchNetwork"><i></i>{{ wrongChain ? 'Switch network' : 'RobinHood testnet' }}</button><button class="connect" :disabled="connecting || busy" @click="connect">{{ connecting ? 'Connecting...' : connected ? short(wallet) : 'Connect wallet' }}</button></div>
  </header>
  <div class="preview" v-if="!configured"><b>Sample preview.</b> Example quests demonstrate the experience. Configure a deployed contract to use on-chain features.</div>
  <div class="notice" v-if="wrongChain"><b>Your wallet is on another network.</b> Balances below are from Robinhood Chain Testnet. <button @click="switchNetwork">Switch to Robinhood</button></div>
  <div class="notice" v-if="paused"><b>The protocol is paused.</b> Read-only data remains available; contract actions are temporarily unavailable.</div>
  <main id="main">
    <div v-if="configured" class="read-status" aria-live="polite"><span :class="{failed:readError}">{{ readError ? 'Contract data unavailable: '+readError : reading ? 'Refreshing Robinhood Chain...' : 'On-chain data updated '+lastRead }}</span><button :disabled="reading||busy" @click="refresh">{{ reading ? 'Refreshing...' : 'Refresh' }}</button><a :href="explorer('address',CONTRACT_ADDRESS)" target="_blank" rel="noopener noreferrer">View contract &#8599;</a></div>
    <p v-if="accountError" class="inline-error" role="alert">{{ accountError }}</p>
    <section v-if="tab==='home'" class="hero"><div><span class="eyebrow">&#10022; FIELD NOTES / 01</span><h1>A public square<br><em>for useful work.</em></h1><p>Partivio turns market curiosity into shared infrastructure. Complete open quests, stake conviction, and give every decision a visible trail.</p><div class="hero-actions"><button class="primary" @click="go('quests')">Explore quests &#8599;</button><button class="quiet" @click="go('learn')">Read the charter</button></div><div class="hero-footnote">COMMUNITY BUILT <span>/</span> TESTNET FIRST <span>/</span> OPEN CONTRACTS</div></div><div class="orb" aria-hidden="true"><div class="orbit one"></div><div class="orbit two"></div><div class="core"><img :src="partivioMark" alt="" width="165" height="165"></div><span class="orb-note n1">OPEN BY DEFAULT</span><span class="orb-note n2">CONTRIBUTE / STEWARD</span></div></section>
    <section v-if="tab==='home'" class="home-grid"><article><span class="label">THE LOOP</span><h2>Contribute. Earn. Steward.</h2><p>Partivio reward rules are public contract state. A contribution becomes a token balance, a position becomes a commitment, and a vote becomes a record.</p><div class="steps"><span>01</span><b>Discover an open quest</b><span>02</span><b>Build your DLU position</b><span>03</span><b>Shape the next Partivio season</b></div></article><article class="quote"><span aria-hidden="true">&ldquo;</span><p>Make useful work easy to find. Make its rewards easy to verify.</p><small>Partivio CHARTER / 2026</small><button class="quiet" @click="go('governance')">Enter governance &#8594;</button></article></section>

    <section v-if="tab==='quests'" class="page"><div class="page-head"><div><span class="eyebrow">QUEST BOARD / 02</span><h1>Small acts.<br><em>Compounding signal.</em></h1><p>Find an open quest and claim its published reward. Each wallet can claim once, before the cap or expiry is reached.</p></div><div class="filters" role="group" aria-label="Filter quests"><button v-for="f in ['all','open','claimed']" :key="f" :class="{selected:questFilter===f}" @click="questFilter=f">{{ f }}</button></div></div>
      <div class="empty" v-if="!reading && !visibleQuests.length">{{ readError ? 'Quest data is unavailable. Use Refresh to retry.' : questFilter==='all' ? 'No quests have been published yet.' : 'No quests match this filter.' }}</div>
      <div class="quest-grid"><article v-for="q in visibleQuests" :key="q.id" class="quest"><div class="quest-mark" aria-hidden="true">&#10022;</div><div class="quest-content"><div class="card-top"><span class="quest-id">{{ q.sample ? 'SAMPLE QUEST' : 'QUEST #'+q.id }}</span><span class="badge">{{ questStatus(q) }}</span></div><h3>{{ q.title }}</h3><p>{{ q.sample ? q.detail : 'An open participation reward. Claiming is recorded permanently on Robinhood Chain.' }}</p><div class="quest-meta"><b>{{ units(q.reward) }} DLU</b><span>{{ q.sample ? 'Example reward' : q.claims+' / '+q.maxClaims+' claimed' }}</span></div><p v-if="!q.sample">Expires {{ date(q.expiresAt) }}</p><button class="outline" :disabled="actionDisabled || (!q.sample && questStatus(q)!=='Open')" @click="claim(q)">{{ q.sample ? 'Preview quest' : q.claimed ? 'Already claimed' : questStatus(q)!=='Open' ? questStatus(q) : connected ? 'Claim reward' : 'Connect to claim' }} &#8594;</button><button v-if="isOwner" class="quiet steward-action" :disabled="busy" @click="setQuest(q)">{{ q.active ? 'Pause quest' : 'Resume quest' }}</button></div></article></div>
      <form v-if="isOwner" class="admin-box" @submit.prevent="createQuest"><span class="label">STEWARD TOOLS</span><h2>Publish an open quest</h2><p>Rewards are minted on claim, subject to the supply cap. Publish only rewards you intend to make available.</p><div class="form-row"><label>Quest title<input v-model="adminTitle" maxlength="200" required placeholder="Welcome to the Partivio"></label><label>Reward (DLU)<input v-model="adminReward" inputmode="decimal" required placeholder="10"></label><label>Maximum claims<input v-model="adminMax" type="number" min="1" max="1000000" required></label><label>Expires in days<input v-model="adminDays" type="number" min="1" max="365" required></label></div><button class="primary" :disabled="actionDisabled" type="submit">Publish quest</button></form>
    </section>

    <section v-if="tab==='stake'" class="page"><div class="page-head"><div><span class="eyebrow">STAKING DESK / 03</span><h1>Put conviction<br><em>on a clock.</em></h1><p>Lock DLU for 7 to 365 days. The protocol calculates simple yield; principal becomes withdrawable when the lock ends.</p></div><div class="position"><span class="label">YOUR POSITION</span><strong>{{ connected ? units(position.amount) : '--' }} DLU</strong><small>{{ connected ? 'Available: '+units(token)+' DLU' : 'Connect a wallet to see your position.' }}</small><small v-if="connected">Gas balance: {{ units(native,6) }} ETH</small><small v-if="position.amount>0n">Unlock: {{ date(position.unlockAt) }}</small></div></div>
      <div class="stake-layout"><form class="stake-card" @submit.prevent="stake"><span class="label">NEW DEPOSIT</span><label>Amount (DLU)<input v-model="stakeAmount" inputmode="decimal" autocomplete="off" placeholder="0.00" required></label><button class="text-link" type="button" :disabled="!connected || token===0n" @click="stakeAmount=exact(token)">Use available balance</button><label>Lock duration<select v-model="lockDays"><option :value="7">7 days</option><option :value="30">30 days</option><option :value="90">90 days</option><option :value="365">365 days</option></select></label><div class="estimate"><span>Estimated yield over this lock</span><b>{{ estimate }} DLU</b></div><p class="fine-print">Adding to an existing position can extend its unlock date. Estimates assume a constant rate and available reward supply.</p><button class="primary wide" :disabled="actionDisabled" type="submit">{{ busy ? 'Transaction in progress...' : connected ? 'Stake DLU' : 'Connect and stake' }} &#8594;</button></form><article class="yield-card"><span class="label">PROTOCOL RATE</span><strong>{{ (Number(apr)/100).toFixed(2) }}<small>% APR</small></strong><p>Simple, non-compounding rewards. Claiming earned yield does not reset your lock. Rewards stop being available when the token supply cap is reached.</p><div class="yield-amount"><span>Claimable yield</span><b>{{ units(position.yield,8) }} DLU</b></div><button class="outline" :disabled="actionDisabled || !connected || position.yield===0n" @click="claimYield">Claim yield</button><button class="quiet" :disabled="actionDisabled || !connected || position.amount===0n || !unlocked" @click="unstake">{{ position.amount>0n && !unlocked ? 'Principal locked' : 'Withdraw principal' }}</button><p class="fine-print" v-if="position.amount>0n && !unlocked">Withdrawal opens {{ date(position.unlockAt) }}. Your principal remains in the contract until you withdraw.</p></article></div>
    </section>

    <section v-if="tab==='governance'" class="page"><div class="page-head"><div><span class="eyebrow">Partivio GOVERNANCE / 04</span><h1>Make a case.<br><em>Cast a weight.</em></h1><p>Publish a decision for discussion, then vote For or Against. These votes are advisory and do not automatically spend treasury funds.</p></div><button class="primary" :aria-expanded="showProposal" @click="showProposal=!showProposal">{{ showProposal ? 'Close editor' : '+ New proposal' }}</button></div>
      <form v-if="showProposal" class="admin-box proposal-editor" @submit.prevent="createProposal"><label>Proposal description<textarea v-model="proposalText" minlength="10" maxlength="2000" required placeholder="Describe the decision, budget, and intended outcome."></textarea></label><div class="form-row"><label>Voting period (days)<input v-model="proposalDays" type="number" min="1" max="30" required></label><span class="fine-print">{{ proposalText.length }} / 2,000 characters</span></div><button class="primary" :disabled="actionDisabled" type="submit">Publish proposal</button></form>
      <div class="empty" v-if="configured && !reading && !visibleProposals.length">{{ readError ? 'Proposal data is unavailable. Use Refresh to retry.' : 'No proposals yet. Start the first Partivio discussion.' }}</div>
      <div class="proposal-list"><article v-for="p in visibleProposals" :key="p.id" class="proposal"><div class="proposal-copy"><span class="quest-id">{{ p.sample ? 'SAMPLE PROPOSAL' : 'PROPOSAL #'+p.id }}</span><span class="badge">{{ proposalStatus(p) }}</span><h3>{{ p.description }}</h3><p>{{ p.sample ? 'Illustrative proposal. No live votes.' : 'Voting ends '+date(p.endsAt) }}</p></div><div class="vote"><div><span>FOR {{ units(p.forVotes) }}</span><span>AGAINST {{ units(p.againstVotes) }}</span></div><div class="bar" role="img" :aria-label="votePercent(p)+' percent of cast weight supports this proposal'"><i :style="{width:votePercent(p)+'%'}"></i></div><small>{{ p.forVotes+p.againstVotes===0n ? 'No votes cast' : votePercent(p)+'% support' }}</small><div class="vote-buttons"><button :disabled="actionDisabled || (!p.sample && proposalStatus(p)!=='Open')" @click="vote(p,true)">Vote For</button><button :disabled="actionDisabled || (!p.sample && proposalStatus(p)!=='Open')" @click="vote(p,false)">Vote Against</button></div><small v-if="p.voted">Your vote is recorded.</small></div></article></div>
    </section>

    <section v-if="tab==='treasury'" class="page split"><div><span class="eyebrow">TREASURY LEDGER / 05</span><h1>Every route<br><em>has a receipt.</em></h1><p class="lede">Read the treasury's current balances and the contract's recent activity directly from Robinhood Chain.</p><div class="ledger"><div><span>Treasury DLU</span><b>{{ ready ? units(treasuryBalance) : '--' }}</b></div><div><span>Treasury testnet ETH</span><b>{{ ready ? units(treasuryNative,6) : '--' }}</b></div><div><span>Total issued DLU</span><b>{{ ready ? units(totalSupply) : '--' }}</b></div><div><span>DLU held by protocol</span><b>{{ ready ? units(totalStaked) : '--' }}</b></div><div><span>Your DLU balance</span><b>{{ connected ? units(token) : 'Connect wallet' }}</b></div><div><span>Treasury wallet</span><a v-if="treasury" :href="explorer('address',treasury)" target="_blank" rel="noopener noreferrer">{{ short(treasury) }} &#8599;</a><span v-else>Not available</span></div><div><span>Token contract</span><a v-if="configured" :href="explorer('address',CONTRACT_ADDRESS)" target="_blank" rel="noopener noreferrer">{{ short(CONTRACT_ADDRESS) }} &#8599;</a><span v-else>Not configured</span></div><div><span>Chain ID</span><b>{{ CHAIN_ID }}</b></div></div></div><article class="activity"><span class="label">RECENT CONTRACT EVENTS</span><p class="fine-print">Latest 2,000 blocks. Open the explorer for the complete history.</p><p v-if="eventsError" class="inline-error">{{ eventsError }}</p><p v-if="!activity.length" class="empty">{{ configured ? 'No recent events in this window.' : 'Events appear after deployment.' }}</p><div v-for="e in activity" :key="e.hash+e.index"><i aria-hidden="true">&#10022;</i><p>{{ eventDescription(e) }}<small>Block {{ e.block }} <a :href="explorer('tx',e.hash)" target="_blank" rel="noopener noreferrer">View transaction &#8599;</a></small></p></div></article></section>

    <section v-if="tab==='learn'" class="page learn"><span class="eyebrow">FIELD GUIDE / 06</span><h1>Learn the<br><em>Partivio grammar.</em></h1><div class="learn-grid"><article><span>01 / QUESTS</span><h2>Public rules. One claim.</h2><p>Each open quest declares its reward, expiry, and maximum number of claims. The contract allows one claim per wallet. Open quests do not verify off-chain work; wallet limits do not prove unique identity.</p></article><article><span>02 / STAKING</span><h2>Time makes trust visible</h2><p>Choose a 7, 30, 90, or 365-day lock. DLU moves into the contract without a separate token approval. Yield is simple; it does not automatically compound. Testnet tokens have no promised market value.</p></article><article><span>03 / GOVERNANCE</span><h2>Make decisions legible</h2><p>Describe a proposal and choose a 1 to 30-day voting period. Vote once per proposal. Results are advisory: treasury actions are performed separately by its steward.</p></article></div><div class="guide-details"><details open><summary>How do I get started?</summary><p>Connect an EVM wallet, switch to Robinhood Chain Testnet, and obtain testnet ETH for gas. Then claim an open quest to receive DLU and explore staking and governance.</p><a href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer">Open the official testnet faucet &#8599;</a></details><details><summary>Who controls the protocol?</summary><p>The contract owner publishes and pauses quests, can pause protocol actions, and controls treasury minting within the fixed supply cap. This testnet release is an experiment in transparent coordination, with these stewardship powers visible on-chain.</p></details><details><summary>What does a wallet confirmation do?</summary><p>Every claim, deposit, withdrawal, proposal, or vote is a transaction. Check its network and details before confirming. Rejected wallet requests submit nothing. After submission, this site shows a transaction link and waits for confirmation.</p></details><details><summary>Is this an official Robinhood product?</summary><p>No. Partivio is an independent community project built on Robinhood Chain Testnet. It is not affiliated with or endorsed by Robinhood Markets.</p></details></div></section>
  </main>
  <footer><span class="footer-logo"><img :src="partivioMark" alt="" aria-hidden="true"> PARTIVIO</span><span>Independent community project on Robinhood Chain Testnet</span><span>Testnet DLU / No promised financial return</span></footer>
  <aside v-if="txState.stage!=='idle'" class="status" :class="{bad:txState.stage==='error',success:txState.stage==='success'}" :role="txState.stage==='error'?'alert':'status'" aria-live="polite"><strong>{{ txState.label }}</strong><span>{{ txState.message }}</span><a v-if="txState.hash" :href="explorer('tx',txState.hash)" target="_blank" rel="noopener noreferrer">{{ short(txState.hash) }} / View transaction &#8599;</a><button v-if="!busy" aria-label="Dismiss transaction status" @click="txState={stage:'idle',label:'',message:'',hash:''}">&#215;</button></aside>
</div>
</template>

