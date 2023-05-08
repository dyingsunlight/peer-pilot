<script setup lang="ts">
import { generateAvatarDataURI } from '../../shared/avatar'
import { getNameColor } from '../../shared/naming'
import { computed } from 'vue'
const props = defineProps<{
  name: string
}>()
const colors = computed(() => getNameColor(props.name))
</script>

<template>
  <img :src="generateAvatarDataURI({ name, backgroundColor: colors.backgroundColor, foregroundColor: colors.foregroundColor})">
</template>
