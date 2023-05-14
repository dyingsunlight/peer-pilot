import {Emitter} from "../shared/emitter.ts";

export enum ClientEvents {
  Close = 'Close'
}
export class Client extends Emitter<ClientEvents> {
  #websocket: WebSocket
  #websocketMessageHandler: (e: MessageEvent) => void
  #websocketCloseHandler: () => void
  readonly clientId: string
  constructor(clientId: string, websocket: WebSocket, onWebsocketMessage: (e: MessageEvent, client: Client) => void) {
    super()
    this.clientId = clientId
    this.#websocket = websocket
    this.#websocketMessageHandler = (e: MessageEvent) => onWebsocketMessage(e, this)
    this.#websocketCloseHandler = () => this.close()
    websocket.addEventListener('close', this.#websocketCloseHandler)
    websocket.addEventListener('error', this.#websocketCloseHandler)
    websocket.addEventListener('message', this.#websocketMessageHandler)
  }
  send(data: ArrayBuffer) {
    const websocket = this.#websocket
    if (websocket.readyState === 1) {
      websocket.send(data)
    }
  }
  close() {
    const websocket = this.#websocket
    websocket.removeEventListener('message', this.#websocketMessageHandler)
    websocket.removeEventListener('close', this.#websocketCloseHandler)
    websocket.removeEventListener('error', this.#websocketCloseHandler)
    websocket.close()
    this.dispatch(ClientEvents.Close)
  }
}
