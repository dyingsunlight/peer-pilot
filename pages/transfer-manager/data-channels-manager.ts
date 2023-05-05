import { Emitter } from '../../shared/emitter'
import { DataChunk } from "./data-chunk";

const DataChannelReliableLabel = 'DataChannelReliable'

export enum DataChannelEvents {
  ReceivedData = 'ReceivedData',
  ReceivedChunk = 'ReceivedChunk'
}

export class DataChannelsManager extends Emitter<DataChannelEvents> {
  private readonly peerConnection: RTCPeerConnection
  private readonly channels: Record<string, { channel: RTCDataChannel; pendingBufferAmount: number }> = {}
  private readonly receivingBuffers: Record<number, ArrayBuffer[]> = {}

  constructor(args: { peerConnection: RTCPeerConnection }) {
    super()
    const { peerConnection } = args
    this.peerConnection = peerConnection

    peerConnection.addEventListener('datachannel', e => {
      this.addDataChannel({
        channel: e.channel,
      })
    })
    this.addDataChannel({
      channel: peerConnection.createDataChannel(DataChannelReliableLabel),
    })
    this.addDataChannel({
      channel: peerConnection.createDataChannel(DataChannelReliableLabel),
    })
  }

  private fifoResolveQueue: Record<string, { isSending: boolean; queue: ((msg?: string) => void)[][] }> = {}
  private async waitAllChannelReady() {
    for (const id of Object.keys(this.channels)) {
      const rtcDataChannel = this.channels[id].channel
      if (rtcDataChannel.readyState === 'open') {
        continue
      }
      if (rtcDataChannel.readyState === 'closed' || rtcDataChannel.readyState === 'closing') {
        delete this.channels[id]
        continue
      }
      await new Promise(resolve => {
        rtcDataChannel.addEventListener('open', resolve)
      })
    }
  }

  private async getScheduleChannelId() {
    await this.waitAllChannelReady()
    const channelIds: string[] = Object.keys(this.channels).filter(id => this.channels[id].channel.readyState === 'open')
    let minLoadsChannelId: string | null = null
    let minPendingBufferAmount: null | number = null
    for (const id of channelIds) {
      const pendingBufferAmount = this.channels[id].pendingBufferAmount
      if (minPendingBufferAmount === null) {
        minLoadsChannelId = id
        minPendingBufferAmount = pendingBufferAmount
      }
      if (pendingBufferAmount <= minPendingBufferAmount) {
        minLoadsChannelId = id
        minPendingBufferAmount = pendingBufferAmount
      }
    }

    if (minLoadsChannelId) {
      return minLoadsChannelId
    }

    throw new Error('Failed to find a available data channel!')
  }
  private addDataChannel(args: { channel: RTCDataChannel }) {
    const { channel } = args
    if (!channel.ordered) {
      throw new Error('Error! Given datachannel are not ordered mode!')
    }
    if (channel.label !== DataChannelReliableLabel) {
      throw new Error('Error! Given datachannel are not match DataChannelReliableLabel!')
    }
    const id = Math.random().toString(36).slice(2)
    this.fifoResolveQueue[id] = {
      isSending: false,
      queue: [],
    }
    this.channels[id] = {
      channel,
      pendingBufferAmount: 0,
    }
    // enforce transfer data type to buffer for convenience split chunk.
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = 65535
    channel.addEventListener('message', (e: MessageEvent) => {
      const { id, index, length } = DataChunk.getChunkMetadata(e.data)

      const group = this.receivingBuffers[id] || []
      this.receivingBuffers[id] = group
      group.push(e.data)
      // this.dispatch(DataChannelEvents.ReceivedChunk, {
      //   id,
      //   index,
      //   length,
      //   receivedSize: group.reduce((sum, chunk) => chunk.byteLength + sum, 0),
      //   estimateSize: length * e.data.byteLength
      // })
      if (index === length - 1) {
        const combinedBuffer = DataChunk.restore(this.receivingBuffers[id])
        delete this.receivingBuffers[id]
        this.dispatch(DataChannelEvents.ReceivedData, { data: combinedBuffer, channel: this })
      }
    })
  }

  async send(data: ArrayBuffer) {
    const channelId = await this.getScheduleChannelId()
    const channel = this.channels[channelId].channel
    const channelRecord = this.fifoResolveQueue[channelId]
    if (channelRecord.isSending) {
      await new Promise((resolve, reject) => {
        channelRecord.queue.push([resolve, reject])
      })
    }
    channelRecord.isSending = true
    const sctp = this.peerConnection.sctp
    if (!sctp) {
      throw new Error('peerConnection.sctp not found')
    }
    const maximumMessageSize = sctp.maxMessageSize
    const buffer = new DataChunk({ data: data, chunkSize: maximumMessageSize })
    let bytesSent = 0
    let isNetworkError = false
    this.channels[channelId].pendingBufferAmount += buffer.getBytesLength()
    while (!buffer.isEnd()) {
      const chunk = buffer.take()
      try {
        await channel.send(chunk)
        if (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
          await new Promise((resolve) => {
            const resolver = () => {
              resolve()
              channel.removeEventListener("bufferedamountlow", resolver)
            }
            channel.addEventListener("bufferedamountlow", resolve);
          })
        }
        bytesSent += chunk.byteLength
        this.channels[channelId].pendingBufferAmount -= chunk.byteLength
      } catch (err) {
        // Not throw the error immediately because some clean up must be done first.
        isNetworkError = true
        console.error(err)
      }

      // Transfer error occur
      if (isNetworkError) {
        // reset payload stress
        this.channels[channelId].pendingBufferAmount = this.channels[channelId].pendingBufferAmount - (buffer.getBytesLength() - bytesSent)
        break
      }
    }
    channelRecord.isSending = false

    const [resolve, reject] = channelRecord.queue.shift() || []
    if (isNetworkError) {
      reject("Network error")
      throw new Error('Network error!')
    }
    if (resolve) {
      resolve()
    }
  }
  public getState(): 'connected' | 'connecting' | 'disconnected' | 'connect-failed' {
    if (this.peerConnection.connectionState === 'connected') {
      return 'connected'
    }
    if (this.peerConnection.connectionState === 'connecting') {
      return 'disconnected'
    }
    if (this.peerConnection.connectionState === 'disconnected' || this.peerConnection.connectionState === 'closed') {
      return 'disconnected'
    }
    return 'disconnected'
  }
  disconnect() {
    Object.entries(this.channels).forEach(([id, { channel }]) => {
      channel.close()
      delete this.channels[id]
    })
  }
}
