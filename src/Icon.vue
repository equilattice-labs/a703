<script setup>
defineProps({ name: { type: String, default: 'arrow' }, size: { type: [Number, String], default: 20 } })
const paths = {
  home: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  quests: 'M8 4h12v16H4V8 M8 2v4 M16 2v4 M8 11l2 2 5-5 M8 17h8',
  stake: 'M4 18V9 M10 18V5 M16 18v-7 M22 21H2 M16 5l3-3 3 3 M19 2v12',
  governance: 'M3 4h18v12H9l-6 4V4z M7 8h10 M7 12h6',
  treasury: 'M3 9h18 M4 20h16 M6 10v7 M12 10v7 M18 10v7 M2 6l10-4 10 4v3H2z',
  learn: 'M12 5c-3-3-7-3-10-2v15c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-7-1-10 2z M12 5v15',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  external: 'M7 17 17 7 M7 7h10v10',
  wallet: 'M3 6h17v14H3z M3 6V3h14v3 M15 11h6v5h-6z',
  search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  refresh: 'M20 7a9 9 0 0 0-15-2L2 8 M2 2v6h6 M4 17a9 9 0 0 0 15 2l3-3 M22 22v-6h-6',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12 M6 18 18 6',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  clock: 'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  shield: 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',
  plus: 'M12 5v14 M5 12h14',
  spark: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z'
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.arrow" /></svg></template>
