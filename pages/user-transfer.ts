import {TransferManager} from "./transfer-manager";
import {ProfileConnectionManagerModule, ProfileConnectionManagerModuleEvents} from "./modules/profile";
import {MessageManagerModule} from "./modules/message";
import {FileManagerModule, FileManagerModuleEvents} from "./modules/file";
import fileSaver from "file-saver"
import { ref } from 'vue'

export const userTransfer = (args: { clientId: string; }) => {
  const { clientId } = args

  const clients = ref<{ name: string, clientId: string, status: string }[]>([])

  const transferManager = new TransferManager(clientId)
  const profileModule = new ProfileConnectionManagerModule(transferManager)
  const messageModule = new MessageManagerModule(transferManager)
  const fileModule = new FileManagerModule(transferManager)

  const updatePeerProfile = () => {
    clients.value = Object.values(profileModule.clients).map(client => ({
      clientId: client.clientId,
      name: client.profile?.name || client.clientId,
      status: client.status
    }))
  }

  profileModule.on(ProfileConnectionManagerModuleEvents.PeerClientConnecting, updatePeerProfile)
  profileModule.on(ProfileConnectionManagerModuleEvents.PeerClientConnected, updatePeerProfile)
  profileModule.on(ProfileConnectionManagerModuleEvents.PeerClientDisconnected, updatePeerProfile)

  fileModule.on(FileManagerModuleEvents.File, ({ file, filename }) => {
    fileSaver.saveAs(new Blob([ file ]), filename)
  })

  const handleSendFile = async (clientId?: string) => {
    const handles = await showOpenFilePicker({
      multiple: true,
    })
    const clientIds = clientId ? [clientId] : clients.value.map(client => client.clientId)
    for (const handle of handles) {
      fileModule.send({
        file: await handle.getFile(),
        clientIds
      })
    }
  }
  return {
    clients,
    transferManager,
    profileModule,
    messageModule,
    fileModule,
    handleSendFile
  }
}
