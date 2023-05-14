import {TransferManager, BroadcastArgs, BroadcastHandler, RequestProgressHandler, ResponseProgressHandler} from "../transfer-manager";
import { revertFromBuffer, convertToBuffer } from "../../shared/buffer-utils";
import {Emitter} from "../../shared/emitter";

type Transferable = ArrayBuffer | object | string | number | boolean

type ConnectManagerModuleInvokeArgs = { event: string; data?: Transferable; targetClientId: string; onRequestProgress?: RequestProgressHandler; onResponseProgress?: ResponseProgressHandler}
type ConnectManagerModuleInvokeHandler = (args: ConnectManagerModuleInvokeArgs & { sourceClientId: string }) => any | Promise<Transferable|void>

type ConnectManagerModuleBroadcastArgs = { event: string; data?: Transferable; clientIds?: string[] }
type ConnectManagerModuleBroadcastHandler = (args: ConnectManagerModuleBroadcastArgs & { sourceClientId: string }) => any | Promise<void>

export class TransferManagerModule<E = string> extends Emitter<E> {
  readonly namespace: string
  readonly connectionManager: TransferManager
  constructor(args: {
    namespace: string
    transferManager: TransferManager
  }) {
    super()
    const { namespace, transferManager } = args
    this.namespace = namespace
    this.connectionManager = transferManager
  }

  async invoke(args: ConnectManagerModuleInvokeArgs) {
    const { data, event } = args
    // @ts-ignore
    const result = await this.connectionManager.invoke({
      ...args,
      ...(data === undefined ? {} : { data: convertToBuffer(data) } ),
      event: `${this.namespace}/${event}`,
    })
    return result instanceof ArrayBuffer ? revertFromBuffer(result) : result
  }

  setInvokeListener(event: string, handler: ConnectManagerModuleInvokeHandler, onRequestProgress?: RequestProgressHandler) {
    this.connectionManager.setInvokeListener(`${this.namespace}/${event}`, async (args) => {
      const data = args.data instanceof ArrayBuffer ? revertFromBuffer(args.data) : undefined
      const result = await handler({ ... args, data })
      return result === undefined || null ? result : convertToBuffer(result)
    }, onRequestProgress)
  }
  deleteInvokeListener(event: string) {
    this.connectionManager.deleteInvokeListener(`${this.namespace}/${event}`)
  }

  #broadcastHandlerMap = new Map<Function, Function>()

  broadcast(args: ConnectManagerModuleBroadcastArgs) {
    const { data, event, clientIds = Object.keys(this.connectionManager.connections) } = args
    // @ts-ignore
    return this.connectionManager.broadcast({
      clientIds,
      ...(data === undefined ? {} : { data: convertToBuffer(data) } ),
      event: `${this.namespace}/${event}`,
    })
  }
  addBroadcastListener(event: string, handler: ConnectManagerModuleBroadcastHandler) {
    const wrappedHandler = async (args: BroadcastArgs & { sourceClientId: string }) => {
      const { data, event } = args
      await handler({
        ...args,
        ...(data instanceof ArrayBuffer ? { data: revertFromBuffer(data) } : {}),
        event: `${this.namespace}/${event}`,
      })
    }
    this.#broadcastHandlerMap.set(handler, wrappedHandler)
    this.connectionManager.addBroadcastListener(`${this.namespace}/${event}`, wrappedHandler)
  }
  removeBroadcastListener(event: string, handler?: BroadcastHandler) {
    handler = this.#broadcastHandlerMap.get(handler) || handler
    this.connectionManager.removeBroadcastListener(event, handler)
  }
}
