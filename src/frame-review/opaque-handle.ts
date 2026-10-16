// A handle the trusted desktop process issues for something the renderer may not see directly: a movie,
// a review session, an extraction destination. The renderer checks only its shape, never its prefix or
// meaning, so the desktop process can change how it makes handles without breaking the renderer.
export class OpaqueHandle {
  static parse(value: unknown, label: string): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(value)) {
      throw new Error(`The ${label} is invalid.`);
    }
    return value;
  }
}
