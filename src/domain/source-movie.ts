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
    const stem = extensionStart > 0 ? fileName.slice(0, extensionStart).trim() : '';
    return new SourceMovie(fileName, stem || fileName);
  }
}
