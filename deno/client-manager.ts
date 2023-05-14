import {Emitter} from "../shared/emitter.ts"
import {Client, ClientEvents} from "./client.ts"
import {decode, encode, ClientWebsocketEvents} from "../shared/event.ts"
const decoder = new TextDecoder

enum BroadcastServerSideMessage {
  Response = 0,
  ListClients = 1,
  ClientMessage = 2,
}

export enum ClientManagerEvents {
  Close = 'Close'
}
export class ClientManager extends Emitter {
  #clients: Record<string, Client> = {}
  #broadcastChannel: BroadcastChannel
  constructor(channelId: string) {
    super()
    this.#broadcastChannel = new BroadcastChannel(channelId)
    this.#broadcastChannel.addEventListener('message', this.#bindBroadcastMessage)
  }
  add(clientId: string, websocket: WebSocket) {
    this.#clients[clientId]?.close()
    const client = new Client(clientId, websocket, this.#onClientMessage.bind(this))
    this.#clients[clientId] = client
    const offClientEvent = client.on(ClientEvents.Close, () => {
      delete this.#clients[clientId]
      if (!Object.keys(this.#clients).length) {
        this.dispose()
      }
      offClientEvent()
    })
  }

  async #broadcastServerSideMessage(args: {
    message: BroadcastServerSideMessage
    body?: object|ArrayBuffer
    strategy?: 'response' | 'timeout'
    timeout?: number
  }): Promise<ArrayBuffer|ArrayBuffer[]|void> {
    const { message, body, timeout = 3000, strategy = 'on-response' } = args
    const broadcastChannel = this.#broadcastChannel
    const token = new Uint8Array([Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)])
    const responses: ArrayBuffer[] = []

    if (strategy === 'timeout') {
      const waitForInstanceResponse = (e: MessageEvent) => {
        const data = e.data
        if (data instanceof ArrayBuffer) {
          const {event, responseToken, rawBody} = decode(data)
          if (event === BroadcastServerSideMessage.Response && responseToken[0] === token[0] && responseToken[1] === token[1]) {
            responses.push(rawBody)
          }
        }
      }
      broadcastChannel.addEventListener('message', waitForInstanceResponse)
      broadcastChannel.postMessage(encode(message, token, body))
      await new Promise(resolve => setTimeout(resolve, timeout))
      broadcastChannel.removeEventListener('message', waitForInstanceResponse)
      return responses
    }

    if (strategy === 'response') {
      let resolver: ((val: ArrayBuffer) => void) | null = null
      const waitForInstanceResponse = (e: MessageEvent) => {
        const data = e.data
        if (!resolver) {
          console.error('Fatal error! the broadcastChannel event handler should not active while resolver are resolved.')
          return
        }
        if (data instanceof ArrayBuffer) {
          const {event, responseToken, rawBody} = decode(data)
          if (event === BroadcastServerSideMessage.Response && responseToken[0] === token[0] && responseToken[1] === token[1]) {
            resolver(rawBody)
            resolver = null
          }
        }
      }
      broadcastChannel.addEventListener('message', waitForInstanceResponse)
      broadcastChannel.postMessage(encode(message, token, body))
      return Promise.race([
        new Promise((resolve, reject) => setTimeout(resolve, timeout)).then(() => Promise.reject('Timeout')),
        new Promise<ArrayBuffer>(resolve => resolver = resolve)
      ]).finally(() => {
        broadcastChannel.removeEventListener('message', waitForInstanceResponse)
      })
    }

    throw new Error('Unknown strategy')
  }
  async #onClientMessage(e: MessageEvent, client: Client) {
    const data = e.data
    const clients = this.#clients
    if (data instanceof ArrayBuffer) {
      const {event, responseToken, rawBody} = decode(data)
      switch (event) {
        case ClientWebsocketEvents.ListClients: {
          const clientIdsBuffers = await this.#broadcastServerSideMessage({
            message: BroadcastServerSideMessage.ListClients,
            strategy: "timeout",
          }) as ArrayBuffer[]
          const clientIds = clientIdsBuffers.reduce<string[]>((prev, rawBody) => prev.concat(JSON.parse(decoder.decode(rawBody))), [])
          client.send(encode(ClientWebsocketEvents.Response, responseToken, clientIds.concat(Object.keys(clients)).map(clientId => ({clientId}))))
        }
          break
        case ClientWebsocketEvents.ToPeerClientMessage: {
          const {targetClientId, payload} = JSON.parse(decoder.decode(rawBody))
          const targetClient = clients[targetClientId]
          if (targetClient) {
            targetClient.send(encode(ClientWebsocketEvents.FromPeerClientMessage, new Uint8Array([0, 0]), [
              {
                sourceClientId: client.clientId,
                payload
              }
            ]))
          } else {
            await this.#broadcastServerSideMessage({
              message: BroadcastServerSideMessage.ClientMessage,
              strategy: "response",
              timeout: 3000,
              body: {
                targetClientId,
                messages: [
                  {
                    sourceClientId: client.clientId,
                    payload
                  }
                ]
              }
            })
          }
        }
          break
        default: {
          console.error('Error Undefined Event type.')
        }
      }
    }
  }
  async #onPeerBroadcastMessage(e: MessageEvent) {
    const data = e.data
    const clients = this.#clients
    const channel = this.#broadcastChannel
    if (data instanceof ArrayBuffer) {
      const {event, responseToken, rawBody} = decode(data)
      switch (event) {
        case BroadcastServerSideMessage.ListClients: {
          const clientIds = Object.keys(clients)
          // Reply current instance clients
          channel.postMessage(encode(BroadcastServerSideMessage.Response, responseToken, clientIds))
        }
        case BroadcastServerSideMessage.ClientMessage: {
          const {targetClientId, messages} = JSON.parse(decoder.decode(rawBody))
          const targetClient = clients[targetClientId]
          if (targetClient) {
            targetClient.send(encode(ClientWebsocketEvents.FromPeerClientMessage, new Uint8Array([0, 0]), messages))
            // Reply succeed
            channel.postMessage(encode(BroadcastServerSideMessage.Response, responseToken))
          }
        }
        default: {
          console.error('Error undefined event type.')
        }
      }
    }
  }
  #bindBroadcastMessage = this.#onPeerBroadcastMessage.bind(this)
  dispose() {
    this.#broadcastChannel.removeEventListener('message', this.#bindBroadcastMessage)
    Object.values(this.#clients).forEach(client => {
      client.close()
    })
    this.dispatch(ClientManagerEvents.Close)
  }
}
