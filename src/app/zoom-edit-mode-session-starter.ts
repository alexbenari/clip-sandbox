import { ZoomEditModeSession, type IZoomEditModeRequest } from './zoom-edit-mode-session.js';

type ZoomEditModeSessionDependencies = Parameters<typeof ZoomEditModeSession.begin>[0];

export class ZoomEditModeSessionStarter {
  constructor(private readonly deps: ZoomEditModeSessionDependencies) {}

  begin(request: IZoomEditModeRequest): ZoomEditModeSession {
    return ZoomEditModeSession.begin(this.deps, request);
  }
}
