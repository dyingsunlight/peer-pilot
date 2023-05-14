<script lang="ts" setup>
import 'webrtc-adapter'
import AppAvatar from './components/avatar.vue'
import {computed, onMounted, ref} from 'vue'
import {SignalingClient, SignalingClientEvents} from "./signaling-client.ts"
import { useRuntimeConfig } from "nuxt/app"
import { userTransfer } from "./user-transfer"
import { useState } from "./use-state"
import { generateAvatarDataURI } from '../shared/avatar'
import {getNameColor} from "../shared/naming"
import { useDropSend } from './use-drop-send'

let signalingClient: SignalingClient|undefined
const clientId = Math.random().toString(36).slice(2)
const clientSecret = Math.random().toString(36).slice(2)

const {
  // sendingRecords,
  clients,
  transferManager,
  profileModule,
  handleSendFile,
  handleSelectAndSendFile,
} = userTransfer({ clientId })

const {
  sharedUrl,
  roomId,
  clientName,
} = useState({
  profileModule,
})

const sharedUrlInput = ref<HTMLInputElement>()
const isNameDialogOpened = ref<boolean>(false)
const colors = computed(() => getNameColor(clientName.value))
const activeClients = computed(() => clients.value.filter(client => client.status !== 'disconnected'))

const handleCloseRenameDialog = () => isNameDialogOpened.value = false
const handleOpenRenameDialog = () => isNameDialogOpened.value = true
const handleCopy = () => {
  if (!sharedUrlInput.value) {
    return
  }
  sharedUrlInput.value.select()
  document.execCommand('copy')
}
const isConnected = ref(false)
const isConnecting = ref(false)
const start = async () => {
  if (isConnecting.value) {
    return
  }
  isConnecting.value = true
  try {
    signalingClient = new SignalingClient({
      endpoint: useRuntimeConfig().mode === 'development' ? `ws://${window.location.hostname}:8788/api/websocket` : `wss://peer-pilot.deno.dev/api/websocket`,
      roomId: roomId.value,
      clientId,
      clientSecret,
      transferManager: transferManager
    })
    const offDisconnectEvent = signalingClient.on(SignalingClientEvents.ServerDisconnected, () => {
      isConnected.value = false
      offDisconnectEvent()
    })
    const offConnectedEvent = signalingClient.on(SignalingClientEvents.ServerConnected, () => {
      isConnected.value = true
      offConnectedEvent()
    })
    await signalingClient.connect()
    await signalingClient.updatePeerConnections()
  } finally {
    isConnecting.value = false
  }
}

const handleRename = (newName: string) => profileModule.setProfile({ name: newName })

const {
  handleDragEnter
} = useDropSend({ handleSendFile: handleSendFile })

const handlePreDropEnter = (e) => {
  if (!clients.value.length || !clients.value.some(client => client.status === 'connected')){
    return
  }
  handleDragEnter(e)
}

onMounted(() => {
  start()
  // window.transferManager = transferManager
  // window.profileModule = profileModule
})

</script>
<template>
  <div class="flex flex-col"
       style="max-width: 600px; width: 100%; margin: 20vh auto; height: 100%"
       @dragenter="handlePreDropEnter">
    <div class="flex flex-col items-center		">
      <img  style="width: 64px" :src="generateAvatarDataURI({ name: clientName, backgroundColor: colors.backgroundColor, foregroundColor: colors.foregroundColor})">
      <span class="text-xl text-black mt-2" @click="handleOpenRenameDialog" style="cursor: pointer"> {{ clientName }}</span>
    </div>
    <template v-if="isConnected">
      <div class="divider"> Devices </div>
      <ul>
        <li v-for="client in activeClients" :key="client.clientId"
            :style="{
              filter: `grayscale(${client.status === 'connected' ? 0 : 1})`,
              opacity: client.status === 'connected' ? 1 : 0.5
            }"
            class="flex items-center p-2"
        >
          <AppAvatar :name="client.name"></AppAvatar>
          <p class="ml-2">
            {{ client.name }}
          </p>
          <div v-if="client.connectionType" class="badge badge-info ml-2">
            {{ client.connectionType }}
          </div>
          <div class="badge badge-success ml-2">
            {{ client.status }}
          </div>
          <button v-if="client.status === 'connected'"
                  @click="handleSelectAndSendFile(client.clientId)"
                  class="btn btn-sm"
                  style="margin-left: 8px">
            Send File
          </button>
        </li>
      </ul>
      <p v-if="!clients.length" class="text-center text-accent-content/50 text-center">
        No others device was found.
      </p>
      <div class="divider"></div>
      <button class="btn" @click="handleSelectAndSendFile()" :disabled="!clients.length || !clients.some(client => client.status === 'connected')">
        Send for everyone.
      </button>
    </template>
    <template v-else>
      <div class="divider"></div>
      <button class="btn" @click="start">
        Connect
      </button>
    </template>
    <div class="divider"></div>
    <div>
      <div class="flex">
        <input type="text"
               placeholder="URL"
               class="input input-bordered w-full"
               ref="sharedUrlInput"
               readonly
               @click="handleCopy"
               :value="sharedUrl"
        />
        <span class="btn btn-primary ml-2" @click="handleCopy">
            Copy
          </span>
      </div>
      <p class="mt-2 text-accent-content/50">
        Share the link to other device to start send file.
      </p>
    </div>
  </div>
  <teleport to="body">
    <input type="checkbox" class="modal-toggle" v-model="isNameDialogOpened"/>
    <div class="modal" @click.self="handleCloseRenameDialog">
      <div class="modal-box relative">
        <h3 class="font-bold text-lg"> Rename </h3>
        <p class="py-4">
          <input type="text"
                 placeholder="Current Name"
                 class="input input-bordered w-full"
                 :value="clientName"
                 @keydown.enter="handleRename($event.target.value)"
                 @blur="handleRename($event.target.value)"
          />
        </p>
        <div class="modal-action">
          <label for="my-modal-5" class="btn" @click="handleCloseRenameDialog">Close</label>
        </div>
      </div>
    </div>
  </teleport>
</template>
