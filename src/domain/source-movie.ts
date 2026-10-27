export class SourceMovie {
  private constructor(
    readonly fileName: string,
    readonly name: string,
  ) {
    Object.freeze(this);
  }

  static fromFileName(fileName: string): SourceMovie {
    if (!fileName || /[\\/]/.test(fileName)) throw new Error('Source movie file name is invalid.');
    const extensionStart = fileName.lastIndexOf('.');
    return new SourceMovie(fileName, extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName);
  }
}
