import {EventContext} from '@cloudflare/workers-types'

export const onRequest = async (ctx: EventContext<never, any,  Record<string, unknown>>) => {
  const { request } = ctx
  const upgradeHeader = request.headers.get('Upgrade');
  console.log("upgradeHeader", upgradeHeader)
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept()
  server.addEventListener('message', event => {
    console.log(event.data);
  });

  setInterval(() => {
    server.send("Hey")
  }, 1000)

  return new Response(null, {
    status: 101,
    webSocket: client,
  })
}
