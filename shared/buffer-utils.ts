enum DataType {
  ArrayBuffer = 0,
  Object = 1,
  String = 2,
  Number = 3,
  Boolean = 4,
}

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

const convert = (buffer: Uint8Array, dataType: DataType) => {
  const result = new Uint8Array(buffer.byteLength + 1)
  result.set(new Uint8Array([ dataType ]), 0)
  result.set(buffer, 1)
  return result
}

const getDataType = (obj: any): DataType | undefined => {
  switch (typeof obj) {
    case 'object':
      return obj instanceof ArrayBuffer ? DataType.ArrayBuffer : DataType.Object
    case 'string':
      return DataType.String
    case 'number':
      return DataType.Number
    case 'boolean':
      return DataType.Boolean
  }
}

export const convertToBuffer = (obj: any) => {
  const dataType = getDataType(obj)
  if (dataType === undefined) {
    throw new Error('Unknown data type.')
  }
  const buffer = new Uint8Array(obj instanceof ArrayBuffer ? obj : textEncoder.encode(JSON.stringify(obj)))
  return convert(buffer, dataType)
}

const revert = (buffer: Uint8Array) => ({ dataType: buffer[0], data: buffer.slice(1) })

export const revertFromBuffer = (buffer: Uint8Array | ArrayBuffer) => {
  const { dataType, data } = revert(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer)
  switch (dataType) {
    case DataType.ArrayBuffer:
      return data.buffer
    case DataType.Object:
    case DataType.String:
    case DataType.Number:
    case DataType.Boolean:
      return JSON.parse(textDecoder.decode(data))
    default:
      throw new Error('Unknown data type.')
  }
}


const Int32ByteLength = 4
const Int16ByteLength = 2
export const join = (buffers: (ArrayBuffer | Uint8Array)[]) => {
  const metadataDataView = new DataView(new ArrayBuffer(buffers.length * 4))
  for (let i = 0; i < buffers.length; i++) {
    metadataDataView.setInt32(i * Int32ByteLength, buffers[i].byteLength)
  }
  const metadataBufferSizeIndicator = new DataView(new ArrayBuffer(Int16ByteLength))
  metadataBufferSizeIndicator.setUint16(0, metadataDataView.byteLength)
  const data = new Uint8Array(
    metadataBufferSizeIndicator.byteLength + metadataDataView.byteLength + buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0),
  )
  let offset = 0
  for (const buffer of [metadataBufferSizeIndicator.buffer, metadataDataView.buffer].concat(buffers)) {
    const normalizeBuffer = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
    data.set(normalizeBuffer, offset)
    offset += buffer.byteLength
  }
  return data
}

export const split = (buffer: Uint8Array) => {
  const dataView = new DataView(buffer instanceof Uint8Array ? buffer.buffer : buffer)
  const metadataSizeIndicator = dataView.getUint16(0)
  const metadataBuffer = buffer.slice(2, 2 + metadataSizeIndicator)
  const metadataDataView = new DataView(metadataBuffer.buffer)

  const output: Uint8Array[] = []
  let bodyByteLengthOffset = 0
  for (let i = 0; i < metadataBuffer.byteLength / Int32ByteLength; i++) {
    const bodyByteLength = metadataDataView.getInt32(i * Int32ByteLength)
    const start = 2 + metadataSizeIndicator + bodyByteLengthOffset
    const end = start + bodyByteLength
    const res = buffer.slice(start, end)
    bodyByteLengthOffset += bodyByteLength
    output.push(res)
  }

  return output
}
