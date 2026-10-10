export class DocumentElements {
  constructor(private readonly doc: Document) {}

  required<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.doc.getElementById(id);
    if (!element) throw new Error(`Required element #${id} was not found.`);
    return element as T;
  }

  optional<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }
}
