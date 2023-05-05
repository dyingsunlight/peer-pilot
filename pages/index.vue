<script lang="ts" setup>
import {ref} from 'vue'
import {CloudflareSignalingClient} from "./cloudflare-signaling-client"
import { useRuntimeConfig } from "nuxt/app"
import { userTransfer } from "./user-transfer";
let signalingClient: CloudflareSignalingClient|undefined

const clientId = Math.random().toString(36).slice(2)
const clientSecret = Math.random().toString(36).slice(2)

const roomId = ref("001")
const isConnected = ref(false)
const {
  clients,
  transferManager,
  handleSendFile,
} = userTransfer({ clientId })

const start = async () => {
  if (isConnected.value) {
    return
  }
  const isDevelopmentMode = useRuntimeConfig().mode === 'development'

  signalingClient = new CloudflareSignalingClient({
    roomId: roomId.value,
    clientId,
    clientSecret,
    transferManager: transferManager
  })
  await signalingClient.connect(isDevelopmentMode ? 'ws://localhost:8788/api/websocket' : `wss://${window.location.host}/api/websocket`)
  await signalingClient.updatePeerConnections()
  isConnected.value = true
}

</script>
<template>
  <div style="display: flex; flex-direction: column; max-width: 600px; width: 100%; margin: 20vh auto">
    <div class="w-full">
      <h3 class="text-xl">Room Number</h3>
      <input type="text" placeholder="Type here" class="input input-bordered w-full" v-model="roomId" style="margin-top: 8px" />
    </div>

    <template v-if="isConnected">
      <div class="divider">Peer client list</div>
      <ul>
        <li v-for="client in clients" :key="client.clientId" style="padding: 8px">
        <span :style="{ opacity: client.status === 'connected' ? 1 : 0.2 }">
          {{ client.name }} - {{ client.status }}
        </span>
          <button v-if="client.status === 'connected'" @click="handleSendFile(client.clientId)"  class="btn btn-sm" style="margin-left: 8px"> Send File </button>
        </li>
      </ul>
      <p v-if="!clients.length" class="text-center text-accent-content/50">
        Share the Room Number to others.
      </p>
      <div class="divider"></div>
      <button class="btn btn-sm" @click="handleSendFile()" :disabled="!clients.length">
        Send to everyone
      </button>
    </template>
    <template v-else>
      <div class="divider"></div>
      <button class="btn" @click="start">
        Connect
      </button>
    </template>





  </div>
</template>
