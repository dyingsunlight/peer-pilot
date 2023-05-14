import {serve} from "https://deno.land/std@0.155.0/http/server.ts"
import { ClientManager, ClientManagerEvents } from "./client-manager.ts"

class RoomManager {
  #rooms: Record<string, ClientManager> = {}
  add(args: {
    roomId: string
    clientId: string
    websocket: WebSocket
  }) {
    const {
      roomId,
      clientId,
      websocket,
    } = args
    const rooms = this.#rooms
    if (!rooms[roomId]) {
      rooms[roomId]  = new ClientManager(roomId)
      const offClientManagerClose = rooms[roomId].on(ClientManagerEvents.Close, () => {
        delete rooms[roomId]
        offClientManagerClose()
      })
    }
    rooms[roomId].add(clientId, websocket)
  }
}

const manager = new RoomManager()
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
    manager.add({ clientId, roomId, websocket: socket })
    return response
  }
  return new Response("not_found", {status: 404})
}, { port: 8788 })
