<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useKintrava } from "./useKintrava";
import {
  SOLANA_CLUSTER,
  SOLANA_NETWORK_NAME,
  TOKEN_MINT_ADDRESS,
} from "./solana.js";
import kintravaMark from "./assets/kintrava-mark.svg";
import Icon from "./Icon.vue";

const kintrava = useKintrava();
const {
  configured,
  mintConfigured,
  programReady,
  wallet,
  token,
  tokenName,
  tokenSymbol,
  tokenDecimals,
  native,
  treasury,
  treasuryKnown,
  treasuryNativeKnown,
  treasuryTokenKnown,
  treasuryError,
  totalSupply,
  treasuryBalance,
  treasuryNative,
  paused,
  quests,
  proposals,
  accountError,
  accountReading,
  accountReady,
  readError,
  reading,
  ready,
  lastRead,
  connected,
  isOwner,
  busy,
  txState,
  connecting,
  short,
  units,
  solUnits,
  date,
  explorer,
  notify,
  refresh,
  connect,
  disconnectWallet,
  walletOptions,
  walletPickerOpen,
  closeWalletPicker,
  chooseWallet,
  claimQuest: recordQuest,
  createQuest: publishQuest,
  setQuestActive: changeQuestActive,
  createProposal: publishProposal,
  castVote,
  questStatus,
  proposalStatus,
  votePercent,
} = kintrava;
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
  ["stake", "Token"],
  ["governance", "Governance"],
  ["treasury", "Treasury"],
  ["learn", "Guide"],
];
const proposalText = ref(""),
  proposalDays = ref(7),
  showProposal = ref(false);
const adminTitle = ref(""),
  adminDetails = ref(""),
  adminMax = ref(100),
  adminDays = ref(30),
  questFilter = ref("all");
const samples = [
  {
    id: "sample-1",
    sample: true,
    title: "Read the Kintrava charter",
    reward: 12n * 10n ** 9n,
    detail: "A sample welcome quest. Learn how rewards and stewardship work.",
  },
  {
    id: "sample-2",
    sample: true,
    title: "Map a useful signal",
    reward: 28n * 10n ** 9n,
    detail: "A sample research quest. Share a source-backed observation.",
  },
  {
    id: "sample-3",
    sample: true,
    title: "Review a treasury route",
    reward: 45n * 10n ** 9n,
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
const draftKey = "kintrava-proposal-draft";
try {
  // Migrate unfinished drafts from previous application brands once.
  const legacyDraftKeys = [
    "pactelora-proposal-draft",
    "solkintra-proposal-draft",
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

const allQuests = computed(() => (programReady.value ? quests.value : samples));
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
const metricsAvailable = computed(() => programReady.value && ready.value);
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
  programReady.value ? proposals.value : sampleProposals,
);
const actionDisabled = computed(
  () =>
    busy.value ||
    connecting.value ||
    (configured &&
      (!ready.value ||
        reading.value ||
        paused.value ||
        (connected.value && (!accountReady.value || accountReading.value)))),
);
const tokenIdentity = computed(() => {
  if (!mintConfigured)
    return `${tokenName.value || "Sample token"} (${tokenSymbol.value}) - sample`;
  if (tokenName.value) return `${tokenName.value} (${tokenSymbol.value})`;
  return reading.value
    ? "Loading mint data..."
    : `SPL token (${tokenSymbol.value}); metadata pending`;
});
function preview() {
  notify(
    "This is an example. Explore the workflow here; transactions require a configured Solana program.",
    "info",
  );
}
async function claim(q) {
  if (q.sample) return preview();
  if (questStatus(q) !== "Open")
    return notify("This quest is not available to claim.");
  await recordQuest(q);
}
async function vote(p, support) {
  if (p.sample) return preview();
  if (proposalStatus(p) !== "Open")
    return notify("Voting is closed or you already voted.");
  await castVote(p, support);
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
  const submittedDays = Number(proposalDays.value);
  if (await publishProposal(description, submittedDays)) {
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
  const details = adminDetails.value.trim();
  if (!title || new TextEncoder().encode(title).length > 80)
    return notify("Use a quest title between 1 and 80 UTF-8 bytes.");
  if (new TextEncoder().encode(details).length > 240)
    return notify("Quest details must be 240 UTF-8 bytes or fewer.");
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
  const expiry = Math.floor(Date.now() / 1000) + Number(adminDays.value) * 86400;
  if (await publishQuest({
    title,
    details,
    maxClaims: Number(adminMax.value),
    expiresAt: expiry,
  })) {
    adminTitle.value = "";
    adminDetails.value = "";
  }
}
async function setQuest(q) {
  await changeQuestActive(q, !q.active);
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main" @click.prevent="focusMain"
      >Skip to content</a
    >
    <header class="site-header" @keydown.esc="closeMenu">
      <button class="brand" aria-label="Kintrava home" @click="go('home')">
        <img :src="kintravaMark" width="34" height="34" alt="" />
        <span
          >kintrava<span class="brand-caption"
            >SOLANA COMMUNITY COORDINATION</span
          ></span
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
          <span>{{ n[1] }}</span
          ><Icon name="arrow" :size="17" />
        </button>
        <span class="mobile-nav-caption">Routes in. Proof out.</span>
      </nav>
      <div class="topbar-actions">
        <span class="network-button" :aria-label="`${SOLANA_NETWORK_NAME} selected`">
          <span class="status-dot"></span>{{ SOLANA_CLUSTER }}
        </span>
        <button
          class="wallet-button"
          :disabled="connecting || busy"
          @click="connected ? disconnectWallet() : connect()"
        >
          <Icon name="wallet" :size="17" /><span>{{
            connecting
              ? "Connecting..."
              : connected
                ? short(wallet)
                : "Connect wallet"
          }}</span>
        </button>
        <button
          id="menu-toggle"
          class="menu-toggle icon-button"
          :aria-expanded="mobileMenu"
          aria-controls="primary-navigation"
          :aria-label="mobileMenu ? 'Close navigation' : 'Open navigation'"
          @click="toggleMenu"
        >
          <Icon :name="mobileMenu ? 'close' : 'menu'" />
        </button>
      </div>
    </header>
    <button
      v-if="mobileMenu"
      class="menu-backdrop"
      aria-label="Close navigation overlay"
      @click="closeMenu"
    ></button>
    <div class="workspace">
      <main id="main" tabindex="-1">
        <div v-if="!programReady" class="notice preview-notice">
          <span class="notice-symbol"><Icon name="info" :size="17" /></span>
          <p><strong>Preview mode.</strong> {{ configured ? "The program is not initialized on this cluster. Sample quests and proposals remain visible; actions submit nothing." : mintConfigured ? "Mint data is read-only; sample program content remains until a program is configured. Actions submit nothing." : "No token mint is configured and the community program is not connected. Sample content is shown; actions submit nothing." }}</p>
          <button class="text-button" @click="go('learn')">
            How it works <Icon :size="15" />
          </button>
        </div>
        <div v-if="paused" class="notice warning-notice" role="status">
          <Icon name="info" />
          <p>
            The protocol is paused. You can browse data; transactions are
            temporarily unavailable.
          </p>
        </div>
        <div v-if="mintConfigured || configured || connected" class="read-status">
          <span :class="{ failed: readError }" role="status"
            ><span
              class="status-dot"
              :class="{ loading: reading, failed: readError }"
            ></span
            >{{
              readError
                ? "Connection needs attention"
                : reading
                  ? "Syncing Solana data..."
                  : "Synced at " + lastRead
            }}</span
          >
          <div>
            <a
              v-if="mintConfigured"
              :href="explorer('address', TOKEN_MINT_ADDRESS)"
              target="_blank"
              rel="noopener noreferrer"
              >View Solana address <Icon name="external" :size="14" /></a
            ><button
              :disabled="reading || busy"
              aria-label="Refresh Solana data"
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
            <strong>We could not sync Solana data.</strong>
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
          Reading your wallet balances and activity...        </p>

        <section v-if="tab === 'home'" class="overview">
          <div class="home-masthead">
            <span class="eyebrow">ON-CHAIN COMMUNITY</span
            ><span class="edition-label"
              >SOLANA <span> / </span> {{ SOLANA_CLUSTER === "mainnet-beta" ? "MAINNET" : SOLANA_CLUSTER.toUpperCase() }}</span
            >
          </div>
          <div class="home-hero">
            <div class="hero-copy">
              <h1>Ship small.<br /><em>Prove</em><br />on-chain.</h1>
              <div class="hero-intro">
                <span class="intro-rule" aria-hidden="true"></span>
                <p>
                  Quests, proposals, and treasury reads in one Solana workspace.<br /> Trace the next route from wallet connect to public proof.<!--
                  -->
                </p>
              </div>
              <div class="hero-actions">
                <button class="primary" @click="go('quests')">
                  Open quests <Icon :size="19" /></button
                ><button class="text-button" @click="go('learn')">
                  View the token lane <Icon name="external" :size="17" />
                </button>
              </div>
            </div>
            <div class="momentum-art" aria-hidden="true">
              <div class="art-index">
                <span>ROUTE / PROOF / VOTE</span><span>FIG. 01</span>
              </div>
              <svg class="momentum-path" viewBox="0 0 480 450" fill="none">
                <path
                  d="M-40 394H97V297H195V200H292V103H522"
                  stroke="#b9c6b1"
                  stroke-width="1"
                />
                <path
                  d="M-40 416H119V319H217V222H314V125H522"
                  stroke="#b9c6b1"
                  stroke-width="1"
                />
                <path
                  d="M-40 438H141V341H239V244H336V147H522"
                  stroke="#b9c6b1"
                  stroke-width="1"
                />
                <path
                  d="M-40 372H75V275H173V178H270V81H522"
                  stroke="#b9c6b1"
                  stroke-width="1"
                />
                <path
                  d="M-40 350H53V253H151V156H248V59H522"
                  stroke="#b9c6b1"
                  stroke-width="1"
                />
                <path
                  d="M-40 328H31V231H129V134H226V37H522"
                  stroke="#b9c6b1"
                  stroke-width="1"
                />
                <path
                  d="M-15 330H100V233H197V136H294V39H481"
                  stroke="#173c32"
                  stroke-width="61"
                  stroke-linejoin="miter"
                />
                <path
                  d="M-15 330H100V233H197V136H294V39H481"
                  stroke="#f6f5f0"
                  stroke-opacity=".45"
                  stroke-width="1"
                />
                <path
                  d="M195 295L362 128H303V66H467V230H405V171L238 338Z"
                  fill="#d9ee77"
                />
                <path d="M215 315L436 94" stroke="#173c32" stroke-width="1" />
                <path
                  d="M49 399H63M56 392V406"
                  stroke="#173c32"
                  stroke-width="1"
                />
              </svg>
              <div class="art-bottom">
                <span>01 CONNECT<br />02 CONTRIBUTE<br />03 COORDINATE</span
                ><span class="art-seal"
                  >One route.<br /><em>On-chain.</em></span
                >
              </div>
            </div>
          </div>
          <section class="community-strip" aria-label="Community statistics">
            <div class="strip-intro">
              <span class="eyebrow">MARKET PULSE</span>
              <p>
                <span class="status-dot"></span
                >{{
                  metricsAvailable
                    ? "Live from Solana"
                    : mintConfigured
                      ? "Mint read-only · program pending"
                      : "Preview - sample workspace"
                }}
              </p>
            </div>
            <div class="strip-metric">
              <strong>{{
                metricsAvailable ? openQuests.toLocaleString() : "-"
              }}</strong
              ><span>Open quests</span>
            </div>
            <div class="strip-metric">
              <strong>Not configured</strong><span>Token staking</span>
            </div>
            <div class="strip-metric">
              <strong>{{
                metricsAvailable ? openProposals.toLocaleString() : "-"
              }}</strong
              ><span>Ideas open for a vote</span>
            </div>
          </section>
          <div class="home-actions-layout">
            <section class="opportunity-panel">
              <div class="section-heading">
                <div>
                  <span class="eyebrow">01 / START SOMEWHERE</span>
                  <h2>Pick up a little purpose.</h2>
                </div>
                <button class="text-button" @click="go('quests')">
                  All quests <Icon :size="17" />
                </button>
              </div>
              <div class="starter-list">
                <button
                  v-for="(q, index) in featuredQuests"
                  :key="q.id"
                  class="starter-row"
                  @click="openQuest(q)"
                >
                  <span class="starter-number">{{
                    String(index + 1).padStart(2, "0")
                  }}</span>
                  <span class="starter-copy"
                    ><span class="tiny-label">{{
                      q.sample ? "SAMPLE QUEST" : questStatus(q) + " QUEST"
                    }}</span
                    ><strong>{{ q.title }}</strong></span
                  >
                  <span class="row-reward"
                    >{{ q.sample ? `${units(q.reward)} ${tokenSymbol}` : "Participation only" }}</span
                  ><Icon name="external" :size="21" />
                </button>
                <div v-if="!featuredQuests.length" class="empty compact">
                  <Icon name="quests" :size="28" />
                  <h3>
                    {{
                      reading
                        ? "Finding your next move..."
                        : readError
                          ? "Quests will appear once connected."
                          : "The next chapter is open."
                    }}
                  </h3>
                  <p>
                    {{
                      reading
                        ? "Reading the latest quests from Solana."
                        : "Explore the guide while the community prepares its next quests."
                    }}
                  </p>
                  <button class="text-button" @click="go('learn')">
                    Read the guide <Icon :size="17" />
                  </button>
                </div>
              </div>
            </section>
            <aside class="next-step-card">
              <span class="eyebrow">MAKE YOURSELF AT HOME</span>
              <h2>New here?<br /><em>Start with why.</em></h2>
              <p>
                Understand the tools, meet the possibilities, and find your own
                way to take part.
              </p>
              <button class="primary lime" @click="go('learn')">
                Your five-minute guide <Icon :size="18" /></button
              ><span class="card-diagonal" aria-hidden="true">&#8599;</span>
            </aside>
          </div>
          <section
            class="participation-routes"
            aria-label="More ways to participate"
          >
            <div class="route-intro">
              <span class="eyebrow">KEEP THINGS MOVING</span>
              <h2>There is more<br /> than one way in.</h2>
            </div>
            <button class="route-item" @click="go('stake')">
              <span class="route-top"
                ><span class="tiny-label">02 / TOKEN DETAILS</span
                ><Icon name="external" :size="22" /></span
              ><strong>Plan token features.</strong>
              <p>Locking and rewards wait for a verified mint and clear terms.</p>
            </button>
            <button class="route-item" @click="go('governance')">
              <span class="route-top"
                ><span class="tiny-label">03 / COORDINATE</span
                ><Icon name="external" :size="22" /></span
              ><strong>Bring an idea.</strong>
              <p>Help decide where we go next.</p>
            </button>
            <button class="route-item" @click="go('treasury')">
              <span class="route-top"
                ><span class="tiny-label">04 / VERIFY</span
                ><Icon name="external" :size="22" /></span
              ><strong>See the whole.</strong>
              <p>Shared resources. Open records.</p>
            </button>
          </section>
        </section>
        <section v-if="tab === 'quests'" class="page quests-page">
          <div class="page-head">
            <div>
              <span class="eyebrow">01 / THE CONTRIBUTION BOARD</span>
              <h1>Find your part.</h1>
              <p>
                Browse on-chain contribution records. Claims record wallet
                participation only; they do not pay a token reward or verify
                off-chain work.
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
                  placeholder="Find something to work on..."
                  autocomplete="off"
              /></label>
              <div class="filters" role="group" aria-label="Filter quests">
                <button
                  v-for="f in programReady
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
                  <span class="quest-number">{{
                    String(index + 1).padStart(2, "0")
                  }}</span
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
                    q.detail || "A community participation record on Solana."
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
                    <span>{{ q.sample ? "Reward · example" : "Reward" }}</span>
                    <strong v-if="q.sample">{{ units(q.reward) }} <small>{{ tokenSymbol }}</small></strong>
                    <strong v-else>No token reward</strong>
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
                              ? "Record participation"
                              : "Connect to record"
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
              <p>Quest claims create a participation record only. This program does not mint or transfer token rewards.</p>
            </div>
            <div class="admin-fields">
              <h3>Publish a quest</h3>
              <div class="form-row">
                <label
                  >Quest title<input
                    v-model="adminTitle"
                    maxlength="80"
                    required
                    placeholder="Welcome to Kintrava" /></label
                ><label>Quest details<textarea
                    v-model="adminDetails"
                    maxlength="240"
                    rows="2"
                    placeholder="What should participants review or contribute?"
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
              <span class="eyebrow">TOKEN DETAILS / COMING LATER</span>
              <h1>Token features come later.</h1>
              <p>
                Quests and advisory governance run through the Solana program.
                Token locking and rewards remain disabled until the mint,
                custody model, schedule, and funding are defined.
              </p>
            </div>
            <span class="page-emblem peach"
              ><Icon name="stake" :size="32"
            /></span>
          </div>
          <div class="stake-layout">
            <article class="panel stake-card">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">TOKEN STATUS</span>
                  <h2>No token is connected</h2>
                </div>
                <span class="badge">Not configured</span>
              </div>
              <div class="stake-configuration">
                <p class="form-note">
                  <Icon name="info" :size="17" />
                  <span>
                    The Solana program currently records quest participation and
                    advisory votes. It does not custody tokens, mint rewards,
                    or track staking positions.
                  </span>
                </p>
                <h3 class="form-section-heading">
                  <span>01</span> Details needed before token features
                </h3>
                <ul>
                  <li>A verified SPL token mint and its decimals</li>
                  <li>Custody and withdrawal rules for any lock</li>
                  <li>A defined reward source and funding plan</li>
                </ul>
              </div>
              <div class="stake-review">
                <h3 class="form-section-heading">
                  <span>02</span> What unlocks this
                </h3>
                <p class="fine-print">
                  Once a verified mint and clear custody and funding rules are
                  provided, token features can be designed and tested against
                  those exact details.
                </p>
                <button class="primary" type="button" @click="go('learn')">
                  Read the field guide <Icon name="external" :size="18" />
                </button>
              </div>
            </article>
          </div>
        </section><section v-if="tab === 'governance'" class="page governance-page">
          <div class="page-head">
            <div>
              <span class="eyebrow">03 / THE ASSEMBLY</span>
              <h1>What comes next?</h1>
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
                <h2>An idea worth sharing.</h2>
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
                      : "10-2,000 characters."
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
                  {{ !programReady ? "Preview proposal" : "Publish proposal"
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
                      <p>Choose a voting window of 1-30 days.</p>
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
                v-if="programReady && reading && !visibleProposals.length"
                class="skeleton"
                role="status"
              >
                <span class="sr-only">Loading proposals</span>
              </div>
              <div
                v-if="programReady && !reading && !visibleProposals.length"
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
                      : "Start the first Kintrava proposal with a clear idea and a voting period."
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
                  connected program's rules. Your current balance may differ
                  from eligible voting weight.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section v-if="tab === 'treasury'" class="page treasury-page">
          <div class="page-head">
            <div>
              <span class="eyebrow">04 / THE OPEN LEDGER</span>
              <h1>Every part accounted for.</h1>
              <p>
                See the community's resources and the activity behind them, read
                directly from Solana.
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
                >{{ ready && treasuryTokenKnown ? units(treasuryBalance) : "—"
                  }}<small>{{ tokenSymbol }}</small></strong
                ><span>{{ tokenIdentity }}</span>
                <div class="treasury-gas">
                  <Icon name="wallet" :size="19" /><span
                    >Treasury gas balance</span
                  ><strong
                    >{{ ready && treasuryNativeKnown ? solUnits(treasuryNative, 6) : "—"
                    }}<small>{{ SOLANA_CLUSTER === "devnet" ? "Devnet SOL" : SOLANA_CLUSTER === "testnet" ? "Testnet SOL" : "SOL" }}</small></strong
                  >
                </div>
              </article>
              <p
                v-if="treasuryError || (mintConfigured && ready && (!treasuryKnown || !treasuryTokenKnown))"
                class="treasury-notice"
                role="status"
              >
                <Icon name="info" :size="17" />{{
                  treasuryError ||
                  "Treasury token or SOL balances are not fully available yet."
                }}
              </p>
              <article class="panel ledger">
                <div class="panel-heading">
                  <h2>Account statement</h2>
                  <Icon name="layers" :size="20" />
                </div>
                <dl>
                  <div>
                    <dt>On-chain token</dt>
                    <dd>{{ tokenIdentity }}</dd>
                  </div>
                  <div>
                    <dt>Total issued {{ tokenSymbol }}</dt>
                    <dd>{{ mintConfigured && ready ? units(totalSupply) : "—" }}</dd>
                  </div>
                  <div>
                    <dt>Token staking</dt>
                    <dd>Not implemented</dd>
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
                    <dt>Token mint</dt>
                    <dd>
                      <a
                v-if="mintConfigured"
                        :href="explorer('address', TOKEN_MINT_ADDRESS)"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ short(TOKEN_MINT_ADDRESS)
                        }}<Icon name="external" :size="15" /></a
                      ><span v-else>Not configured</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Network</dt>
                    <dd>{{ SOLANA_NETWORK_NAME }}</dd>
                  </div>
                  <div>
                    <dt>Cluster</dt>
                    <dd>{{ SOLANA_CLUSTER }}</dd>
                  </div>
                </dl>
                <p class="fine-print">
                  Kintrava is the app brand.
                  {{ mintConfigured ? `Decimals are read from the mint (${tokenDecimals}); display name and ticker metadata are pending.` : "No token mint is deployed or configured. KNTV is only a preview label." }}
                </p>
              </article>
            </div>
            <article class="panel activity">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">ACTIVITY REGISTER</span>
                  <h2>Recent activity</h2>
                </div>
                <span class="subtle-badge"
                  ><span class="status-dot"></span>On-chain</span
                >
              </div>
              <p class="fine-print">
                Solana program indexing is not connected yet. No on-chain program activity is available.
              </p>
              <div class="empty compact">
                <span class="empty-orbit"
                  ><Icon name="clock" :size="30"
                /></span>
                <h3>
                  {{
                    reading
                      ? "Reading the Solana ledger..."
                      : readError
                        ? "Activity could not load."
                        : "A quiet moment on-chain."
                  }}
                </h3>
                <p>
                  {{
                    "A Solana activity indexer will be connected after program deployment."
                  }}
                </p>
              </div>
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
              <span class="eyebrow">THE KINTRAVA FIELD GUIDE</span>
              <h1>A way in.<br /><em>A way forward.</em></h1>
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
              <h2>Three things.<br />Then you're ready.</h2>
              <p>Get ready to participate on {{ SOLANA_NETWORK_NAME }}.</p>
              <ol class="setup-list">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Bring a Solana wallet</strong>
                    <p>Connect to see your balances.</p>
                  </div>
                  <Icon v-if="connected" name="check" :size="18" />
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Choose the cluster</strong>
                    <p>Choose {{ SOLANA_NETWORK_NAME }} in your wallet.</p>
                  </div>
                  <Icon
                    v-if="connected"
                    name="check"
                    :size="18"
                  />
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Add a little gas</strong>
                    <p>SOL on {{ SOLANA_CLUSTER }} covers transaction fees.</p>
                  </div>
                </li>
              </ol>
              <a
                class="primary wide"
                href="https://faucet.solana.com/"
                target="_blank"
                rel="noopener noreferrer"
                v-if="SOLANA_CLUSTER === 'devnet'"
                >Get Devnet SOL <Icon name="external" :size="18" /></a
              ><button
                class="text-button wide"
                :disabled="connecting || busy"
                @click="connected ? disconnectWallet() : connect()"
              >
                {{ connected ? "Disconnect wallet" : "Connect your wallet"
                }}<Icon name="wallet" :size="16" />
              </button>
            </aside>
            <div class="learn-path">
              <div class="section-heading">
                <h2>Your participation route</h2>
                <span class="muted-label">Your participation path</span>
              </div>
              <article>
                <span class="guide-number">01</span>
                <div class="learn-copy">
                  <span class="tiny-label">START WITH SOMETHING USEFUL</span>
                  <h2>Make a contribution</h2>
                  <p>
                    Quests publish an expiry and claim cap. Each wallet can
                    record participation once. Records do not verify off-chain
                    work or prove a unique identity, and they pay no token.
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
                  <span class="tiny-label">TOKEN FEATURES COME LATER</span>
                  <h2>Wait for token details</h2>
                  <p>
                    Token locking and rewards need a verified mint, defined
                    custody rules, and a funded reward source. None are enabled
                    by the current community program.
                  </p>
                  <button class="text-button" @click="go('stake')">
                    See token status <Icon :size="17" />
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
                    Create a proposal with a 1-30 day voting period, or vote on
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
                Know what you're signing.<br />Know what stays in your control.
              </p>
            </div>
            <div class="guide-details">
              <details open>
                <summary>What does a wallet confirmation do?</summary>
                <p>
                  Quest participation, proposal creation, and advisory voting
                  use the initialized Testnet community program. The wallet
                  shows each instruction before signing.
                </p>
              </details>
              <details>
                <summary>Who controls the protocol?</summary>
                <p>
                  The program authority can publish quests and pause community
                  actions. Governance votes are advisory and do not execute
                  treasury spending.
                </p>
              </details>
              <details>
                <summary>
                  Why is the token name different from Kintrava?
                </summary>
                <p>
                  The future mint will define the token name, symbol and decimals.
                  Kintrava is the application brand, while KNTV is only a preview
                  label today. Current token details: {{ tokenIdentity }}.
                </p>
              </details>
              <details>
                <summary>Is a Kintrava token deployed?</summary>
                <p>
                  No Kintrava token mint is configured. KNTV is a preview label
                  only; the community program does not create or distribute a
                  token. A mint's name, symbol, decimals, and address will be
                  shown after they are provided and verified.
                </p>
              </details>
              <details>
                <summary>Is Kintrava an official Solana product?</summary>
                <p>
                  No. Kintrava is an independent community project currently
                  configured for {{ SOLANA_NETWORK_NAME }}. It is not affiliated
                  with the Solana Foundation.
                </p>
              </details>
              <details>
                <summary>
                  Why am I seeing a preview or a connection error?
                </summary>
                <p>
                  A preview means sample content is shown and no transaction is
                  submitted. A connection error means the configured Solana data
                  could not be read. Use Refresh to retry.
                  Never share a seed phrase or private key to resolve a
                  connection issue.
                </p>
              </details>
            </div>
          </div>
        </section>
      </main>
            <footer>
        <span>© 2026 Kintrava <span class="footer-separator">·</span> Move together on-chain.</span>
        <span>Independent community project <span class="footer-dot"></span> {{ SOLANA_NETWORK_NAME }}</span>
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
  <div v-if="walletPickerOpen" class="wallet-picker-backdrop" @click.self="closeWalletPicker">
    <section class="wallet-picker" role="dialog" aria-modal="true" aria-labelledby="wallet-picker-title">
      <button class="wallet-picker-close icon-button" aria-label="Close wallet picker" @click="closeWalletPicker">
        <Icon name="close" :size="17" />
      </button>
      <span class="eyebrow">SOLANA WALLET STANDARD</span>
      <h2 id="wallet-picker-title">Choose a wallet</h2>
      <p>Connect a wallet that supports {{ SOLANA_NETWORK_NAME }}.</p>
      <div class="wallet-picker-list">
        <button v-for="candidate in walletOptions" :key="candidate.name" class="wallet-picker-option" @click="chooseWallet(candidate)">
          <img v-if="candidate.icon" :src="candidate.icon" :alt="candidate.name + ' icon'" />
          <span>{{ candidate.name }}</span>
          <Icon name="arrow" :size="17" />
        </button>
      </div>
      <button class="text-button wide" @click="closeWalletPicker">Cancel</button>
    </section>
  </div>
</template>







