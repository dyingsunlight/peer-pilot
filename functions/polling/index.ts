import {R2Bucket, EventContext} from '@cloudflare/workers-types'

const toClientsKey = (roomId: string, clinetId?: string) => `room/${roomId}/clients/${clinetId || ""}`
const toMessageKey = (roomId: string, targetClientId: string, isPrefixOnly?: boolean) =>
  `room/${roomId}/message/${targetClientId}${isPrefixOnly ?  "" : "/" + Math.random().toString(36).substring(2, 15) }`

interface PollingResponse {
  members: {
    clientId: string
  }[]
  messages: {
    sourceClientId: string
    data: string
  }[]
}

export const onRequestGet = async (ctx: EventContext<any, any,  Record<string, unknown>>) => {
  const { request, env } = ctx
  const url = new URL(request.url)
  const roomId = url.searchParams.get('roomId')
  const clientId = url.searchParams.get('clientId')
  const secret = url.searchParams.get('secret')

  if (!clientId || !roomId || !secret) {
    return new Response("Invalid arguments", {
      status: 400,
    })
  }

  const r2 = env.peerPilotR2 as R2Bucket
  const clientInfo = await r2.head(toClientsKey(roomId, clientId))

  if (clientInfo && clientInfo.customMetadata.secret !== secret) {
    return new Response("Secret mismatched", {
      status: 403,
    })
  }

  await r2.put(toClientsKey(roomId, clientId), "", {
    customMetadata: {
      secret,
      lastVisited: new Date().toISOString()
    }
  })

  const clients = await r2.list({ prefix: toClientsKey(roomId)})
  const messages = await r2.list({ prefix: toMessageKey(roomId, clientId, true) })
  await Promise.all(
    messages.objects.map(obj => new Promise<void>(async (resolve) => {
      await r2.delete(obj.key)
      resolve()
    }))
  )
  return new Response(JSON.stringify({
    clients: clients,
    messages
  }), {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

interface PollingRequestBody {
  messages: {
    targetClientId: string
    type: 'user' | 'spd-offer' | 'spd-answer' | 'ice-candidates'
    data: string
  }[]
}

export const onRequestPost = async (ctx: EventContext<any, any,  Record<string, unknown>>) => {
  const { request, env } = ctx
  const url = new URL(request.url)
  const roomId = url.searchParams.get('roomId')
  const clientId = url.searchParams.get('clientId')
  const secret = url.searchParams.get('secret')

  if (!clientId || !roomId || !secret) {
    return new Response("Invalid arguments", {
      status: 400,
    })
  }

  const r2 = env.peerPilotR2 as R2Bucket

  const clientInfo = await r2.head(toClientsKey(roomId, clientId))

  if (clientInfo && clientInfo.customMetadata.secret !== secret) {
    return new Response("Secret mismatched", {
      status: 403,
    })
  }

  const body = await request.json() as PollingRequestBody
  for (const message of body.messages) {
    await r2.put(toMessageKey(roomId, message.targetClientId), message.data)
  }
  return new Response("OK", {
    status: 200
  })
}
