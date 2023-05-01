<script lang="ts" setup>
import { onMounted } from 'vue'
async function websocket(url) {
  // Make a fetch request including `Upgrade: websocket` header.
  // The Workers Runtime will automatically handle other requirements
  // of the WebSocket protocol, like the Sec-WebSocket-Key header.
  let resp = await fetch(url, {
    headers: {
      Upgrade: 'websocket',
    },
  });

  // If the WebSocket handshake completed successfully, then the
  // response has a `webSocket` property.
  let ws = resp.webSocket;
  if (!ws) {
    throw new Error("server didn't accept WebSocket");
  }

  // Call accept() to indicate that you'll be handling the socket here
  // in JavaScript, as opposed to returning it on to a client.
  ws.accept();

  // Now you can send and receive messages like before.
  ws.send('hello');
  ws.addEventListener('message', msg => {
    console.log(msg.data);
  });
}
onMounted(async () => {
  const websocket = new WebSocket(`wss://${window.location.host}/api/websocket`);
  websocket.addEventListener('message', event => {
    console.log('Message received from server');
    console.log(event.data);
  });
  setInterval(() => {
    websocket.send("client meesage")

  }, 2000)
})
</script>
<template>
  <div>
    Hello World!
  </div>
</template>
