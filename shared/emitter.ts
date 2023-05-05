export class Emitter<Event = string> {
  private handlers: Map<Event, Set<(...args: any[]) => any>> = new Map()

  on(event: Event, handler: (...args: any[]) => any) {
    const eventSet = (this.handlers.get(event) || new Set()).add(handler)
    this.handlers.set(event, eventSet)
    return () => {
      eventSet.delete(handler)
    }
  }

  dispatch(event: Event, ...payload: any[]) {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(...payload)
      } catch (err) {
        console.error(err)
      }
    })
  }

  off(event: Event, handler: (...args: any[]) => any) {
    this.handlers.get(event)?.delete(handler)
  }
}
