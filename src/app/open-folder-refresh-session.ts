type OpenFolderRefreshSessionOptions = {
  readonly isActiveFolder: (folderPath: string) => boolean;
  readonly hasUnsavedActiveSequenceChanges: () => boolean;
  readonly refreshActiveFolder: () => Promise<void>;
  readonly onRefreshError: (error: unknown) => void;
};

export class OpenFolderRefreshSession {
  private pendingFolderPath: string | null = null;

  constructor(private readonly options: OpenFolderRefreshSessionOptions) {}

  async onFolderContentsPublished(folderPath: string): Promise<void> {
    if (!this.options.isActiveFolder(folderPath)) return;
    if (this.options.hasUnsavedActiveSequenceChanges()) {
      this.pendingFolderPath = folderPath;
      return;
    }
    await this.refreshActiveFolder();
  }

  async afterCollectionSaved(): Promise<void> {
    const folderPath = this.pendingFolderPath;
    if (!folderPath || !this.options.isActiveFolder(folderPath)) {
      this.pendingFolderPath = null;
      return;
    }
    if (this.options.hasUnsavedActiveSequenceChanges()) return;
    this.pendingFolderPath = null;
    await this.refreshActiveFolder();
  }

  private async refreshActiveFolder(): Promise<void> {
    try {
      await this.options.refreshActiveFolder();
    } catch (error) {
      this.options.onRefreshError(error);
    }
  }
}
