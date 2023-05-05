import {ConnectManagerModule} from "./base"
import {TransferManager} from "../transfer-manager"

export class MessageManagerModule extends ConnectManagerModule {

  constructor(connectionManager: TransferManager) {
    super({
      namespace: 'message',
      connectionManager,
    })
    this.addBroadcastListener('message', ({ data, sourceClientId }) => {
      console.log("Message: ", data, sourceClientId)
    })
  }

  send(message: string) {
    this.broadcast({
      event: 'message',
      data: message
    })
  }
}
