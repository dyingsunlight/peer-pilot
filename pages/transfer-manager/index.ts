import { Emitter } from '../../shared/emitter'
import { DataChannelsManager, DataChannelEvents } from './data-channels-manager'
import { join as joinBuffer, split as splitBuffer } from '../../shared/buffer-utils'

export type InvokeArgs = { event: string; data?: ArrayBuffer; targetClientId: string }
export type InvokeHandler = (args: InvokeArgs & { sourceClientId: string }) => any | Promise<ArrayBuffer|void>

export type BroadcastArgs = { event: string; data?: ArrayBuffer; clientIds?: string[] }
export type BroadcastHandler = (args: BroadcastArgs & { sourceClientId: string }) => any | Promise<void>

export enum TransferManagerEvents {
  PeerConnecting = 'PeerConnecting',
  PeerConnected = 'PeerConnected',
  PeerDisconnected = 'PeerDisconnected',
}
enum DataEventNames {
  Invoke = 'invoke',
  Broadcast = 'broadcast',
}

interface DataCommonEvent {
  name: DataEventNames
  args?: any
}
interface DataInvokeEvent extends DataCommonEvent {
  name: DataEventNames.Invoke
  args: {
    handlerId: string
    replyEvent: string
  }
}
interface DataInvokeReplyEvent extends DataCommonEvent {
  name: DataEventNames.Invoke
  args: {
    handlerId: string
  }
}
interface DataBroadcastEvent extends DataCommonEvent {
  name: DataEventNames.Broadcast
  args: {
    event: string
  }
}

export class TransferManager extends Emitter<TransferManagerEvents> {
  public connections: Record<string, { dataChannelsManager: DataChannelsManager; peerConnection: RTCPeerConnection }> = {}
  public readonly clientId = ''
  private broadcaster = new Emitter()

  constructor(clientId: string) {
    super()
    this.clientId = clientId
  }

  async addPeerConnection(args: { peerConnection: RTCPeerConnection; peerClientId: string }) {
    const { peerConnection, peerClientId } = args
    peerConnection.addEventListener("icecandidateerror", (err) => {
      console.error(err)
    })
    if (this.connections[peerClientId]) {
      await this.removePeerConnection({ peerClientId })
    }

    const dataChannelsManager = new DataChannelsManager({
      peerConnection,
    })
    this.connections[peerClientId] = {
      dataChannelsManager,
      peerConnection,
    }
    this.dispatch(TransferManagerEvents.PeerConnecting, { peerClientId })
    const isConnected = await new Promise<boolean>(resolve => {
      const checkConnectionState = () => {
        if (peerConnection.connectionState === 'connecting' || peerConnection.connectionState === 'new') {
          return false
        }
        if (peerConnection.connectionState === 'connected') {
          peerConnection.removeEventListener('connectionstatechange', checkConnectionState)
          resolve(true)
          return true
        }
        if (
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'closed'
        ) {
          peerConnection.removeEventListener('connectionstatechange', checkConnectionState)
          resolve(false)
          return false
        }
      }
      if (!checkConnectionState()) {
        peerConnection.addEventListener('connectionstatechange', checkConnectionState)
      }
    })
    console.log('connected', peerClientId, isConnected)
    if (isConnected) {
      dataChannelsManager.on(
        DataChannelEvents.ReceivedData,
        async (args: { data: ArrayBuffer; channel: DataChannelsManager; }) => {
          const { data, channel: dataChannel } = args
          const [eventBuffer, payload]: Uint8Array[] = splitBuffer(new Uint8Array(data))
          const event = JSON.parse(new TextDecoder().decode(eventBuffer))
          // @ts-ignore
          if (event.name === DataEventNames.Invoke) {
            const e = event as DataInvokeEvent
            if (!this.invokeHandlers[e.args.handlerId]) {
              // console.log('Invoke Event has been ignored due to handler not found: ' + JSON.stringify(e, null, 2))
              return
            }
            const invokeResult =
              (await this.invokeHandlers?.[e.args.handlerId]({
                sourceClientId: peerClientId,
                targetClientId: this.clientId,
                event: e.args.handlerId,
                data: payload?.buffer,
              })) || null

            const eventBuffer = new TextEncoder().encode(JSON.stringify({
              name: DataEventNames.Invoke,
              args: {
                handlerId: e.args.replyEvent,
              },
            } as DataInvokeReplyEvent))
            await dataChannel
              .send(joinBuffer([
                eventBuffer,
                invokeResult ? invokeResult : undefined
              ].filter(Boolean)))
              .catch(err => {
                // Invoke has error happened.
                // Mute the error here seem there is no need to show to user.
                console.error(err)
              })
          }
          if (event.name === DataEventNames.Broadcast) {
            this.broadcaster.dispatch(event.args.event, {
              event: event.args.event,
              sourceClientId: peerClientId,
              targetClientId: this.clientId,
              data: payload?.buffer,
            })
          }
        },
      )
      const onConnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected') {
          this.removePeerConnection({ peerClientId })
          peerConnection.removeEventListener('connectionstatechange', onConnectionstatechange)
        }
      }
      peerConnection.addEventListener('connectionstatechange', onConnectionstatechange)
      this.dispatch(TransferManagerEvents.PeerConnected, { peerClientId: peerClientId })
      return true
    } else {
      await this.removePeerConnection({ peerClientId })
      return false
    }
  }
  public async removePeerConnection(args: { peerClientId: string }) {
    const { peerClientId } = args
    const connection = this.connections[peerClientId]
    if (connection) {
      this.dispatch(TransferManagerEvents.PeerDisconnected, { peerClientId: peerClientId })
      connection.dataChannelsManager.disconnect()
      connection.peerConnection.close()
      delete this.connections[peerClientId]
    }
  }

  private invokeHandlers: Record<string, InvokeHandler> = {}
  /**
   *  Request connected client to invoke and retrieve response.
   */
  async invoke<T = any>(args: InvokeArgs) {
    const { event, data, targetClientId } = args
    if (!targetClientId) {
      throw new Error('Error! Invoke targetClientId must be specified!')
    }
    // Invoke self.
    if (targetClientId === this.clientId) {
      return this.invokeHandlers[event]?.({ event, data, sourceClientId: this.clientId, targetClientId: this.clientId })
    }
    const peerConnection = this.connections[targetClientId]
    if (peerConnection?.peerConnection.connectionState !== 'connected') {
      throw new Error("InvokeErrorTargetClientOffline")
    }
    const dataChannelsManager = peerConnection.dataChannelsManager
    if (!dataChannelsManager) {
      throw new Error('Error! Invoke dataChannelsManager not found!')
    }
    const replyEvent = `${event}:reply:${Math.random().toString(36).slice(2)}`

    const waitForReplyPromise = new Promise<T>(resolve => {
      dataChannelsManager.on(DataChannelEvents.ReceivedData, args => {
        const { data } = args
        const [eventBuffer, payload]: Uint8Array[] = splitBuffer(data)
        const event = JSON.parse(new TextDecoder().decode(eventBuffer)) as DataInvokeEvent
        if (event.name === DataEventNames.Invoke && event.args.handlerId === replyEvent) {
          resolve(payload.buffer)
        }
      })
    })
    const eventBuffer = new TextEncoder().encode(JSON.stringify(        {
      name: DataEventNames.Invoke,
      args: {
        handlerId: event,
        replyEvent,
      },
    } as DataInvokeEvent))
    await dataChannelsManager.send(joinBuffer([
      eventBuffer,
      data
    ].filter(Boolean)))
    return await waitForReplyPromise
  }
  setInvokeListener(event: string, handler: InvokeHandler) {
    this.invokeHandlers[event] = handler
  }
  deleteInvokeListener(event: string) {
    delete this.invokeHandlers[event]
  }

  async broadcast(args: BroadcastArgs) {
    const { data, clientIds = Object.keys(this.connections) } = args
    const eventBuffer = new TextEncoder().encode(JSON.stringify({
      name: DataEventNames.Broadcast,
      args: {
        ...args,
      },
    } as DataBroadcastEvent))
    await Promise.all(
      clientIds
        .filter(clientId => {
          return this.connections[clientId]?.dataChannelsManager.getState() === 'connected'
        })
        .map(async clientId => {
          try {
            await this.connections[clientId].dataChannelsManager.send(joinBuffer([
              eventBuffer,
              data,
            ].filter(Boolean)))
          } catch (err) {
            console.error(clientId, err)
          }
        })
    )
  }
  addBroadcastListener(event: string, handler: BroadcastHandler) {
    return this.broadcaster.on(event, handler)
  }
  removeBroadcastListener(event: string, handler?: BroadcastHandler) {
    // @ts-ignore
    return this.broadcaster.off(event, handler)
  }
  disconnect() {
    Object.entries(this.connections).forEach(([clientId, connection]) => {
      connection.dataChannelsManager.disconnect()
      connection.peerConnection.close()
      delete this.connections[clientId]
    })
  }
}
