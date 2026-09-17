<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { usePactelora } from "./usePactelora";
import { CHAIN_ID, CONTRACT_ADDRESS } from "./contract";
import pacteloraMark from "./assets/pactelora-mark.svg";
import Icon from "./Icon.vue";

const pactelora = usePactelora();
const {
  configured,
  wallet,
  token,
  tokenName,
  tokenSymbol,
  native,
  treasury,
  treasuryKnown,
  treasuryError,
  totalSupply,
  treasuryBalance,
  treasuryNative,
  totalStaked,
  apr,
  paused,
  quests,
  proposals,
  activity,
  eventsError,
  accountError,
  accountReading,
  accountReady,
  readError,
  reading,
  ready,
  lastRead,
  connected,
  wrongChain,
  isOwner,
  busy,
  unlocked,
  position,
  txState,
  connecting,
  switching,
  short,
  units,
  exact,
  date,
  explorer,
  notify,
  refresh,
  connect,
  switchNetwork,
  transact,
  questStatus,
  proposalStatus,
  votePercent,
  parseAmount,
} = pactelora;
const mobileMenu = ref(false);
const validTabs = [
  "home",
  "quests",
  "stake",
  "governance",
  "treasury",
  "learn",
];
const tab = ref(
  validTabs.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home",
);
function syncFromHash() {
  mobileMenu.value = false;
  const next = location.hash.slice(1);
  if (validTabs.includes(next)) tab.value = next;
  else tab.value = "home";
}
async function go(next) {
  mobileMenu.value = false;
  if (tab.value !== next) history.pushState(null, "", `#${next}`);
  tab.value = next;
  await nextTick();
  document.getElementById("main")?.focus({ preventScroll: true });
  window.scrollTo({
    top: 0,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}
onMounted(() => {
  window.addEventListener("hashchange", syncFromHash);
  window.addEventListener("popstate", syncFromHash);
});
onUnmounted(() => {
  window.removeEventListener("hashchange", syncFromHash);
  window.removeEventListener("popstate", syncFromHash);
});
const nav = [
  ["home", "Overview"],
  ["quests", "Quests"],
  ["stake", "Stake"],
  ["governance", "Governance"],
  ["treasury", "Treasury"],
  ["learn", "Guide"],
];
const stakeAmount = ref(""),
  lockDays = ref(30),
  proposalText = ref(""),
  proposalDays = ref(7),
  showProposal = ref(false);
const adminTitle = ref(""),
  adminReward = ref(""),
  adminMax = ref(100),
  adminDays = ref(30),
  questFilter = ref("all");
const samples = [
  {
    id: "sample-1",
    sample: true,
    title: "Read the Pactelora charter",
    reward: 12n * 10n ** 18n,
    detail: "A sample welcome quest. Learn how rewards and stewardship work.",
  },
  {
    id: "sample-2",
    sample: true,
    title: "Map a useful signal",
    reward: 28n * 10n ** 18n,
    detail: "A sample research quest. Share a source-backed observation.",
  },
  {
    id: "sample-3",
    sample: true,
    title: "Review a treasury route",
    reward: 45n * 10n ** 18n,
    detail:
      "A sample review quest. Compare proposals and explain your reasoning.",
  },
];
const sampleProposals = [
  {
    id: "sample-1",
    sample: true,
    description: "Reserve a season budget for community research bounties",
    forVotes: 0n,
    againstVotes: 0n,
    endsAt: 0,
  },
];
const search = ref("");
const draftSaved = ref(false);
const clearedDraft = ref(null);
watch(proposalText, (text) => {
  if (text) clearedDraft.value = null;
});
const draftKey = "pactelora-proposal-draft";
try {
  // Migrate unfinished drafts from previous application brands once.
  const legacyDraftKeys = [
    "quorivana-proposal-draft",
    "ralliva-proposal-draft",
  ];
  const savedDraft = sessionStorage.getItem(draftKey);
  const legacyDraft = savedDraft
    ? null
    : legacyDraftKeys.map((key) => sessionStorage.getItem(key)).find(Boolean);
  const draft = JSON.parse(savedDraft || legacyDraft || "null");
  if (draft && typeof draft.text === "string") {
    proposalText.value = draft.text.slice(0, 2000);
    proposalDays.value =
      Number.isInteger(draft.days) && draft.days >= 1 && draft.days <= 30
        ? draft.days
        : 7;
    draftSaved.value = Boolean(proposalText.value.trim());
    if (legacyDraft)
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ text: proposalText.value, days: proposalDays.value }),
      );
    // Removing stale copies prevents cleared drafts from returning later.
    legacyDraftKeys.forEach((key) => sessionStorage.removeItem(key));
  }
} catch {
  /* Draft persistence is optional when browser storage is unavailable. */
}
watch([proposalText, proposalDays], ([text, days]) => {
  try {
    if (text.trim())
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ text, days: Number(days) }),
      );
    else sessionStorage.removeItem(draftKey);
    draftSaved.value = Boolean(text.trim());
  } catch {
    draftSaved.value = false;
  }
});
async function openQuest(q) {
  resetFilters();
  await go("quests");
  const card = document.getElementById(`quest-${q.id}`);
  card?.focus({ preventScroll: true });
  card?.scrollIntoView({
    block: "center",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}
async function closeMenu() {
  mobileMenu.value = false;
  await nextTick();
  document.getElementById("menu-toggle")?.focus();
}
async function toggleMenu() {
  if (mobileMenu.value) return closeMenu();
  mobileMenu.value = true;
  await nextTick();
  document.querySelector('#primary-navigation [aria-current="page"]')?.focus();
}

const allQuests = computed(() => (configured ? quests.value : samples));
const visibleQuests = computed(() =>
  allQuests.value.filter(
    (q) =>
      (questFilter.value === "all" ||
        questStatus(q).toLowerCase() === questFilter.value) &&
      q.title.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
);
const featuredQuests = computed(() => allQuests.value.slice(0, 3));
const openQuests = computed(
  () => quests.value.filter((q) => questStatus(q) === "Open").length,
);
const openProposals = computed(
  () => proposals.value.filter((p) => proposalStatus(p) === "Open").length,
);
const stakeError = computed(() => {
  if (!stakeAmount.value.trim()) return "";
  try {
    const amount = parseAmount(stakeAmount.value);
    return connected.value && accountReady.value && amount > token.value
      ? `You only have ${units(token.value)} ${tokenSymbol.value} available.`
      : "";
  } catch (e) {
    return e.message;
  }
});
const metricsAvailable = computed(() => configured && ready.value);
async function toggleProposal() {
  showProposal.value = !showProposal.value;
  await nextTick();
  document
    .getElementById(
      showProposal.value ? "proposal-description" : "proposal-toggle",
    )
    ?.focus();
}
function resetFilters() {
  search.value = "";
  questFilter.value = "all";
}
const pageLabel = computed(
  () => nav.find(([id]) => id === tab.value)?.[1] || "Overview",
);
function clearDraft() {
  clearedDraft.value = { text: proposalText.value, days: proposalDays.value };
  proposalText.value = "";
  proposalDays.value = 7;
  document.getElementById("proposal-description")?.focus();
}
function undoClearDraft() {
  if (!clearedDraft.value || proposalText.value) return;
  const draft = clearedDraft.value;
  clearedDraft.value = null;
  proposalText.value = draft.text;
  proposalDays.value = draft.days;
  document.getElementById("proposal-description")?.focus();
}
function focusMain() {
  document.getElementById("main")?.focus();
}
const visibleProposals = computed(() =>
  configured ? proposals.value : sampleProposals,
);
const estimate = computed(() => {
  try {
    return units(
      (parseAmount(stakeAmount.value) * apr.value * BigInt(lockDays.value)) /
        365n /
        10000n,
      6,
    );
  } catch {
    return "0";
  }
});
const actionDisabled = computed(
  () =>
    busy.value ||
    connecting.value ||
    switching.value ||
    (configured &&
      (!ready.value ||
        reading.value ||
        paused.value ||
        (connected.value && (!accountReady.value || accountReading.value)))),
);
const tokenIdentity = computed(() => {
  if (!configured)
    return `${tokenName.value || "Sample token"} (${tokenSymbol.value}) - sample`;
  if (tokenName.value) return `${tokenName.value} (${tokenSymbol.value})`;
  return reading.value
    ? "Loading token identity..."
    : "Token identity unavailable";
});
function preview() {
  notify(
    "This is an example. Explore the workflow here; transactions require a configured contract.",
    "info",
  );
}
async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    notify(e.message);
  }
}
async function claim(q) {
  if (q.sample) return preview();
  if (questStatus(q) !== "Open")
    return notify("This quest is not available to claim.");
  await transact(`Claim quest #${q.id}`, (c) => c.claimQuest(q.id));
}
async function stake() {
  if (stakeError.value) return notify(stakeError.value);
  if (!configured) return preview();
  await guard(async () => {
    let amount;
    try {
      amount = parseAmount(stakeAmount.value);
    } catch (e) {
      return notify(e.message);
    }
    if (![7, 30, 90, 365].includes(Number(lockDays.value)))
      return notify("Choose a supported lock duration.");
    if (connected.value && accountReady.value && amount > token.value)
      return notify(
        `The amount exceeds your available ${tokenSymbol.value} balance.`,
      );
    if (
      await transact(`Stake ${tokenSymbol.value}`, (c) =>
        c.stake(amount, Number(lockDays.value) * 86400),
      )
    )
      stakeAmount.value = "";
  });
}
async function claimYield() {
  await transact("Claim staking yield", (c) => c.claimYield());
}
async function unstake() {
  if (!unlocked.value)
    return notify(`Your position unlocks on ${date(position.value.unlockAt)}.`);
  await transact(`Withdraw staked ${tokenSymbol.value}`, (c) => c.unstake());
}
async function vote(p, support) {
  if (p.sample) return preview();
  if (proposalStatus(p) !== "Open")
    return notify("Voting is closed or you already voted.");
  await transact(`Vote ${support ? "For" : "Against"} #${p.id}`, (c) =>
    c.vote(p.id, support),
  );
}
async function createProposal() {
  const description = proposalText.value.trim();
  if (description.length < 10 || description.length > 2000)
    return notify("Use 10 to 2,000 characters for your proposal.");
  if (
    !Number.isInteger(Number(proposalDays.value)) ||
    proposalDays.value < 1 ||
    proposalDays.value > 30
  )
    return notify("Voting duration must be 1 to 30 whole days.");
  if (!configured) return preview();
  const submittedDays = Number(proposalDays.value);
  if (
    await transact("Create governance proposal", (c) =>
      c.createProposal(description, submittedDays * 86400),
    )
  ) {
    // A wallet confirmation may take time; retain any newer draft typed meanwhile.
    if (
      proposalText.value.trim() === description &&
      Number(proposalDays.value) === submittedDays
    ) {
      proposalText.value = "";
      showProposal.value = false;
      await nextTick();
      document.getElementById("proposal-toggle")?.focus();
    }
  }
}
async function createQuest() {
  const title = adminTitle.value.trim();
  if (!title || title.length > 200)
    return notify("Use a quest title between 1 and 200 characters.");
  let reward;
  try {
    reward = parseAmount(adminReward.value, "Reward");
  } catch (e) {
    return notify(e.message);
  }
  if (
    !Number.isInteger(Number(adminMax.value)) ||
    adminMax.value < 1 ||
    adminMax.value > 1000000
  )
    return notify("Maximum claims must be 1 to 1,000,000.");
  if (
    !Number.isInteger(Number(adminDays.value)) ||
    adminDays.value < 1 ||
    adminDays.value > 365
  )
    return notify("Expiry must be 1 to 365 whole days from today.");
  const expiry =
    Math.floor(Date.now() / 1000) + Number(adminDays.value) * 86400;
  if (
    await transact("Publish quest", (c) =>
      c.createQuest(title, reward, expiry, Number(adminMax.value)),
    )
  ) {
    adminTitle.value = "";
    adminReward.value = "";
  }
}
async function setQuest(q) {
  await transact(`${q.active ? "Pause" : "Resume"} quest #${q.id}`, (c) =>
    c.setQuestActive(q.id, !q.active),
  );
}
function eventDescription(e) {
  const a = e.args;
  switch (e.name) {
    case "QuestCreated":
      return `Quest #${a.questId} published: ${a.title}`;
    case "QuestClaimed":
      return `${short(a.account)} claimed ${units(a.reward)} ${tokenSymbol.value}`;
    case "Staked":
      return `${short(a.account)} staked ${units(a.amount)} ${tokenSymbol.value}`;
    case "YieldClaimed":
      return `${short(a.account)} claimed ${units(a.amount, 6)} ${tokenSymbol.value} yield`;
    case "Unstaked":
      return `${short(a.account)} withdrew ${units(a.principal)} ${tokenSymbol.value}`;
    case "ProposalCreated":
      return `Proposal #${a.proposalId} opened`;
    case "VoteCast":
      return `${short(a.voter)} voted ${a.support ? "For" : "Against"} on #${a.proposalId}`;
    case "TreasuryMint":
      return `${units(a.amount)} ${tokenSymbol.value} issued to ${short(a.treasury)}`;
    case "QuestStatusChanged":
      return `Quest #${a.questId} ${a.active ? "resumed" : "paused"}`;
    default:
      return e.name.replace(/([a-z])([A-Z])/g, "$1 $2");
  }
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main" @click.prevent="focusMain"
      >Skip to content</a
    >
    <header
      class="sidebar"
      :class="{ expanded: mobileMenu }"
      @keydown.esc="closeMenu"
    >
      <button class="brand" aria-label="Pactelora home" @click="go('home')">
        <img :src="pacteloraMark" width="36" height="36" alt="" /><span
          >pactelora<span class="brand-caption">A little, together.</span></span
        >
      </button>
      <div class="sidebar-section-label">YOUR WORKSPACE</div>
      <nav
        id="primary-navigation"
        class="primary-navigation"
        aria-label="Main navigation"
      >
        <button
          v-for="n in nav"
          :key="n[0]"
          :class="{ active: tab === n[0] }"
          :aria-current="tab === n[0] ? 'page' : undefined"
          @click="go(n[0])"
        >
          <Icon :name="n[0]" :size="20" /><span>{{ n[1] }}</span
          ><span
            v-if="tab === n[0]"
            class="nav-current"
            aria-hidden="true"
          ></span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-note">
          <span class="sidebar-note-icon"
            ><Icon name="spark" :size="23"
          /></span>
          <h2>Good things start<br />with a small step.</h2>
          <p>Find your place in the community.</p>
          <button class="text-button" @click="go('learn')">
            Open the guide <Icon :size="16" />
          </button>
        </div>
        <div class="network-footnote">
          <span class="status-dot"></span
          ><span>Robinhood Chain <small>Testnet workspace</small></span
          ><Icon name="shield" :size="18" />
        </div>
      </div>
    </header>
    <button
      v-if="mobileMenu"
      class="menu-backdrop"
      aria-label="Close navigation overlay"
      @click="closeMenu"
    ></button>
    <div class="workspace">
      <header class="workspace-topbar" @keydown.esc="closeMenu">
        <div class="workspace-location">
          <button
            id="menu-toggle"
            class="menu-toggle icon-button"
            :aria-expanded="mobileMenu"
            aria-controls="primary-navigation"
            :aria-label="mobileMenu ? 'Close navigation' : 'Open navigation'"
            @click="toggleMenu"
          >
            <Icon :name="mobileMenu ? 'close' : 'menu'" /></button
          ><span class="workspace-name">Workspace</span
          ><span class="breadcrumb-slash">/</span
          ><span class="current-page">{{ pageLabel }}</span>
        </div>
        <div class="topbar-actions">
          <button
            class="network-button"
            :class="{ warning: wrongChain }"
            :disabled="busy || connecting || switching"
            @click="switchNetwork"
          >
            <span class="status-dot"></span
            >{{
              switching
                ? "Switching…"
                : wrongChain
                  ? "Switch network"
                  : "Testnet"
            }}<Icon name="chevron" :size="13" /></button
          ><button
            class="wallet-button"
            :disabled="connecting || busy || switching"
            @click="connect"
          >
            <Icon name="wallet" :size="17" /><span>{{
              connecting
                ? "Connecting…"
                : connected
                  ? short(wallet)
                  : "Connect wallet"
            }}</span>
          </button>
        </div>
      </header>
      <main id="main" tabindex="-1">
        <div v-if="!configured" class="notice preview-notice">
          <span class="notice-symbol"><Icon name="info" :size="17" /></span>
          <p>
            <strong>A space to explore.</strong> You’re in preview mode with
            sample content.
          </p>
          <button class="text-button" @click="go('learn')">
            How it works <Icon :size="15" />
          </button>
        </div>
        <div v-if="wrongChain" class="notice warning-notice" role="alert">
          <Icon name="info" />
          <p>
            Your wallet is on another network. Read data is from Robinhood Chain
            Testnet.
          </p>
          <button
            class="outline"
            :disabled="busy || connecting || switching"
            @click="switchNetwork"
          >
            Switch network
          </button>
        </div>
        <div v-if="paused" class="notice warning-notice" role="status">
          <Icon name="info" />
          <p>
            The protocol is paused. You can browse data; transactions are
            temporarily unavailable.
          </p>
        </div>
        <div v-if="configured" class="read-status">
          <span :class="{ failed: readError }" role="status"
            ><span
              class="status-dot"
              :class="{ loading: reading, failed: readError }"
            ></span
            >{{
              readError
                ? "Connection needs attention"
                : reading
                  ? "Syncing contract data…"
                  : "Synced at " + lastRead
            }}</span
          >
          <div>
            <a
              :href="explorer('address', CONTRACT_ADDRESS)"
              target="_blank"
              rel="noopener noreferrer"
              >View contract <Icon name="external" :size="14" /></a
            ><button
              :disabled="reading || busy"
              aria-label="Refresh contract data"
              @click="refresh"
            >
              <Icon
                name="refresh"
                :size="14"
                :class="{ spinning: reading }"
              />{{ reading ? "Syncing" : "Refresh" }}
            </button>
          </div>
        </div>
        <div v-if="readError" class="error-panel" role="alert">
          <div>
            <strong>We couldn’t sync the contract.</strong>
            <p>{{ readError }}</p>
          </div>
          <button class="outline" :disabled="reading || busy" @click="refresh">
            Try again
          </button>
        </div>
        <p v-if="accountError" class="inline-error" role="alert">
          {{ accountError }}
        </p>
        <p v-if="accountReading" class="account-loading" role="status">
          Reading your wallet balances and activity…
        </p>

        <section v-if="tab === 'home'" class="overview">
          <div class="overview-heading">
            <div>
              <span class="eyebrow">THE COMMUNITY, IN MOTION</span>
              <h1>Your next small step.</h1>
            </div>
            <span class="subtle-badge"
              ><span class="status-dot"></span
              >{{
                configured ? "On-chain workspace" : "Explore the possibilities"
              }}</span
            >
          </div>
          <div class="dashboard-top">
            <article class="welcome-card">
              <div class="welcome-copy">
                <span class="welcome-kicker"
                  ><span class="mini-line"></span> BUILT TOGETHER</span
                >
                <h2>Small actions.<br /><span>Shared purpose.</span></h2>
                <p>
                  A quest to join. An idea to share.<br />A place to make it
                  matter.
                </p>
                <button class="primary apricot" @click="go('quests')">
                  Find your first quest <Icon :size="18" />
                </button>
              </div>
              <div class="pact-art" aria-hidden="true">
                <div class="art-orbit orbit-one"></div>
                <div class="art-orbit orbit-two"></div>
                <svg viewBox="0 0 320 320" class="pact-rosette">
                  <defs>
                    <linearGradient id="pact-lilac" x1="0" y1="0" x2="1" y2="1">
                      <stop stop-color="#e6ddff" />
                      <stop offset="1" stop-color="#8b72cb" />
                    </linearGradient>
                    <linearGradient
                      id="pact-apricot"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop stop-color="#ffe0c7" />
                      <stop offset="1" stop-color="#c87571" />
                    </linearGradient>
                  </defs>
                  <g fill="none" stroke-width="32">
                    <ellipse
                      cx="160"
                      cy="121"
                      rx="56"
                      ry="83"
                      stroke="url(#pact-lilac)"
                      transform="rotate(-35 160 160)"
                    />
                    <ellipse
                      cx="160"
                      cy="121"
                      rx="56"
                      ry="83"
                      stroke="url(#pact-apricot)"
                      transform="rotate(55 160 160)"
                    />
                    <ellipse
                      cx="160"
                      cy="121"
                      rx="56"
                      ry="83"
                      stroke="url(#pact-lilac)"
                      transform="rotate(145 160 160)"
                    />
                    <ellipse
                      cx="160"
                      cy="121"
                      rx="56"
                      ry="83"
                      stroke="url(#pact-apricot)"
                      transform="rotate(235 160 160)"
                    />
                  </g>
                  <path
                    d="M79 141c-6-26 2-53 21-70"
                    stroke="#e2d6ff"
                    stroke-width="32"
                    fill="none"
                  /></svg
                ><span class="art-spark art-spark-one">✦</span
                ><span class="art-spark art-spark-two">+</span
                ><span class="art-caption">MANY PARTS. ONE PURPOSE.</span>
              </div>
            </article>
            <aside class="signal-card">
              <div class="signal-heading">
                <span class="eyebrow">COMMUNITY PULSE</span
                ><Icon name="pulse" :size="18" />
              </div>
              <div class="signal-row">
                <span class="signal-icon"><Icon name="quests" /></span>
                <div>
                  <span>Open quests</span
                  ><strong>{{
                    metricsAvailable ? openQuests.toLocaleString() : "—"
                  }}</strong>
                </div>
              </div>
              <div class="signal-row">
                <span class="signal-icon peach"><Icon name="stake" /></span>
                <div>
                  <span>Held by protocol</span
                  ><strong
                    >{{ metricsAvailable ? units(totalStaked, 0) : "—" }}
                    <small>{{ tokenSymbol }}</small></strong
                  >
                </div>
              </div>
              <div class="signal-row">
                <span class="signal-icon mint"><Icon name="governance" /></span>
                <div>
                  <span>Open proposals</span
                  ><strong>{{
                    metricsAvailable ? openProposals.toLocaleString() : "—"
                  }}</strong>
                </div>
              </div>
              <p class="signal-footnote">
                <span class="status-dot"></span
                >{{
                  metricsAvailable
                    ? "Read directly from the contract"
                    : configured
                      ? "Awaiting chain data"
                      : "Preview · no live balances"
                }}
              </p>
            </aside>
          </div>
          <div class="section-heading">
            <h2>Make a little progress</h2>
            <span class="muted-label">Three ways to take part</span>
          </div>
          <div class="launchpad">
            <button class="launch-card" @click="go('quests')">
              <span class="launch-icon"><Icon name="quests" :size="24" /></span
              ><span class="launch-copy"
                ><strong>Find a quest</strong
                ><small>Useful work starts here.</small></span
              ><Icon :size="19" /></button
            ><button class="launch-card" @click="go('stake')">
              <span class="launch-icon peach"
                ><Icon name="stake" :size="24" /></span
              ><span class="launch-copy"
                ><strong>Build a position</strong
                ><small>Put time behind your tokens.</small></span
              ><Icon :size="19" /></button
            ><button class="launch-card" @click="go('governance')">
              <span class="launch-icon mint"
                ><Icon name="governance" :size="24" /></span
              ><span class="launch-copy"
                ><strong>Shape what’s next</strong
                ><small>Bring your voice to the table.</small></span
              ><Icon :size="19" />
            </button>
          </div>
          <div class="dashboard-bottom">
            <section class="opportunity-panel">
              <div class="section-heading">
                <h2>A place to begin</h2>
                <button class="text-button" @click="go('quests')">
                  All quests <Icon :size="16" />
                </button>
              </div>
              <div class="starter-list">
                <button
                  v-for="(q, index) in featuredQuests"
                  :key="q.id"
                  class="starter-row"
                  @click="openQuest(q)"
                >
                  <span class="starter-icon"
                    ><Icon
                      :name="['learn', 'spark', 'treasury'][index % 3]"
                      :size="21" /></span
                  ><span class="starter-copy"
                    ><span class="tiny-label">{{
                      q.sample ? "SAMPLE QUEST" : questStatus(q) + " QUEST"
                    }}</span
                    ><strong>{{ q.title }}</strong></span
                  ><span class="row-reward"
                    >{{ units(q.reward) }}<small>{{ tokenSymbol }}</small></span
                  ><Icon :size="17" />
                </button>
                <div v-if="!featuredQuests.length" class="empty compact">
                  <Icon name="quests" :size="28" />
                  <h3>
                    {{
                      reading
                        ? "Finding your next move…"
                        : readError
                          ? "Quests will appear once connected."
                          : "The next chapter is open."
                    }}
                  </h3>
                  <p>
                    {{
                      reading
                        ? "Reading the latest quests from the contract."
                        : "Explore the guide while the community prepares its next quests."
                    }}
                  </p>
                  <button class="text-button" @click="go('learn')">
                    Read the guide <Icon :size="17" />
                  </button>
                </div>
              </div>
            </section>
            <article class="transparency-card">
              <span class="round-icon"><Icon name="treasury" :size="26" /></span
              ><span class="eyebrow">NOTHING BEHIND THE CURTAIN</span>
              <h2>Shared resources.<br />A clear view.</h2>
              <p>
                Follow the funds and the decisions that move this community
                forward.
              </p>
              <button class="text-button" @click="go('treasury')">
                Explore the treasury <Icon :size="17" />
              </button>
            </article>
          </div>
        </section>
        <section v-if="tab === 'quests'" class="page quests-page">
          <div class="page-head">
            <div>
              <span class="eyebrow">CONTRIBUTE / FIND YOUR PART</span>
              <h1>A little work. A shared win.</h1>
              <p>
                Explore quests and claim a testnet reward. Every quest has its
                own cap and deadline, with one claim per wallet.
              </p>
            </div>
            <span class="page-emblem"><Icon name="quests" :size="32" /></span>
          </div>
          <div class="quest-workspace">
            <div class="quest-toolbar">
              <label class="search-field"
                ><Icon name="search" :size="19" /><span class="sr-only"
                  >Search quests</span
                ><input
                  v-model="search"
                  type="search"
                  placeholder="Find something to work on…"
                  autocomplete="off"
              /></label>
              <div class="filters" role="group" aria-label="Filter quests">
                <button
                  v-for="f in configured
                    ? ['all', 'open', 'claimed']
                    : ['all', 'sample']"
                  :key="f"
                  :aria-pressed="questFilter === f"
                  :class="{ selected: questFilter === f }"
                  @click="questFilter = f"
                >
                  {{ f
                  }}<span v-if="f === 'all'" class="filter-count">{{
                    allQuests.length
                  }}</span>
                </button>
              </div>
              <span class="results-count" role="status"
                >{{ visibleQuests.length }}
                {{ visibleQuests.length === 1 ? "quest" : "quests" }}</span
              >
            </div>
            <div
              v-if="reading && !allQuests.length"
              class="skeleton-grid"
              role="status"
            >
              <span class="sr-only">Loading quests</span>
              <div v-for="i in 3" :key="i" class="skeleton"></div>
            </div>
            <div v-if="!reading && !visibleQuests.length" class="empty">
              <Icon name="search" :size="32" />
              <h2>
                {{
                  readError
                    ? "Quest data is unavailable."
                    : search || questFilter !== "all"
                      ? "No quests found."
                      : "Room for the first contribution."
                }}
              </h2>
              <p>
                {{
                  readError
                    ? "Retry the connection to load the latest quests."
                    : search || questFilter !== "all"
                      ? "Try a different keyword or show all quests."
                      : "No quests have been published yet. Check back for the next community activity."
                }}
              </p>
              <button
                v-if="search || questFilter !== 'all'"
                class="outline"
                @click="resetFilters"
              >
                Clear filters</button
              ><button
                v-else-if="readError"
                class="outline"
                :disabled="reading"
                @click="refresh"
              >
                Try again
              </button>
            </div>
            <div class="quest-grid">
              <article
                v-for="(q, index) in visibleQuests"
                :key="q.id"
                class="quest-card"
                :id="'quest-' + q.id"
                :aria-labelledby="'quest-title-' + q.id"
                tabindex="-1"
              >
                <div class="quest-card-top">
                  <span
                    class="quest-symbol"
                    :class="['lilac', 'peach', 'mint'][index % 3]"
                    ><Icon
                      :name="['learn', 'spark', 'treasury'][index % 3]"
                      :size="26" /></span
                  ><span
                    class="badge"
                    :class="{ open: questStatus(q) === 'Open' }"
                    >{{ questStatus(q) }}</span
                  >
                </div>
                <div class="quest-main">
                  <span class="tiny-label">{{
                    q.sample
                      ? "EXAMPLE QUEST"
                      : "QUEST / " + String(q.id).padStart(3, "0")
                  }}</span>
                  <h2 :id="'quest-title-' + q.id">{{ q.title }}</h2>
                  <p>
                    {{
                      q.sample
                        ? q.detail
                        : "An open participation reward. Claiming is recorded on Robinhood Chain. No off-chain work is verified by this claim."
                    }}
                  </p>
                  <div v-if="!q.sample" class="quest-cap">
                    <div>
                      <span
                        >{{ q.claims.toLocaleString() }} /
                        {{ q.maxClaims.toLocaleString() }} claimed</span
                      ><span
                        >{{
                          Math.max(0, q.maxClaims - q.claims).toLocaleString()
                        }}
                        left</span
                      >
                    </div>
                    <progress
                      :value="q.claims"
                      :max="q.maxClaims || 1"
                      :aria-label="
                        q.claims + ' of ' + q.maxClaims + ' claims used'
                      "
                    ></progress
                    ><span
                      ><Icon name="clock" :size="14" />Closes
                      {{ date(q.expiresAt) }}</span
                    >
                  </div>
                </div>
                <div class="quest-action">
                  <div class="quest-reward">
                    <span>Reward <small v-if="q.sample">· example</small></span
                    ><strong
                      >{{ units(q.reward) }}
                      <small>{{ tokenSymbol }}</small></strong
                    >
                  </div>
                  <button
                    class="outline wide"
                    :disabled="
                      actionDisabled || (!q.sample && questStatus(q) !== 'Open')
                    "
                    @click="claim(q)"
                  >
                    {{
                      q.sample
                        ? "Preview quest"
                        : q.claimed
                          ? "Already claimed"
                          : questStatus(q) !== "Open"
                            ? questStatus(q)
                            : connected
                              ? "Claim reward"
                              : "Connect to claim"
                    }}<Icon :size="17" /></button
                  ><button
                    v-if="isOwner && !q.sample"
                    class="text-button steward-action"
                    :disabled="busy"
                    @click="setQuest(q)"
                  >
                    {{ q.active ? "Pause quest" : "Resume quest" }}
                  </button>
                </div>
              </article>
            </div>
          </div>
          <div class="quest-guidance">
            <Icon name="shield" :size="22" />
            <div>
              <strong>Your wallet, your decision.</strong>
              <p>
                Review the quest and network before confirming. A preview never
                sends a transaction.
              </p>
            </div>
            <button class="text-button" @click="go('learn')">
              How quests work <Icon :size="17" />
            </button>
          </div>
          <form
            v-if="isOwner"
            class="panel admin-box"
            @submit.prevent="createQuest"
          >
            <div class="admin-intro">
              <span class="eyebrow">STEWARD TOOLS</span>
              <h2>Make room for<br />the next contribution.</h2>
              <p>Rewards are minted when claimed, subject to the supply cap.</p>
            </div>
            <div class="admin-fields">
              <h3>Publish a quest</h3>
              <div class="form-row">
                <label
                  >Quest title<input
                    v-model="adminTitle"
                    maxlength="200"
                    required
                    placeholder="Welcome to Pactelora" /></label
                ><label
                  >Reward ({{ tokenSymbol }})<input
                    v-model="adminReward"
                    inputmode="decimal"
                    required
                    placeholder="10"
                /></label>
              </div>
              <div class="form-row">
                <label
                  >Maximum claims<input
                    v-model="adminMax"
                    type="number"
                    min="1"
                    max="1000000"
                    required /></label
                ><label
                  >Expires in days<input
                    v-model="adminDays"
                    type="number"
                    min="1"
                    max="365"
                    required
                /></label>
              </div>
              <button class="primary" :disabled="actionDisabled" type="submit">
                Publish quest <Icon name="plus" :size="18" />
              </button>
            </div>
          </form>
        </section>

        <section v-if="tab === 'stake'" class="page stake-page">
          <div class="page-head">
            <div>
              <span class="eyebrow">COMMIT / MAKE TIME COUNT</span>
              <h1>A position with purpose.</h1>
              <p>
                Commit test tokens for a period you choose. Track your rewards
                and withdraw your principal after the lock ends.
              </p>
            </div>
            <span class="page-emblem peach"
              ><Icon name="stake" :size="32"
            /></span>
          </div>
          <div class="stake-layout">
            <div class="position-column">
              <article class="position-card">
                <div class="panel-heading">
                  <span class="eyebrow">YOUR POSITION</span
                  ><span class="position-icon"
                    ><Icon name="wallet" :size="21"
                  /></span>
                </div>
                <strong class="position-balance"
                  >{{ connected && accountReady ? units(position.amount) : "—"
                  }}<small>{{ tokenSymbol }} committed</small></strong
                >
                <p>
                  {{
                    connected
                      ? !accountReady
                        ? accountReading
                          ? "Reading your wallet data…"
                          : "Wallet data needs a refresh."
                        : position.amount > 0n
                          ? "A small commitment to shared progress."
                          : "Your first commitment starts here."
                      : "Connect your wallet to see your position."
                  }}
                </p>
                <div class="position-data">
                  <div class="position-detail">
                    <span>Claimable rewards</span
                    ><b
                      >{{
                        connected && accountReady
                          ? units(position.yield, 8)
                          : "—"
                      }}
                      {{ tokenSymbol }}</b
                    >
                  </div>
                  <div class="position-detail">
                    <span>Unlock date</span
                    ><b>{{
                      connected && !accountReady
                        ? "Waiting for wallet data"
                        : connected && position.amount > 0n
                          ? date(position.unlockAt)
                          : "No active lock"
                    }}</b>
                  </div>
                  <div v-if="connected" class="position-detail">
                    <span>Gas balance</span
                    ><b>{{ accountReady ? units(native, 6) : "?" }} ETH</b>
                  </div>
                </div>
                <button
                  v-if="!connected"
                  class="outline wide"
                  :disabled="connecting || busy || switching"
                  @click="connect"
                >
                  Connect wallet <Icon name="wallet" :size="18" /></button
                ><template v-else
                  ><button
                    class="outline wide"
                    :disabled="
                      actionDisabled || position.yield === 0n || !!accountError
                    "
                    @click="claimYield"
                  >
                    Claim rewards <Icon :size="18" /></button
                  ><button
                    class="text-button wide"
                    :disabled="
                      actionDisabled ||
                      position.amount === 0n ||
                      !unlocked ||
                      !!accountError
                    "
                    @click="unstake"
                  >
                    {{
                      position.amount > 0n && !unlocked
                        ? "Principal is locked"
                        : "Withdraw principal"
                    }}
                  </button></template
                >
              </article>
              <article class="staking-note">
                <Icon name="shield" :size="23" />
                <div>
                  <h3>A clear commitment.</h3>
                  <p>
                    Rewards are simple, without automatic compounding. Claiming
                    rewards keeps your lock unchanged. The supply cap limits
                    reward availability.
                  </p>
                  <p class="fine-print">
                    Testnet tokens have no promised market value or financial
                    return.
                  </p>
                  <button class="text-button" @click="go('learn')">
                    Read the guide <Icon :size="16" />
                  </button>
                </div>
              </article>
            </div>
            <form class="panel stake-card" @submit.prevent="stake">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">SET UP YOUR COMMITMENT</span>
                  <h2>Create a position</h2>
                </div>
                <span class="badge">{{
                  configured ? "Testnet" : "Sample"
                }}</span>
              </div>
              <ol class="flow-steps" aria-label="Staking steps">
                <li class="current"><span>1</span>Set terms</li>
                <li><span>2</span>Review in wallet</li>
                <li><span>3</span>Track position</li>
              </ol>
              <label class="amount-label" for="stake-amount"
                >Amount to stake<span
                  >Available:
                  {{ connected && accountReady ? units(token) : "—" }}
                  {{ tokenSymbol }}</span
                ></label
              >
              <div class="amount-field" :class="{ invalid: stakeError }">
                <input
                  id="stake-amount"
                  v-model="stakeAmount"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0.00"
                  required
                  :aria-invalid="Boolean(stakeError)"
                  aria-describedby="stake-error"
                /><span>{{ tokenSymbol }}</span
                ><button
                  type="button"
                  :disabled="
                    !connected ||
                    !accountReady ||
                    accountReading ||
                    token === 0n
                  "
                  @click="stakeAmount = exact(token)"
                >
                  Max
                </button>
              </div>
              <p
                id="stake-error"
                class="field-message"
                :class="{ 'inline-error': stakeError }"
                aria-live="polite"
              >
                {{
                  stakeError ||
                  "Your tokens move directly into the protocol. No separate approval."
                }}
              </p>
              <fieldset class="duration-field">
                <legend>Choose your lock duration</legend>
                <div class="duration-options">
                  <label
                    v-for="days in [7, 30, 90, 365]"
                    :key="days"
                    :class="{ chosen: Number(lockDays) === days }"
                    ><input
                      v-model="lockDays"
                      type="radio"
                      :value="days"
                      name="lock-duration" /><span>{{ days }}</span
                    ><small>days</small
                    ><Icon
                      v-if="Number(lockDays) === days"
                      name="check"
                      :size="13"
                  /></label>
                </div>
              </fieldset>
              <div class="deposit-summary">
                <div>
                  <span>{{
                    configured ? "Protocol rate" : "Example rate"
                  }}</span
                  ><strong>{{
                    configured && !ready
                      ? "—"
                      : (Number(apr) / 100).toFixed(2) + "% APR"
                  }}</strong>
                </div>
                <div>
                  <span>Estimated reward over {{ lockDays }} days</span
                  ><strong
                    >{{ configured && !ready ? "—" : estimate }}
                    {{ tokenSymbol }}</strong
                  >
                </div>
                <div>
                  <span>Network gas</span><span>Paid in testnet ETH</span>
                </div>
              </div>
              <div class="form-note">
                <Icon name="info" :size="17" />
                <p>
                  Adding to a position can extend its unlock date. Estimates
                  assume an unchanged rate and available reward supply.
                </p>
              </div>
              <button
                class="primary wide"
                :disabled="
                  actionDisabled || Boolean(stakeError) || !stakeAmount.trim()
                "
                type="submit"
              >
                {{
                  busy
                    ? "Transaction in progress…"
                    : !configured
                      ? "Preview staking"
                      : connected
                        ? "Stake " + tokenSymbol
                        : "Connect and stake"
                }}<Icon :size="18" />
              </button>
            </form>
          </div>
        </section>
        <section v-if="tab === 'governance'" class="page governance-page">
          <div class="page-head">
            <div>
              <span class="eyebrow">COORDINATE / EVERY VOICE COUNTS</span>
              <h1>The next chapter starts here.</h1>
              <p>
                Put an idea into words, hear other perspectives, and help choose
                a direction. Votes are advisory; treasury spending remains a
                separate steward action.
              </p>
            </div>
            <span class="page-emblem mint"
              ><Icon name="governance" :size="32"
            /></span>
          </div>
          <div class="governance-layout">
            <aside class="compose-column">
              <div class="compose-intro">
                <span class="round-icon"><Icon name="plus" :size="25" /></span>
                <h2>Have a thought?</h2>
                <p>
                  Every shared decision begins with someone putting an idea
                  forward.
                </p>
                <button
                  id="proposal-toggle"
                  class="primary wide"
                  :aria-expanded="showProposal"
                  aria-controls="proposal-editor"
                  @click="toggleProposal"
                >
                  <Icon :name="showProposal ? 'close' : 'plus'" :size="18" />{{
                    showProposal
                      ? "Close editor"
                      : draftSaved
                        ? "Continue your draft"
                        : "New proposal"
                  }}</button
                ><span
                  v-if="draftSaved && !showProposal"
                  class="draft-indicator"
                  ><Icon name="check" :size="14" />Your draft is saved in this
                  tab.</span
                >
              </div>
              <form
                v-if="showProposal"
                id="proposal-editor"
                class="panel proposal-editor"
                @submit.prevent="createProposal"
                @keydown.esc.prevent="toggleProposal"
              >
                <div class="panel-heading">
                  <h2>Shape your idea</h2>
                  <span class="badge">Draft</span>
                </div>
                <label for="proposal-description">Proposal description</label
                ><textarea
                  id="proposal-description"
                  v-model="proposalText"
                  minlength="10"
                  maxlength="2000"
                  required
                  placeholder="Describe the decision, its purpose, any budget, and the intended outcome."
                  aria-describedby="proposal-help"
                ></textarea>
                <div id="proposal-help" class="editor-help">
                  <span>{{
                    draftSaved
                      ? "Draft saved in this tab."
                      : "10–2,000 characters."
                  }}</span
                  ><span>{{ proposalText.length }} / 2,000</span>
                </div>
                <p class="fine-print">
                  Published proposals are recorded on-chain.
                </p>
                <label class="voting-period"
                  >Voting period (days)<input
                    v-model="proposalDays"
                    type="number"
                    min="1"
                    max="30"
                    required /></label
                ><button
                  class="primary wide"
                  :disabled="actionDisabled || proposalText.trim().length < 10"
                  type="submit"
                >
                  {{ !configured ? "Preview proposal" : "Publish proposal"
                  }}<Icon :size="18" />
                </button>
                <div class="editor-actions">
                  <button class="quiet" type="button" @click="toggleProposal">
                    Keep draft & close</button
                  ><button
                    v-if="proposalText"
                    class="quiet"
                    type="button"
                    @click="clearDraft"
                  >
                    Clear draft</button
                  ><button
                    v-else-if="clearedDraft"
                    class="quiet"
                    type="button"
                    @click="undoClearDraft"
                  >
                    Undo clear
                  </button>
                </div>
              </form>
              <div class="voting-guide">
                <span class="eyebrow">A THOUGHTFUL PROPOSAL</span>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <strong>Make it clear</strong>
                      <p>Describe one decision and why it matters.</p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <strong>Give it context</strong>
                      <p>Include the intended outcome and any budget.</p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <strong>Leave room to consider</strong>
                      <p>Choose a voting window of 1–30 days.</p>
                    </div>
                  </li>
                </ol>
              </div>
            </aside>
            <div class="proposal-feed">
              <div class="section-heading proposal-heading">
                <h2>Community proposals</h2>
                <span class="count-badge">{{ visibleProposals.length }}</span>
              </div>
              <div
                v-if="configured && reading && !visibleProposals.length"
                class="skeleton"
                role="status"
              >
                <span class="sr-only">Loading proposals</span>
              </div>
              <div
                v-if="configured && !reading && !visibleProposals.length"
                class="empty"
              >
                <Icon name="governance" :size="32" />
                <h2>
                  {{
                    readError
                      ? "Proposals are unavailable."
                      : "The floor is yours."
                  }}
                </h2>
                <p>
                  {{
                    readError
                      ? "Use Try again above to reconnect."
                      : "Start the first Pactelora discussion with a clear idea and a voting period."
                  }}
                </p>
                <button
                  v-if="!readError && !showProposal"
                  class="outline"
                  @click="toggleProposal"
                >
                  Create the first proposal
                </button>
              </div>
              <div class="proposal-list">
                <article
                  v-for="p in visibleProposals"
                  :key="p.id"
                  class="proposal panel"
                >
                  <div class="proposal-copy">
                    <div class="proposal-meta">
                      <span class="tiny-label">{{
                        p.sample
                          ? "SAMPLE PROPOSAL"
                          : "PROPOSAL / " + String(p.id).padStart(3, "0")
                      }}</span
                      ><span
                        class="badge"
                        :class="{ open: proposalStatus(p) === 'Open' }"
                        >{{ proposalStatus(p) }}</span
                      >
                    </div>
                    <h2>{{ p.description }}</h2>
                    <p>
                      <Icon name="clock" :size="15" />{{
                        p.sample
                          ? "Example only · no live votes"
                          : "Voting ends " + date(p.endsAt)
                      }}
                    </p>
                  </div>
                  <div class="vote">
                    <div class="vote-totals">
                      <span
                        ><i class="vote-dot"></i>For
                        <b>{{ units(p.forVotes) }}</b></span
                      ><span
                        ><i class="vote-dot against"></i>Against
                        <b>{{ units(p.againstVotes) }}</b></span
                      >
                    </div>
                    <div
                      class="vote-bar"
                      role="img"
                      :aria-label="
                        p.forVotes + p.againstVotes === 0n
                          ? 'No votes cast'
                          : votePercent(p) + ' percent support'
                      "
                    >
                      <i :style="{ width: votePercent(p) + '%' }"></i>
                    </div>
                    <small>{{
                      p.forVotes + p.againstVotes === 0n
                        ? "Waiting for the first vote"
                        : votePercent(p) + "% of cast weight supports this"
                    }}</small>
                    <div class="vote-buttons">
                      <button
                        class="outline"
                        :disabled="
                          actionDisabled ||
                          (!p.sample && proposalStatus(p) !== 'Open')
                        "
                        @click="vote(p, true)"
                      >
                        <Icon name="check" :size="16" />Vote For</button
                      ><button
                        class="outline"
                        :disabled="
                          actionDisabled ||
                          (!p.sample && proposalStatus(p) !== 'Open')
                        "
                        @click="vote(p, false)"
                      >
                        <Icon name="close" :size="16" />Vote Against
                      </button>
                    </div>
                    <p v-if="p.voted" class="vote-recorded">
                      <Icon name="check" :size="15" />Your vote is recorded.
                    </p>
                  </div>
                </article>
              </div>
              <div class="form-note governance-note">
                <Icon name="info" />
                <p>
                  One vote per wallet per proposal. Voting weight follows the
                  connected contract’s rules. Your current balance may differ
                  from eligible voting weight.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section v-if="tab === 'treasury'" class="page treasury-page">
          <div class="page-head">
            <div>
              <span class="eyebrow">VERIFY / FOLLOW THE DETAILS</span>
              <h1>A shared fund. An open book.</h1>
              <p>
                See the community’s resources and the activity behind them, read
                directly from Robinhood Chain.
              </p>
            </div>
            <span class="page-emblem"><Icon name="treasury" :size="32" /></span>
          </div>
          <div class="treasury-layout">
            <div class="treasury-balances">
              <article class="treasury-main">
                <div class="panel-heading">
                  <span class="eyebrow">TREASURY BALANCE</span
                  ><Icon name="treasury" :size="24" />
                </div>
                <strong
                  >{{ ready && treasuryKnown ? units(treasuryBalance) : "—"
                  }}<small>{{ tokenSymbol }}</small></strong
                ><span>{{ tokenIdentity }}</span>
                <div class="treasury-gas">
                  <Icon name="wallet" :size="19" /><span
                    >Treasury gas balance</span
                  ><strong
                    >{{ ready && treasuryKnown ? units(treasuryNative, 6) : "—"
                    }}<small>Testnet ETH</small></strong
                  >
                </div>
              </article>
              <p
                v-if="treasuryError || (configured && ready && !treasuryKnown)"
                class="treasury-notice"
                role="status"
              >
                <Icon name="info" :size="17" />{{
                  treasuryError ||
                  "A verified treasury address is not available for this contract. Treasury balances remain unknown."
                }}
              </p>
              <article class="panel ledger">
                <div class="panel-heading">
                  <h2>The details behind the balance</h2>
                  <Icon name="layers" :size="20" />
                </div>
                <dl>
                  <div>
                    <dt>On-chain token</dt>
                    <dd>{{ tokenIdentity }}</dd>
                  </div>
                  <div>
                    <dt>Total issued {{ tokenSymbol }}</dt>
                    <dd>{{ ready ? units(totalSupply) : "—" }}</dd>
                  </div>
                  <div>
                    <dt>{{ tokenSymbol }} held by protocol</dt>
                    <dd>{{ ready ? units(totalStaked) : "—" }}</dd>
                  </div>
                  <div>
                    <dt>Your {{ tokenSymbol }} balance</dt>
                    <dd>
                      {{
                        connected && accountReady
                          ? units(token)
                          : connected
                            ? "Unavailable"
                            : "Connect wallet"
                      }}
                    </dd>
                  </div>
                </dl>
                <span class="eyebrow ledger-label"
                  >NETWORK &amp; ADDRESSES</span
                >
                <dl>
                  <div>
                    <dt>Treasury wallet</dt>
                    <dd>
                      <a
                        v-if="treasury"
                        :href="explorer('address', treasury)"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ short(treasury)
                        }}<Icon name="external" :size="15" /></a
                      ><span v-else>Not available</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Token contract</dt>
                    <dd>
                      <a
                        v-if="configured"
                        :href="explorer('address', CONTRACT_ADDRESS)"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ short(CONTRACT_ADDRESS)
                        }}<Icon name="external" :size="15" /></a
                      ><span v-else>Not configured</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Network</dt>
                    <dd>Robinhood Chain Testnet</dd>
                  </div>
                  <div>
                    <dt>Chain ID</dt>
                    <dd>{{ CHAIN_ID }}</dd>
                  </div>
                </dl>
                <p class="fine-print">
                  Pactelora is the app brand.
                  {{
                    configured
                      ? "The connected contract defines the on-chain token name and symbol."
                      : "Token details are examples until a deployed contract is configured."
                  }}
                </p>
              </article>
            </div>
            <article class="panel activity">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">THE LATEST CHAPTER</span>
                  <h2>Recent activity</h2>
                </div>
                <span class="subtle-badge"
                  ><span class="status-dot"></span>On-chain</span
                >
              </div>
              <p class="fine-print">
                Latest 2,000 blocks. The explorer holds the full history.
              </p>
              <p v-if="eventsError" class="inline-error" role="alert">
                {{ eventsError }}
              </p>
              <div v-if="!activity.length" class="empty compact">
                <span class="empty-orbit"
                  ><Icon name="clock" :size="30"
                /></span>
                <h3>
                  {{
                    reading
                      ? "Reading the ledger…"
                      : readError || eventsError
                        ? "Activity could not load."
                        : "A quiet moment on-chain."
                  }}
                </h3>
                <p>
                  {{
                    configured
                      ? "Recent contract events will appear here after a successful sync."
                      : "Activity appears when a contract is configured."
                  }}
                </p>
              </div>
              <ol v-else class="activity-list">
                <li v-for="e in activity" :key="e.hash + e.index">
                  <span class="event-icon"
                    ><Icon name="arrow" :size="16"
                  /></span>
                  <div>
                    <p>{{ eventDescription(e) }}</p>
                    <span>Block {{ e.block.toLocaleString() }}</span
                    ><a
                      :href="explorer('tx', e.hash)"
                      target="_blank"
                      rel="noopener noreferrer"
                      >View transaction <Icon name="external" :size="14"
                    /></a>
                  </div>
                </li>
              </ol>
              <div class="activity-note">
                <Icon name="shield" :size="19" />
                <p>
                  Open records help everyone see where the community stands.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section v-if="tab === 'learn'" class="page learn">
          <div class="page-head">
            <div>
              <span class="eyebrow">THE PACTELORA GUIDE</span>
              <h1>Find your feet.<br />Then find your part.</h1>
              <p>
                A few things to know before your first contribution. Follow the
                path at your own pace.
              </p>
            </div>
            <span class="page-emblem peach"
              ><Icon name="learn" :size="32"
            /></span>
          </div>
          <div class="guide-layout">
            <aside class="guide-start">
              <span class="round-icon"><Icon name="spark" :size="27" /></span
              ><span class="eyebrow">YOUR FIRST FIVE MINUTES</span>
              <h2>A small checklist.<br />A confident start.</h2>
              <p>Get ready to participate on Robinhood Chain Testnet.</p>
              <ol class="setup-list">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Bring an EVM wallet</strong>
                    <p>Connect to see your balances.</p>
                  </div>
                  <Icon v-if="connected" name="check" :size="18" />
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Choose the testnet</strong>
                    <p>Switch to Robinhood Chain.</p>
                  </div>
                  <Icon
                    v-if="connected && !wrongChain"
                    name="check"
                    :size="18"
                  />
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Add a little gas</strong>
                    <p>Testnet ETH covers transactions.</p>
                  </div>
                </li>
              </ol>
              <a
                class="primary wide"
                href="https://faucet.testnet.chain.robinhood.com"
                target="_blank"
                rel="noopener noreferrer"
                >Get testnet ETH <Icon name="external" :size="18" /></a
              ><button
                class="text-button wide"
                :disabled="connecting || busy || switching"
                @click="connect"
              >
                {{ connected ? "Wallet connected" : "Connect your wallet"
                }}<Icon name="wallet" :size="16" />
              </button>
            </aside>
            <div class="learn-path">
              <div class="section-heading">
                <h2>From curious to contributing</h2>
                <span class="muted-label">Your participation path</span>
              </div>
              <article>
                <span class="guide-number">01</span>
                <div class="learn-copy">
                  <span class="tiny-label">START WITH SOMETHING USEFUL</span>
                  <h2>Make a contribution</h2>
                  <p>
                    Quests publish their reward, expiry, and claim cap. Each
                    wallet can claim once. Open claims do not verify off-chain
                    work or prove a unique identity.
                  </p>
                  <button class="text-button" @click="go('quests')">
                    Explore quests <Icon :size="17" />
                  </button>
                </div>
                <Icon name="quests" :size="27" />
              </article>
              <article>
                <span class="guide-number">02</span>
                <div class="learn-copy">
                  <span class="tiny-label">PUT TIME BEHIND IT</span>
                  <h2>Make a commitment</h2>
                  <p>
                    Lock {{ tokenSymbol }} for 7, 30, 90, or 365 days, without a
                    separate approval. Rewards are simple and do not compound.
                    Withdraw principal after the lock ends.
                  </p>
                  <button class="text-button" @click="go('stake')">
                    Explore staking <Icon :size="17" />
                  </button>
                </div>
                <Icon name="stake" :size="27" />
              </article>
              <article>
                <span class="guide-number">03</span>
                <div class="learn-copy">
                  <span class="tiny-label">GIVE THE NEXT IDEA A VOICE</span>
                  <h2>Choose a direction</h2>
                  <p>
                    Create a proposal with a 1–30 day voting period, or vote on
                    an open idea. One vote per wallet. Results are advisory;
                    treasury actions remain with the steward.
                  </p>
                  <button class="text-button" @click="go('governance')">
                    Explore governance <Icon :size="17" />
                  </button>
                </div>
                <Icon name="governance" :size="27" />
              </article>
            </div>
          </div>
          <div class="faq-layout">
            <div class="faq-intro">
              <span class="eyebrow">A FEW USEFUL ANSWERS</span>
              <h2>Good to know.</h2>
              <p>
                Know what you’re signing.<br />Know what stays in your control.
              </p>
            </div>
            <div class="guide-details">
              <details open>
                <summary>What does a wallet confirmation do?</summary>
                <p>
                  A claim, deposit, withdrawal, proposal, or vote is an on-chain
                  transaction. Check the network and details in your wallet.
                  Rejecting a request submits nothing. Once submitted, Pactelora
                  shows a transaction link and its confirmation status.
                </p>
              </details>
              <details>
                <summary>Who controls the protocol?</summary>
                <p>
                  The contract owner publishes and pauses quests, can pause
                  protocol actions, and controls treasury minting within the
                  supply cap. Stewardship powers are visible on-chain.
                  Governance votes do not automatically execute spending.
                </p>
              </details>
              <details>
                <summary>
                  Why is the token name different from Pactelora?
                </summary>
                <p>
                  Pactelora is the application brand. Token names and symbols
                  come from the connected contract: {{ tokenIdentity }}. A
                  visual rebrand does not change an existing token, address,
                  balance, or signing domain.
                </p>
              </details>
              <details>
                <summary>Do testnet tokens have financial value?</summary>
                <p>
                  No market value or financial return is promised. This is an
                  experimental testnet application. Reward estimates depend on
                  the contract’s rate and remaining supply, and should not be
                  treated as an investment return.
                </p>
              </details>
              <details>
                <summary>Is Pactelora an official Robinhood product?</summary>
                <p>
                  No. Pactelora is an independent community project built on
                  Robinhood Chain Testnet. It is not affiliated with or endorsed
                  by Robinhood Markets.
                </p>
              </details>
              <details>
                <summary>
                  Why am I seeing a preview or a connection error?
                </summary>
                <p>
                  A preview means no contract is configured; sample content
                  cannot submit transactions. A connection error means the
                  configured contract could not be read. Use Refresh to retry.
                  Never share a seed phrase or private key to resolve a
                  connection issue.
                </p>
              </details>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span
          >© 2026 Pactelora <span class="footer-separator">·</span> Small
          actions. Shared purpose.</span
        ><span
          >Independent community project
          <span class="footer-dot"></span> Robinhood Chain Testnet</span
        >
      </footer>
    </div>
    <aside
      v-if="txState.stage !== 'idle'"
      class="transaction-status"
      :class="txState.stage"
      :role="txState.stage === 'error' ? 'alert' : 'status'"
      aria-live="polite"
      aria-atomic="true"
    >
      <span class="transaction-icon"
        ><Icon
          :name="
            txState.stage === 'success' ? 'check' : busy ? 'refresh' : 'info'
          "
          :class="{ spinning: busy }"
      /></span>
      <div>
        <strong>{{ txState.label }}</strong>
        <p>{{ txState.message }}</p>
        <a
          v-if="txState.hash"
          :href="explorer('tx', txState.hash)"
          target="_blank"
          rel="noopener noreferrer"
          >View transaction {{ short(txState.hash)
          }}<Icon name="external" :size="14"
        /></a>
      </div>
      <button
        v-if="!busy"
        class="dismiss icon-button"
        aria-label="Dismiss transaction status"
        @click="txState = { stage: 'idle', label: '', message: '', hash: '' }"
      >
        <Icon name="close" :size="17" />
      </button>
    </aside>
  </div>
</template>
