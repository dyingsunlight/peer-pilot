import {EventContext, R2Bucket, ServiceWorkerGlobalScope} from '@cloudflare/workers-types'
import {decode, encode, SocketEvents} from '../../shared/event'

const toClientsKey = (roomId: string, clientId?: string) => `room/${roomId}/clients/${clientId || ""}`
const toMessageKey = (roomId: string, targetClientId: string, isPrefixOnly?: boolean) =>
  `room/${roomId}/message/${targetClientId}${isPrefixOnly ?  "" : "/" + Math.random().toString(36).substring(2, 15) }`

interface Env {
  peerPilotR2: R2Bucket
}

export const onRequest = async (ctx: EventContext<Env, any,  Record<string, unknown>>) => {
  const { request, env } = ctx
  const url = new URL(request.url)
  const clientSecret = url.searchParams.get('clientSecret');
  const roomId = url.searchParams.get('roomId')
  const clientId = url.searchParams.get('clientId')
  if (!clientId || !roomId || !clientSecret) {
    return new Response("missing_arguments", {
      status: 400,
    })
  }

  const r2 = env.peerPilotR2
  const clientInfo = await r2.head(toClientsKey(roomId, clientId))
  if (clientInfo && clientInfo.customMetadata.clientSecret !== clientSecret) {
    return new Response("authentication_mismatched", {
      status: 403,
    })
  }


  const upgradeHeader = request.headers.get('Upgrade')
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 })
  }
  const webSocketPair = new WebSocketPair() as ServiceWorkerGlobalScope['WebSocketPair']
  const [client, server] = Object.values(webSocketPair)

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  server.accept()
  server.addEventListener('message', async e => {
    if (!(e.data instanceof ArrayBuffer)) {
      server.send("Error")
      return
    }
    const { event, responseToken, rawBody} = decode(e.data)


    if (event === SocketEvents.ClientMessage) {
      const {targetClientId, payload} = JSON.parse(decoder.decode(rawBody))
      await r2.put(toMessageKey(roomId, targetClientId), "", {
        customMetadata: {
          sourceClientId: clientId,
          payload
        }
      })
      server.send(
        encode(SocketEvents.Response, responseToken, encoder.encode(`{ "status": 200 }`))
      )
    }


    if (event === SocketEvents.ListClients) {
      // @ts-ignore
      const clients = await r2.list({
        prefix: toClientsKey(roomId),
        include: ['customMetadata'],
      })
      const data = clients.objects
        .filter(client => {
          return (Date.now() - Number(client.customMetadata.lastVisit)) < 6000
        })
        .map(client => {
          return {
          clientId: client.customMetadata.clientId
        }
      })
      server.send(
        encode(SocketEvents.Response, responseToken, encoder.encode(JSON.stringify(data)))
      )
    }
  })
  let isWebSocketDisconnected = false
  server.addEventListener('close', () => {
    isWebSocketDisconnected = true
  })
  const polling = async () => {
    while (true) {
      if (isWebSocketDisconnected) {
        return
      }
      // @ts-ignore
      const messages = await r2.list({
        prefix: toMessageKey(roomId, clientId, true),
        include: ['customMetadata'],
      })
      await r2.put(toClientsKey(roomId, clientId), "", {
        customMetadata: {
          lastVisit: String(Date.now()),
          clientId,
          clientSecret
        }
      })
      await Promise.all(
        messages.objects.map(obj => new Promise<void>(async (resolve) => {
          await r2.delete(obj.key)
          resolve()
        }))
      )
      if (messages.objects.length) {
        const result = messages.objects.map(item => {
          return {
            sourceClientId: item.customMetadata.sourceClientId,
            payload: item.customMetadata.payload
          }
        })
        server.send(
          encode(SocketEvents.ServerMessage, new Uint8Array([0, 0]), encoder.encode(JSON.stringify(result)))
        )
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  polling()
  await r2.put(toClientsKey(roomId, clientId), "", {
    customMetadata: {
      lastVisit: String(Date.now()),
      clientId,
      clientSecret
    }
  })
  return new Response(null, {
    status: 101,
    webSocket: client,
  })
}
