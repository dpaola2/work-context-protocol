const encoder = new TextEncoder();
let clientCounter = 0;

export class SSEBroker {
  private clients = new Map<string, ReadableStreamDefaultController>();

  addClient(controller: ReadableStreamDefaultController): string {
    const id = String(++clientCounter);
    this.clients.set(id, controller);
    return id;
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  emit(event: string, data: object): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoded = encoder.encode(message);
    for (const [id, controller] of this.clients) {
      try {
        controller.enqueue(encoded);
      } catch {
        this.clients.delete(id);
      }
    }
  }
}
