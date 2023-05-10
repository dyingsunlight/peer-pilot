import {serve} from "https://deno.land/std@0.155.0/http/server.ts"
import {decode, encode, SocketEvents} from "../shared/event.ts"

const decoder = new TextDecoder

class ClientManager {
  #connections: Record<string, {
    channel: BroadcastChannel
    clients: Record<string, WebSocket>
  }> = {}

  #checkAndSend(websocket: WebSocket, data: ArrayBuffer) {
    if (websocket.readyState === 1) {
      websocket.send(data)
    }
  }

  addClient(args: {
    roomId: string
    clientId: string
    socket: WebSocket
  }) {
    const {
      roomId,
      clientId,
      socket,
    } = args
    const connections = this.#connections
    if (!connections[roomId]) {
      const channel = new BroadcastChannel(roomId)
      channel.addEventListener('message', (e) => {
        const data = e.data
        if (data instanceof ArrayBuffer) {
          const {event, responseToken, rawBody} = decode(data)
          switch (event) {
            case SocketEvents.ListClients: {
              const clients = Object.keys(connections[roomId]?.clients)
              // Reply current instance clients
              channel.postMessage(encode(SocketEvents.Response, responseToken, clients))
            }
            case SocketEvents.ClientMessage: {
              const {targetClientId, messages} = JSON.parse(decoder.decode(rawBody))
              const targetWebsocket = connections[roomId]?.clients[targetClientId]
              if (targetWebsocket) {
                this.#checkAndSend(targetWebsocket, encode(SocketEvents.ServerMessage, new Uint8Array([0, 0]), messages))
                // Reply succeed
                channel.postMessage(encode(SocketEvents.Response, responseToken))
              }
            }
            default: {
              console.error('Error Undefined Event type.')
            }
          }
        }
      })
      connections[roomId] = {
        channel,
        clients: {}
      }
    }
    const onClientMessage = async (e: MessageEvent) => {
      const data = e.data
      if (data instanceof ArrayBuffer) {
        const currentChannel = connections[roomId].channel
        const {event, responseToken, rawBody} = decode(data)
        switch (event) {
          case SocketEvents.ListClients: {
            const token = new Uint8Array([Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)])
            const clients = Object.keys(connections[roomId].clients)
            const waitForInstanceResponse = (e: MessageEvent) => {
              const data = e.data
              if (data instanceof ArrayBuffer) {
                const {event, responseToken, rawBody} = decode(data)
                if (event === SocketEvents.Response && responseToken[0] === token[0] && responseToken[1] === token[1]) {
                  clients.push(...JSON.parse(decoder.decode(rawBody)))
                }
              }
            }
            currentChannel.addEventListener('message', waitForInstanceResponse)
            currentChannel.postMessage(encode(SocketEvents.ListClients, token))
            await new Promise(resolve => setTimeout(resolve, 1000))
            currentChannel.removeEventListener('message', waitForInstanceResponse)
            this.#checkAndSend(socket, encode(SocketEvents.Response, responseToken, clients.map(clientId => ({clientId}))))
          }
            break
          case SocketEvents.ClientMessage: {
            const {targetClientId, payload} = JSON.parse(decoder.decode(rawBody))
            const targetWebsocket = connections[roomId]?.clients[targetClientId]
            if (targetWebsocket) {
              this.#checkAndSend(targetWebsocket, encode(SocketEvents.ServerMessage, new Uint8Array([0, 0]), [
                {
                  sourceClientId: clientId,
                  payload
                }
              ]))
            } else {
              const token = new Uint8Array([Math.floor(Math.random() * 255), Math.floor(Math.random() * 255)])
              let resolver: (() => void) | null = null
              const waitForInstanceResponse = (e: MessageEvent) => {
                const data = e.data
                if (data instanceof ArrayBuffer) {
                  const {event, responseToken} = decode(data)
                  if (event === SocketEvents.Response && responseToken[0] === token[0] && responseToken[1] === token[1]) {
                    resolver?.()
                    resolver = null
                  }
                }
              }
              currentChannel.addEventListener('message', waitForInstanceResponse)
              const race = Promise.race([
                new Promise(resolve => setTimeout(resolve, 3000)).then(() => false),
                new Promise(resolve => resolver = resolve).then(() => true)
              ]).finally(() => {
                currentChannel.removeEventListener('message', waitForInstanceResponse)
              })
              currentChannel.postMessage(encode(SocketEvents.ListClients, token, {
                targetClientId,
                messages: [
                  {
                    sourceClientId: clientId,
                    payload
                  }
                ]
              }))
              const isSucceed = await race
              if (!isSucceed) {
                console.log("failed to broadcast message to client." + clientId)
              }
            }
          }
            break
          default: {
            console.error('Error Undefined Event type.')
          }
        }
      }
    }
    const onClientClosed = () => {
      if (connections[roomId]?.[clientId]) {
        delete connections[roomId][clientId]
      }
      if (!Object.keys(connections[roomId])) {
        delete connections[roomId]
      }
      socket.removeEventListener('error', onClientClosed)
      socket.removeEventListener('close', onClientClosed)
      socket.removeEventListener('message', onClientMessage)
    }
    socket.addEventListener('close', onClientClosed)
    socket.addEventListener('error', onClientClosed)
    socket.addEventListener('message', onClientMessage)
    connections[roomId].clients[clientId] = socket
  }
}

const manager = new ClientManager()
serve((req: Request) => {
  const url = new URL(req.url)
  if (/^\/api\/websocket\/?$/.test(url.pathname)) {
    const upgrade = req.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() != "websocket") {
      return new Response("request isn't trying to upgrade to websocket.");
    }
    const {socket, response} = Deno.upgradeWebSocket(req)
    const roomId = url.searchParams.get('roomId')
    const clientId = url.searchParams.get('clientId')
    if (!clientId || !roomId) {
      return new Response("not_found", {status: 403})
    }
    manager.addClient({clientId, roomId, socket})
    return response
  }
  return new Response("not_found", {status: 404})
}, { port: 8788 })
