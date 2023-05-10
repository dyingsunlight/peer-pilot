export enum SocketEvents {
  Response = 0,
  ClientMessage = 1,
  ListClients = 2,
  ServerMessage = 3,
}

const join = (...buffers: (ArrayBuffer|Uint8Array)[]) => {
  const result = new Uint8Array(buffers.reduce((length, buffer) => length + buffer.byteLength, 0))
  buffers.reduce((offset, buffer) => {
    const normalizeBuffer = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
    result.set(normalizeBuffer, offset)
    return offset + normalizeBuffer.byteLength
  }, 0)
  return result
}

export const decode = (incomingData: ArrayBuffer) => {
  const uint8Array = new Uint8Array(incomingData)
  return {
    event: uint8Array[0],
    responseToken: uint8Array.slice(1, 3),
    rawBody: uint8Array.slice(3).buffer,
  }
}

const textEncoder = new TextEncoder()
export const encode = (event: SocketEvents, responseToken: Uint8Array, payload: ArrayBuffer|Uint8Array|object = new ArrayBuffer(0)) => {
  if (payload && !(payload instanceof ArrayBuffer) && !(payload instanceof Uint8Array)) {
    payload = textEncoder.encode(JSON.stringify(payload))
  }
  return join(new Uint8Array([event, ...responseToken]), payload as ArrayBuffer)
}

