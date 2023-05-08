import {ref, watch, onMounted} from "vue"
import * as Throttle from '../shared/throttle'
import {ProfileTransferManagerModule} from "./modules/profile"
import { getRandomName } from "../shared/naming"

export const useState = (args: {
  profileModule: ProfileTransferManagerModule
}) => {
  const {
    profileModule
  } = args
  const clientName = ref()
  const roomId = ref()
  const sharedUrl = ref()
  onMounted(async () => {
    const url = new URL(location.href)
    roomId.value = url.searchParams.get("room") || Math.random().toString(36).slice(2)
    clientName.value = localStorage.getItem(`name@${roomId.value}`) || getRandomName()
    applyNameToLocalStorage()
    applyRoomToUrl()
    await profileModule.setProfile({ name: clientName.value })
  })
  const applyRoomToUrl = Throttle.raf(() => {
      const url = new URL(window.location.href)
      url.searchParams.set('room', roomId.value)
      window.history.replaceState(null, "", url.toString())
      sharedUrl.value =  url.toString()
    }
  )
  const applyNameToLocalStorage = Throttle.raf(() => {
    localStorage.setItem(`name@${roomId.value}`, clientName.value)
    }
  )
  watch(roomId, applyRoomToUrl)
  watch(clientName, applyNameToLocalStorage)
  return {
    clientName,
    roomId,
    sharedUrl
  }
}
