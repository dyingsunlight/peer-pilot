import {TransferManager} from "./transfer-manager";
import {ProfileTransferManagerModule, ProfileConnectionManagerModuleEvents} from "./modules/profile";
import {MessageTransferManagerModule} from "./modules/message";
import {FileTransferManagerModule, FileManagerModuleEvents} from "./modules/file";
import fileSaver from "file-saver"
import { ref } from 'vue'

export const userTransfer = (args: { clientId: string; }) => {
  const { clientId } = args

  const clients = ref<{ name: string, clientId: string, status: string; connectionType: string }[]>([])

  const transferManager = new TransferManager(clientId)
  const profileModule = new ProfileTransferManagerModule(transferManager)
  const messageModule = new MessageTransferManagerModule(transferManager)
  const fileModule = new FileTransferManagerModule(transferManager)

  // fileModule.on(FileManagerModuleEvents.Progress, (args) => {
  //   const index = sendingRecords.value.findIndex(record => record.id === args.id)
  //   console.log("args", args, index)
  //   if (args.index === args.length - 1 && index !== -1) {
  //     // sendingRecords.value.splice(index, 1)
  //     console.log("sent", args.id)
  //   } else if (index === -1) {
  //     sendingRecords.value.push({
  //       ...args,
  //       lastTriggerTime: Date.now(),
  //       speed: `0 KB/Sec `
  //     })
  //   } else {
  //     const measureTime = Math.min((Date.now() - sendingRecords.value[index].lastTriggerTime) / 1000, 1)
  //     const measureSize = sendingRecords.value[index].sentSize - args.sentSize
  //     // sendingRecords.value[index] = {
  //     //   ...args,
  //     //   lastTriggerTime: Date.now(),
  //     //   speed: `${Math.round(measureSize / measureTime / 1024)} KB/Sec`
  //     // }
  //     sendingRecords.value.push({
  //       ...args,
  //       lastTriggerTime: Date.now(),
  //       speed: `${Math.round(measureSize / measureTime / 1024)} KB/Sec`
  //     })
  //   }
  // })

  const updatePeerProfile = () => {
    clients.value = Object.values(profileModule.clients).map(client => ({
      clientId: client.clientId,
      name: client.profile?.name || client.clientId,
      status: client.status,
      connectionType: client.connectionType
    }))
  }

  profileModule.on(ProfileConnectionManagerModuleEvents.PeerClientConnecting, updatePeerProfile)
  profileModule.on(ProfileConnectionManagerModuleEvents.PeerClientConnected, updatePeerProfile)
  profileModule.on(ProfileConnectionManagerModuleEvents.PeerClientDisconnected, updatePeerProfile)

  fileModule.on(FileManagerModuleEvents.File, ({ file, filename }) => {
    fileSaver.saveAs(new Blob([ file ]), filename)
  })

  const handleSelectAndSendFile = async (clientId?: string) => {
    const getFiles = async () => {
      const fileSelector = document.createElement('input') as HTMLInputElement
      fileSelector.style.display = 'none'
      document.body.appendChild(fileSelector)
      await new Promise<void>(resolve => {
        // Note:  For Desktop safari open use input[file] must append the element to document first
        fileSelector.setAttribute('type', 'file')
        fileSelector.setAttribute('multiple', 'true')
        fileSelector.addEventListener('change', () => {
          resolve()
        })
        fileSelector.addEventListener('select', () => {
          resolve()
        })
        fileSelector.click()
      }).finally(() => {
        document.body.removeChild(fileSelector)
      })
      return fileSelector.files
    }
    const clientIds = clientId ? [clientId] : clients.value.map(client => client.clientId)
    for (const file of await getFiles()) {
      fileModule.send({
        file: file,
        clientIds
      })
    }
  }
  const handleSendFile = async (file: File, clientId?: string) => {
    const clientIds = clientId ? [clientId] : clients.value.map(client => client.clientId)
    return fileModule.send({
      file: file,
      clientIds
    })
  }
  return {
    clients,
    transferManager,
    profileModule,
    messageModule,
    fileModule,
    handleSendFile,
    handleSelectAndSendFile
  }
}
