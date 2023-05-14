import {TransferManagerModule} from "./base"
import {TransferManager} from "../transfer-manager"

let invokeIndex = 0
export enum FileManagerModuleEvents {
  File = 'File',
  Progress = 'Progress'
}
export class FileTransferManagerModule extends TransferManagerModule {

  files: { file: File, id: string }[] = []
  constructor(connectionManager: TransferManager) {
    super({
      namespace: 'file',
      transferManager: connectionManager,
    })
    this.addBroadcastListener('file-metadata', async ({ data, sourceClientId }) => {
      const { filename, size, secret, expiryTime } = data
      const file = await this.invoke({
        event: secret,
        targetClientId: sourceClientId
      })
      this.dispatch(FileManagerModuleEvents.File, { file, filename, sourceClientId })
    })
  }

  async send(args: { file: File, timeout?: number, clientIds?: string[] }) {
    const { file, timeout = 30000, clientIds } = args
    const secret = Math.random().toString()
    await this.broadcast({
      event: 'file-metadata',
      data: {
        filename: file.name,
        size: file.size,
        secret,
        expiryTime: Date.now() + timeout
      },
      clientIds
    })
    this.setInvokeListener(secret, () => file.arrayBuffer(), (args) => {
      this.dispatch(FileManagerModuleEvents.Progress, {
        filename: file.name,
        fileSize: file.size,
        ...args,
      })
    })
    await new Promise(resolve => setTimeout(resolve, timeout)).then(() => {
      this.deleteInvokeListener(secret)
    })
  }
}
