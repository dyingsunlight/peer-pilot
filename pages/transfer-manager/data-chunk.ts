const DataChannelPayloadBufferDefaultSize = 65535
const DataChannelPayloadBufferMetadataSize = 32
export class DataChunk {
  public takenIndex = 0
  private buffer: Uint8Array = new Uint8Array(0)
  public readonly chunkSize: number = DataChannelPayloadBufferDefaultSize
  public readonly chunkAmount: number
  public readonly id: number
  constructor(args: ({ data: ArrayBuffer, chunkSize?: number, id?: number })) {
    this.chunkSize = (args.chunkSize || DataChannelPayloadBufferDefaultSize) - DataChannelPayloadBufferMetadataSize
    const data = args.data
    this.id = args.id || Math.max(Math.ceil(Number.MAX_SAFE_INTEGER * Math.random()) - 1, 0)
    this.chunkAmount = Math.ceil(data.byteLength / this.chunkSize)
    this.buffer = new Uint8Array(data as ArrayBuffer)
  }
  public getBytesLength() {
    return this.buffer.byteLength
  }
  public take() {
    const index = this.takenIndex
    const chunk = this.buffer.slice(this.takenIndex * this.chunkSize, this.chunkSize * ++this.takenIndex)
    const output = new Uint8Array(chunk.byteLength + DataChannelPayloadBufferMetadataSize)
    const dataView = new DataView(new ArrayBuffer(DataChannelPayloadBufferMetadataSize))
    dataView.setUint32(0, this.id)
    dataView.setUint32(4, index)
    dataView.setUint32(8, this.chunkAmount)
    // Uint64 needs 8 bytes
    dataView.setBigUint64(12, BigInt(Date.now()))
    // Next 20
    output.set(new Uint8Array(dataView.buffer), 0)
    output.set(chunk, DataChannelPayloadBufferMetadataSize)
    return output
  }
  public isEnd() {
    return this.takenIndex * (this.chunkSize + DataChannelPayloadBufferMetadataSize) >= this.buffer.byteLength
  }
  static getChunkMetadata(buffer: ArrayBuffer) {
    const dataView = new DataView(buffer.slice(0, DataChannelPayloadBufferMetadataSize))
    return {
      id: dataView.getUint32(0),
      index: dataView.getUint32(4),
      length: dataView.getUint32(8),
      latency: Math.max(Date.now() - Number(dataView.getBigUint64(12)), 0)
    }
  }
  static restore(buffers: ArrayBuffer[]) {
    let result = new Uint8Array(buffers.reduce((sum, buffer) => sum + buffer.byteLength - DataChannelPayloadBufferMetadataSize, 0))
    const items = buffers.map((buffer) => {
      const chunkPosition = new DataView(buffer.slice(4, 8)).getUint32(0)
      return {
        index: chunkPosition,
        buffer: buffer.slice(DataChannelPayloadBufferMetadataSize)
      }
    }).sort((itemA, itemB) => itemA.index > itemB.index ? 1 : -1)
    items.reduce((offset, item) => {
      result.set(new Uint8Array(item.buffer), offset)
      return offset + item.buffer.byteLength
    }, 0)
    return result
  }
}
