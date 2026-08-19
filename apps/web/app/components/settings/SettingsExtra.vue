<script setup lang="ts">
import type { Settings } from '@fetcharr/shared'

import SettingsToggle from './SettingsToggle.vue'

const props = defineProps<{ draft: Settings }>()
</script>

<template>
  <div class="tab-panel">
    <SettingsToggle
      v-model="props.draft.write_nfo"
      name="Write NFO files"
      desc="Jellyfin/Kodi schema next to each media file"
    />
    <SettingsToggle
      v-model="props.draft.write_thumbnails"
      name="Write thumbnails"
      desc="poster.jpg per file and per channel folder"
    />
    <SettingsToggle
      v-model="props.draft.write_info_json"
      name="Sidecar metadata JSON"
      desc="keep the full yt-dlp info dump next to the file — it is always fetched during the download"
    />
    <SettingsToggle
      v-model="props.draft.podcast_rss_enabled"
      name="Podcast RSS feeds"
      desc="per audio subscription, API-key token in URL"
    />
    <p v-if="props.draft.podcast_rss_enabled" class="note">
      A feed only appears once RSS is switched on for that subscription as well.
    </p>

    <SettingsToggle
      v-model="props.draft.view_counter_enabled"
      name="View counter & resume positions"
      desc="track plays in the built-in player"
    />
  </div>
</template>

<style scoped>
.tab-panel { display: flex; flex-direction: column; }
.note {
  margin: 6px 0 4px;
  font-size: 11px;
  color: var(--color-neutral-700);
}
</style>
