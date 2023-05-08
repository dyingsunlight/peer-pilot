import {decode, encode, SocketEvents} from "../shared/event"
import {parallelTasks} from "../shared/parallel-tasks"
import {Emitter} from "../shared/emitter"
import {TransferManager, TransferManagerEvents} from './transfer-manager'
import {presetIceServers} from "./ice-server"

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

interface PeerClient {
  clientId: string
  userData: string
}

export enum CloudflareSignalingClientEvents {
  ServerConnected = 'ServerConnected',
  ServerDisconnected = 'ServerDisconnected',
}

export class CloudflareSignalingClient extends Emitter {
  #websocket?: WebSocket

  readonly clientId: string
  readonly clientSecret: string
  readonly transferManager: TransferManager
  readonly roomId: string
  readonly endpoint: string
  constructor(args: {
    endpoint: string
    roomId: string
    clientId: string
    clientSecret: string
    transferManager: TransferManager
  }) {
    super()
    const { transferManager, roomId, clientSecret, clientId, endpoint } = args
    this.roomId = roomId
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.transferManager = transferManager
    this.endpoint = endpoint
  }

  #bindDisconnectedHandler = this.#onDisconnected.bind(this)
  async #onDisconnected() {
    this.dispatch(CloudflareSignalingClientEvents.ServerDisconnected)
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  async connect() {
    this.#websocket?.removeEventListener('message', this.#bindMessageHandler)
    this.#websocket?.removeEventListener('close', this.#bindDisconnectedHandler)
    this.#websocket?.close()
    this.#websocket = undefined
    const websocket = new WebSocket(`${this.endpoint}?roomId=${this.roomId}&clientId=${this.clientId}&clientSecret=${this.clientSecret}`)
    websocket.addEventListener('message', this.#bindMessageHandler)
    websocket.addEventListener('error', this.#bindDisconnectedHandler)
    websocket.addEventListener('close', this.#bindDisconnectedHandler)
    websocket.binaryType = 'arraybuffer'
    await new Promise(resolve => websocket.addEventListener('open', resolve))
    this.dispatch(CloudflareSignalingClientEvents.ServerConnected)
    this.#websocket = websocket
  }

  async updatePeerConnections() {
    const clients = await this.#invoke<PeerClient[]>(SocketEvents.ListClients)
    // const rtcPeerConnections = this.connectionManager.connections
    const tasks = clients
      .filter(client =>
        client.clientId !== this.clientId && !this.transferManager.connections[client.clientId])
      .map(client => {
        return async () => {
          const rtcPeerConnection = new RTCPeerConnection({
            iceServers: presetIceServers,
            // iceTransportPolicy: 'relay',
          })
          this.transferManager.addPeerConnection({
            peerClientId: client.clientId,
            peerConnection: rtcPeerConnection
          })
          const offer = await rtcPeerConnection.createOffer()
          await rtcPeerConnection.setLocalDescription(offer)
          await this.#invoke(SocketEvents.ClientMessage, {
            targetClientId: client.clientId,
            payload: JSON.stringify({
              clientId: this.clientId,
              type: "offer",
              offer,
            })
          })
        }
      })
    await parallelTasks(tasks)
    return clients
  }

  #invoke<T = any>(event: SocketEvents, data?: object) {
    return new Promise<T>(resolve => {
      const websocket = this.#websocket
      const token = new Uint8Array([Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)])
      websocket.send(encode(event, token, data ? textEncoder.encode(JSON.stringify(data)) : undefined))
      const callback = (e) => {
        if (!(e.data instanceof ArrayBuffer)) {
          console.error('error invalid data.', e)
          return
        }
        const { event, responseToken, rawBody } = decode(e.data)
        if (event === SocketEvents.Response &&
          responseToken[0] === token[0] &&
          responseToken[1] === token[1]
        ) {
          resolve(JSON.parse(textDecoder.decode(rawBody)))
          websocket.removeEventListener('message', callback)
        }
      }
      websocket.addEventListener('message', callback)
    })
  }

  #bindMessageHandler = this.#messageHandler.bind(this)
  async #messageHandler(e: MessageEvent) {
    if (!(e.data instanceof ArrayBuffer)) {
      console.error('error invalid data.', e)
      return
    }
    const { event, rawBody } = decode(e.data)
    if (event === SocketEvents.ServerMessage) {
      const messages = JSON.parse(textDecoder.decode(rawBody)).map(item => {
        item.payload = JSON.parse(item.payload)
        return item
      })
      const sortedMessage = messages.sort((messageA, messageB) => messageA.index > messageB.index ? 1 : -1)
      for (const message of sortedMessage) {
        if (message.payload.type === 'ice-candidate') {
          console.log('Received ice-candidate from ' + message.sourceClientId)
          try {
            await this.transferManager.connections[message.sourceClientId]?.peerConnection.addIceCandidate(message.payload.icecandidate)
          } catch (err) {
            console.error(err)
          }
        }
        if (message.payload.type === 'offer') {
          console.log('Received offer from ' + message.sourceClientId)
          const connection = new RTCPeerConnection({
            iceServers: presetIceServers,
            // iceTransportPolicy: 'relay',
          })
          this.transferManager.addPeerConnection({
            peerClientId: message.sourceClientId,
            peerConnection: connection
          })
          await connection.setRemoteDescription(message.payload.offer)
          connection.addEventListener('icecandidate', async (e) => {
            console.log('Sending icecandidate to ' + message.sourceClientId)
            await this.#invoke(SocketEvents.ClientMessage,{
              targetClientId: message.sourceClientId,
              payload: JSON.stringify({
                clientId: this.clientId,
                type: "ice-candidate",
                icecandidate: e.candidate,
              })
            })
          })
          const answer = await connection.createAnswer()
          await connection.setLocalDescription(answer)
          console.log('Sending answer to ' + message.sourceClientId)
          await this.#invoke(SocketEvents.ClientMessage, {
            targetClientId: message.sourceClientId,
            payload: JSON.stringify({
              clientId: this.clientId,
              type: "answer",
              answer,
            })
          })
        }
        if (message.payload.type === 'answer') {
          console.log('Update answer for ' + message.sourceClientId)
          const peerConnection =  this.transferManager.connections[message.sourceClientId]?.peerConnection
          peerConnection.addEventListener('icecandidate', async(e) => {
            console.log('Sending icecandidate to ' + message.sourceClientId)
            await this.#invoke(SocketEvents.ClientMessage, {
              targetClientId: message.sourceClientId,
              payload: JSON.stringify({
                clientId: this.clientId,
                type: "ice-candidate",
                icecandidate: e.candidate,
              })
            })
          })
          await peerConnection.setRemoteDescription(message.payload.answer)
        }
      }
    }
  }
}
