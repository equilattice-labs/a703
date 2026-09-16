<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useQuorivana } from "./useQuorivana";
import { CHAIN_ID, CONTRACT_ADDRESS } from "./contract";
import quorivanaMark from "./assets/quorivana-mark.svg";
import Icon from "./Icon.vue";

const quorivana = useQuorivana();
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
} = quorivana;
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
  ["home", "Discover"],
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
    title: "Read the Quorivana charter",
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
try {
  const draftKey = "quorivana-proposal-draft";
  // Preserve an unfinished draft from the previous application brand once.
  const legacyDraftKey = "ralliva-proposal-draft";
  const savedDraft = sessionStorage.getItem(draftKey);
  const legacyDraft = savedDraft ? null : sessionStorage.getItem(legacyDraftKey);
  const draft = JSON.parse(savedDraft || legacyDraft || "null");
  if (draft && typeof draft.text === "string") {
    proposalText.value = draft.text.slice(0, 2000);
    proposalDays.value =
      Number.isInteger(draft.days) && draft.days >= 1 && draft.days <= 30
        ? draft.days
        : 7;
    draftSaved.value = true;
    if (legacyDraft) {
      sessionStorage.setItem(draftKey, JSON.stringify({ text: proposalText.value, days: proposalDays.value }));
    }
    // Remove obsolete storage even when a newer draft already takes precedence.
    // Otherwise clearing the current draft could resurrect stale legacy text.
    sessionStorage.removeItem(legacyDraftKey);
  }
} catch {
  /* Draft persistence is optional when browser storage is unavailable. */
}
watch([proposalText, proposalDays], ([text, days]) => {
  try {
    if (text.trim())
      sessionStorage.setItem(
        "quorivana-proposal-draft",
        JSON.stringify({ text, days: Number(days) }),
      );
    else sessionStorage.removeItem("quorivana-proposal-draft");
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
    <header class="site-header" @keydown.esc="closeMenu">
      <div class="header-inner">
        <button class="brand" aria-label="Quorivana home" @click="go('home')">
          <img :src="quorivanaMark" width="36" height="36" alt="" /><span
            >quorivana</span
          >
        </button>
        <nav
          id="primary-navigation"
          class="primary-navigation"
          :class="{ expanded: mobileMenu }"
          aria-label="Main navigation"
        >
          <button
            v-for="n in nav"
            :key="n[0]"
            :class="{ active: tab === n[0] }"
            :aria-current="tab === n[0] ? 'page' : undefined"
            @click="go(n[0])"
          >
            <span>{{ n[1] }}</span>
          </button>
        </nav>
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
            }}</button
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
            }}</span></button
          ><button
            id="menu-toggle"
            class="menu-toggle"
            :aria-expanded="mobileMenu"
            aria-controls="primary-navigation"
            :aria-label="mobileMenu ? 'Close navigation' : 'Open navigation'"
            @click="toggleMenu"
          >
            <Icon :name="mobileMenu ? 'close' : 'menu'" />
          </button>
        </div>
      </div>
    </header>

    <div class="workspace">
      <div v-if="!configured" class="notice preview-notice">
        <Icon name="info" :size="18" />
        <p>
          <strong>You’re exploring a preview.</strong> Sample content, no live
          transactions.
        </p>
        <button class="text-button" @click="go('learn')">
          How it works <Icon :size="16" />
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

      <main id="main" tabindex="-1">
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
          <div class="section-intro">
            <span class="eyebrow"><span class="status-dot"></span> A WORKSPACE FOR SHARED PROGRESS</span>
            <span class="edition">QUORIVANA / FIELD NOTES 001</span>
          </div>
          <div class="hero">
            <div class="hero-copy">
              <h1 aria-label="Every contribution. A common direction.">
                Every<br />contribution.<br />
                <span class="highlight">A common<br />direction.</span>
              </h1>
              <p>A home for useful work. Find a quest, explore test-token commitments, and help decide what comes next.</p>
              <div class="hero-actions">
                <button class="primary" @click="go('quests')">Find your first quest <Icon :size="19" /></button>
                <button class="secondary-link" @click="go('learn')">Read the guide <Icon name="external" :size="17" /></button>
              </div>
              <div class="hero-bottom"><span class="small-cross" aria-hidden="true">+</span><span>Independent voices.<br /><b>One shared direction.</b></span></div>
            </div>
            <div class="hero-art" aria-hidden="true">
              <div class="art-topline"><span>THE PARTICIPATION LOOP</span><span>+</span></div>
              <svg class="contribution-art" viewBox="0 0 480 400" fill="none">
                <g stroke="currentColor" stroke-width="1" opacity=".15"><path d="M0 80h480M0 160h480M0 240h480M0 320h480M80 0v400M160 0v400M240 0v400M320 0v400M400 0v400"/></g>
                <path d="M80 316V168h94v-68h130v98h96v-46" stroke="currentColor" stroke-width="40" stroke-linejoin="miter"/>
                <path d="m354 173 46-47 46 47" stroke="currentColor" stroke-width="18"/>
                <path d="M174 284h130V198" stroke="currentColor" stroke-width="2" stroke-dasharray="5 7"/>
                <circle cx="80" cy="316" r="31" fill="#d4e09b" stroke="currentColor" stroke-width="2"/>
                <path d="M69 316h22m-11-11v22" stroke="currentColor" stroke-width="2"/>
                <circle cx="174" cy="284" r="7" fill="currentColor"/>
                <path d="m230 82 10-14 10 14M240 68v38" stroke="#fffefa" stroke-width="2"/>
                <path d="m329 240 11-11 11 11m-11-11v38" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              <div class="art-label label-one"><span>01</span> CONTRIBUTE</div>
              <div class="art-label label-two"><span>02</span> COMMIT</div>
              <div class="art-label label-three"><span>03</span> COORDINATE</div>
              <div class="art-caption"><span>Progress is a team sport.</span><img :src="quorivanaMark" width="28" height="28" alt="" /></div>
            </div>
          </div>
          <div class="journey-strip">
            <button @click="go('quests')"><span>01</span><div><strong>Contribute</strong><small>Find your next quest</small></div><Icon :size="20" /></button>
            <button @click="go('stake')"><span>02</span><div><strong>Commit</strong><small>Build a staking position</small></div><Icon :size="20" /></button>
            <button @click="go('governance')"><span>03</span><div><strong>Coordinate</strong><small>Help choose a direction</small></div><Icon :size="20" /></button>
          </div>
          <div class="stats-strip">
            <div>
              <span class="stat-icon"><Icon name="quests" /></span>
              <div>
                <span>Open quests</span
                ><strong>{{
                  metricsAvailable ? openQuests.toLocaleString() : "—"
                }}</strong>
              </div>
              <span class="stat-note">{{
                metricsAvailable
                  ? "Ready for your next move"
                  : configured
                    ? "Awaiting chain data"
                    : "Preview mode"
              }}</span>
            </div>
            <div>
              <span class="stat-icon"><Icon name="stake" /></span>
              <div>
                <span>Held by protocol</span
                ><strong
                  >{{ metricsAvailable ? units(totalStaked, 0) : "—" }}
                  <small>{{ tokenSymbol }}</small></strong
                >
              </div>
              <span class="stat-note">{{
                metricsAvailable
                  ? "Read directly from the contract"
                  : "No estimated balances"
              }}</span>
            </div>
            <div>
              <span class="stat-icon"><Icon name="governance" /></span>
              <div>
                <span>Open proposals</span
                ><strong>{{
                  metricsAvailable ? openProposals.toLocaleString() : "—"
                }}</strong>
              </div>
              <span class="stat-note">Your voice has a place</span>
            </div>
          </div>
          <div class="section-heading">
            <div>
              <span class="eyebrow">YOUR NEXT CONTRIBUTION</span>
              <h2>The work starts with you.</h2>
            </div>
            <button class="text-button" @click="go('quests')">
              View all quests <Icon :size="18" />
            </button>
          </div>
          <div class="home-bottom">
            <div class="starter-list">
              <button
                v-for="(q, index) in featuredQuests"
                :key="q.id"
                class="starter-row"
                @click="openQuest(q)"
              >
                <span class="row-number">0{{ index + 1 }}</span>
                <div>
                  <span class="tiny-label">{{
                    q.sample ? "SAMPLE QUEST" : questStatus(q) + " QUEST"
                  }}</span>
                  <h3>{{ q.title }}</h3>
                </div>
                <span class="row-reward"
                  >{{ units(q.reward) }} <small>{{ tokenSymbol }}</small></span
                ><Icon name="external" />
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
                      : "Explore the field guide while the community prepares its next quests."
                  }}
                </p>
                <button class="text-button" @click="go('learn')">
                  Read the field guide <Icon :size="18" />
                </button>
              </div>
            </div>
            <article class="commons-card">
              <Icon name="spark" :size="30" /><span class="tiny-label"
                >SHARED RESOURCES, OPEN RECORDS</span
              >
              <h2>A clear view.<br />A common purpose.</h2>
              <p>
                Shared resources deserve a clear view. Follow the treasury and
                see the story behind each transaction.
              </p>
              <button class="text-button" @click="go('treasury')">
                Open the ledger <Icon name="external" />
              </button>
            </article>
          </div>
        </section>

        <section v-if="tab === 'quests'" class="page">
          <div class="page-head">
            <div>
              <span class="eyebrow">01 / CONTRIBUTE</span>
              <h1>Find your next contribution.</h1>
              <p>
                Explore open quests, check the rules, and claim a testnet
                reward. One claim per wallet, within each quest’s cap and
                deadline.
              </p>
            </div>
            <span class="page-stamp"><Icon name="quests" :size="35" /></span>
          </div>
          <div class="quest-toolbar">
            <label class="search-field"
              ><Icon name="search" :size="19" /><span class="sr-only"
                >Search quests</span
              ><input
                v-model="search"
                type="search"
                placeholder="Search quests…"
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
                {{ f }}
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
            <article v-for="(q, index) in visibleQuests" :key="q.id" class="quest-card" :id="'quest-' + q.id" :aria-labelledby="'quest-title-' + q.id" tabindex="-1">
              <div class="quest-index"><span>{{ String(index + 1).padStart(2, "0") }}</span><Icon :name="['learn', 'spark', 'treasury'][index % 3]" :size="24" /></div>
              <div class="quest-main">
                <div class="quest-card-top"><span class="tiny-label">{{ q.sample ? "EXAMPLE QUEST" : "QUEST / " + String(q.id).padStart(3, "0") }}</span><span class="badge" :class="{ open: questStatus(q) === 'Open' }">{{ questStatus(q) }}</span></div>
                <h2 :id="'quest-title-' + q.id">{{ q.title }}</h2>
                <p>{{ q.sample ? q.detail : "An open participation reward. Claiming is recorded on Robinhood Chain. No off-chain work is verified by this claim." }}</p>
                <div v-if="!q.sample" class="quest-cap">
                  <div><span>{{ q.claims.toLocaleString() }} / {{ q.maxClaims.toLocaleString() }} claimed</span><span>{{ Math.max(0, q.maxClaims - q.claims).toLocaleString() }} left</span></div>
                  <progress :value="q.claims" :max="q.maxClaims || 1" :aria-label="q.claims + ' of ' + q.maxClaims + ' claims used'"></progress>
                  <span><Icon name="clock" :size="14" /> Closes {{ date(q.expiresAt) }}</span>
                </div>
              </div>
              <div class="quest-action">
                <div class="quest-reward"><span>Reward <small v-if="q.sample">· example</small></span><strong>{{ units(q.reward) }} <small>{{ tokenSymbol }}</small></strong></div>
                <button class="outline wide" :disabled="actionDisabled || (!q.sample && questStatus(q) !== 'Open')" @click="claim(q)">{{ q.sample ? "Preview quest" : q.claimed ? "Already claimed" : questStatus(q) !== "Open" ? questStatus(q) : connected ? "Claim reward" : "Connect to claim" }}<Icon :size="18" /></button>
                <button v-if="isOwner && !q.sample" class="text-button steward-action" :disabled="busy" @click="setQuest(q)">{{ q.active ? "Pause quest" : "Resume quest" }}</button>
              </div>
            </article>
          </div>
          <form
            v-if="isOwner"
            class="panel admin-box"
            @submit.prevent="createQuest"
          >
            <span class="eyebrow">STEWARD TOOLS</span>
            <h2>Publish a quest</h2>
            <p>Rewards are minted when claimed, subject to the supply cap.</p>
            <div class="form-row">
              <label
                >Quest title<input
                  v-model="adminTitle"
                  maxlength="200"
                  required
                  placeholder="Welcome to Quorivana" /></label
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
          </form>
        </section>

        <section v-if="tab === 'stake'" class="page">
          <div class="page-head">
            <div>
              <span class="eyebrow">02 / COMMIT</span>
              <h1>Put time behind your conviction.</h1>
              <p>
                Choose how much to commit and for how long. Your principal stays
                in the contract until its lock ends and you withdraw it.
              </p>
            </div>
            <span class="page-stamp"><Icon name="stake" :size="35" /></span>
          </div>
          <ol class="flow-steps" aria-label="Staking steps">
            <li class="current"><span>1</span> Set amount & duration</li>
            <li><span>2</span> Review in wallet</li>
            <li><span>3</span> Track your position</li>
          </ol>
          <div class="stake-layout">
            <form class="panel stake-card" @submit.prevent="stake">
              <div class="panel-heading">
                <h2>Create a position</h2>
                <span class="badge">{{
                  configured ? "Testnet" : "Sample"
                }}</span>
              </div>
              <label class="amount-label" for="stake-amount"
                >Amount to stake
                <span
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
                <Icon name="info" :size="18" />
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
                }}<Icon />
              </button>
            </form>
            <div class="position-column">
              <article class="position-card">
                <div class="panel-heading">
                  <span class="eyebrow">YOUR POSITION</span
                  ><Icon name="wallet" />
                </div>
                <strong class="position-balance"
                  >{{
                    connected && accountReady ? units(position.amount) : "—"
                  }}
                  <small>{{ tokenSymbol }}</small></strong
                >
                <p>
                  {{
                    connected
                      ? !accountReady
                        ? accountReading
                          ? "Reading your wallet data…"
                          : "Wallet data needs a refresh."
                        : position.amount > 0n
                          ? "Committed to the next chapter."
                          : "Your first commitment starts here."
                      : "Connect your wallet to see your position."
                  }}
                </p>
                <div class="position-detail">
                  <span>Claimable rewards</span
                  ><b
                    >{{
                      connected && accountReady ? units(position.yield, 8) : "—"
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
                <Icon name="shield" :size="24" />
                <h3>Know your commitment.</h3>
                <p>
                  Rewards are simple and do not compound automatically. Claiming
                  rewards does not reset your lock. The supply cap limits reward
                  availability.
                </p>
                <p class="fine-print">
                  Testnet tokens have no promised market value or financial
                  return.
                </p>
                <button class="text-button" @click="go('learn')">
                  Read the field guide <Icon name="external" :size="17" />
                </button>
              </article>
            </div>
          </div>
        </section>

        <section v-if="tab === 'governance'" class="page">
          <div class="page-head">
            <div>
              <span class="eyebrow">03 / COORDINATE</span>
              <h1>Make the next move, together.</h1>
              <p>
                Bring an idea to the table. Read the proposals and make your
                voice count. Votes are advisory; treasury spending is a separate
                steward action.
              </p>
            </div>
            <button
              id="proposal-toggle"
              class="primary"
              :aria-expanded="showProposal"
              aria-controls="proposal-editor"
              @click="toggleProposal"
            >
              <Icon :name="showProposal ? 'close' : 'plus'" :size="18" />{{
                showProposal ? "Close editor" : "New proposal"
              }}
            </button>
          </div>
          <form
            v-if="showProposal"
            id="proposal-editor"
            class="panel proposal-editor"
            @submit.prevent="createProposal"
            @keydown.esc.prevent="toggleProposal"
          >
            <div class="panel-heading">
              <h2>What should we do next?</h2>
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
              <span
                >{{
                  draftSaved
                    ? "Draft saved in this tab."
                    : "10–2,000 characters."
                }}
                Published proposals are recorded on-chain.</span
              ><span>{{ proposalText.length }} / 2,000</span>
            </div>
            <div class="editor-bottom">
              <label
                >Voting period (days)<input
                  v-model="proposalDays"
                  type="number"
                  min="1"
                  max="30"
                  required
              /></label>
              <div class="editor-actions">
                <button class="quiet" type="button" @click="toggleProposal">
                  Keep draft & close</button
                ><button
                  class="primary"
                  :disabled="actionDisabled || proposalText.trim().length < 10"
                  type="submit"
                >
                  {{ !configured ? "Preview proposal" : "Publish proposal"
                  }}<Icon :size="18" />
                </button>
              </div>
            </div>
          </form>
          <div class="section-heading proposal-heading">
            <h2>Community proposals</h2>
            <span class="results-count"
              >{{ visibleProposals.length }}
              {{
                visibleProposals.length === 1 ? "proposal" : "proposals"
              }}</span
            >
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
                readError ? "Proposals are unavailable." : "The floor is yours."
              }}
            </h2>
            <p>
              {{
                readError
                  ? "Use Try again above to reconnect."
                  : "Start the first Quorivana discussion with a clear idea and a voting period."
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
                    >For <b>{{ units(p.forVotes) }}</b></span
                  ><span
                    >Against <b>{{ units(p.againstVotes) }}</b></span
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
              connected contract’s snapshot rules, using eligible token and
              staked balances. Your current balance may differ.
            </p>
          </div>
        </section>

        <section v-if="tab === 'treasury'" class="page">
          <div class="page-head">
            <div>
              <span class="eyebrow">04 / VERIFY</span>
              <h1>Shared resources. Open records.</h1>
              <p>
                A shared ledger, open to everyone. Follow balances and recent
                contract activity directly from Robinhood Chain.
              </p>
            </div>
            <span class="page-stamp"><Icon name="treasury" :size="35" /></span>
          </div>
          <div class="treasury-highlights">
            <article class="treasury-main">
              <span class="eyebrow">TREASURY BALANCE</span
              ><strong
                >{{ ready && treasuryKnown ? units(treasuryBalance) : "—" }}
                <small>{{ tokenSymbol }}</small></strong
              ><span>{{ tokenIdentity }}</span>
            </article>
            <article class="treasury-secondary">
              <Icon name="wallet" />
              <div>
                <span>Treasury gas balance</span
                ><strong
                  >{{ ready && treasuryKnown ? units(treasuryNative, 6) : "—" }}
                  <small>Testnet ETH</small></strong
                >
              </div>
            </article>
          </div>
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
          <div class="treasury-layout">
            <article class="panel ledger">
              <h2>By the numbers</h2>
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
                Quorivana is the app brand.
                {{
                  configured
                    ? "The connected contract defines the on-chain token name and symbol."
                    : "Token details are examples until a deployed contract is configured."
                }}
              </p>
            </article>
            <article class="panel activity">
              <div class="panel-heading">
                <h2>Recent activity</h2>
                <span class="status-dot"></span>
              </div>
              <p class="fine-print">
                Latest 2,000 blocks. The explorer holds the full history.
              </p>
              <p v-if="eventsError" class="inline-error" role="alert">
                {{ eventsError }}
              </p>
              <div v-if="!activity.length" class="empty compact">
                <Icon name="clock" :size="28" />
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
            </article>
          </div>
        </section>

        <section v-if="tab === 'learn'" class="page learn">
          <div class="page-head">
            <div>
              <span class="eyebrow">THE QUORIVANA STARTER GUIDE</span>
              <h1>A little knowledge. A confident start.</h1>
              <p>
                You don’t need to know everything to make your first move.
                Here’s the path from exploring to participating.
              </p>
            </div>
            <span class="page-stamp"><Icon name="learn" :size="35" /></span>
          </div>
          <div class="guide-start">
            <div>
              <span class="eyebrow">YOUR FIRST FIVE MINUTES</span>
              <h2>A wallet. A little testnet gas. An open quest.</h2>
              <p>
                Connect an EVM wallet, switch to Robinhood Chain Testnet, and
                get testnet ETH for gas. Then explore an open quest and review
                its reward before you confirm.
              </p>
            </div>
            <a
              class="primary"
              href="https://faucet.testnet.chain.robinhood.com"
              target="_blank"
              rel="noopener noreferrer"
              >Get testnet ETH <Icon name="external" :size="18"
            /></a>
          </div>
          <div class="learn-grid">
            <article>
              <span class="guide-number">01</span
              ><Icon name="quests" :size="28" />
              <h2>Contribute</h2>
              <p>
                Quests publish their reward, expiry, and claim cap. Each wallet
                can claim once. Open claims do not verify off-chain work or
                prove a unique identity.
              </p>
              <button class="text-button" @click="go('quests')">
                Explore quests <Icon :size="17" />
              </button>
            </article>
            <article>
              <span class="guide-number">02</span
              ><Icon name="stake" :size="28" />
              <h2>Commit</h2>
              <p>
                Lock {{ tokenSymbol }} for 7, 30, 90, or 365 days, without a
                separate approval. Rewards are simple and do not compound.
                Withdraw principal after the lock ends.
              </p>
              <button class="text-button" @click="go('stake')">
                Explore staking <Icon :size="17" />
              </button>
            </article>
            <article>
              <span class="guide-number">03</span
              ><Icon name="governance" :size="28" />
              <h2>Coordinate</h2>
              <p>
                Create a proposal with a 1–30 day voting period, or vote on an
                open idea. One vote per wallet. Results are advisory; treasury
                actions remain with the steward.
              </p>
              <button class="text-button" @click="go('governance')">
                Explore governance <Icon :size="17" />
              </button>
            </article>
          </div>
          <div class="faq-layout">
            <div>
              <span class="eyebrow">A FEW USEFUL ANSWERS</span>
              <h2>Before you jump in.</h2>
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
                  Rejecting a request submits nothing. Once submitted, Quorivana
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
                <summary>Why is the token name different from Quorivana?</summary>
                <p>
                  Quorivana is the application brand. Token names and symbols come
                  from the connected contract: {{ tokenIdentity }}. A visual
                  rebrand does not change an existing token, address, balance,
                  or signing domain.
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
                <summary>Is Quorivana an official Robinhood product?</summary>
                <p>
                  No. Quorivana is an independent community project built on
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
          >© 2026 Quorivana <span class="footer-separator">/</span> Every contribution.
          A common direction.</span
        ><span>Robinhood Chain Testnet · Independent community project</span>
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
          >View transaction {{ short(txState.hash) }}
          <Icon name="external" :size="14"
        /></a>
      </div>
      <button
        v-if="!busy"
        class="dismiss"
        aria-label="Dismiss transaction status"
        @click="txState = { stage: 'idle', label: '', message: '', hash: '' }"
      >
        <Icon name="close" :size="17" />
      </button>
    </aside>
  </div>
</template>
