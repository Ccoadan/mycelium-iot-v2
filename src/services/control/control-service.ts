import type { ControlState, RelayKey } from '../../models/index.js';
import type { ControlRepository } from '../../repositories/control-repository.js';
import type { AuditService } from '../audit/audit-service.js';
import type { AuthenticatedUser } from '../auth/auth-service.js';

export class ControlPermissionError extends Error {}
export class ControlStateNotFoundError extends Error {}

export interface ControlView {
  relays: ControlState['relays'];
  lightingSource: ControlState['lightingSource'];
  updatedAt: string;
  updatedBy: string;
  actor: Pick<AuthenticatedUser, 'username' | 'role'> | null;
  permissions: { canModify: boolean };
}

export interface ControlUpdateResult {
  changed: boolean;
  control: ControlView;
}

export class ControlService {
  public constructor(
    private readonly controls: ControlRepository,
    private readonly audit: AuditService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getControl(actor: AuthenticatedUser | null): Promise<ControlView> {
    const state = await this.controls.getState();
    if (!state) {
      throw new ControlStateNotFoundError('No existe el estado de control inicial');
    }
    return toView(state, actor);
  }

  public async setRelay(
    relayKey: RelayKey,
    enabled: boolean,
    actor: AuthenticatedUser | null,
  ): Promise<ControlUpdateResult> {
    if (!actor || actor.role !== 'admin') {
      throw new ControlPermissionError('Solo un administrador puede modificar los relés');
    }

    const previousState = await this.controls.getState();
    if (!previousState) {
      throw new ControlStateNotFoundError('No existe el estado de control inicial');
    }
    const previousRelay = previousState.relays.find(({ key }) => key === relayKey);
    if (!previousRelay) {
      throw new ControlStateNotFoundError(`No existe ${relayKey} en el estado de control`);
    }
    if (previousRelay.enabled === enabled) {
      return { changed: false, control: toView(previousState, actor) };
    }

    const timestamp = this.now();
    const updatedState = await this.controls.updateRelay({
      relay: relayKey,
      enabled,
      updatedAt: timestamp,
      updatedBy: actor.username,
    });
    if (!updatedState) {
      throw new ControlStateNotFoundError(`No se pudo actualizar ${relayKey}`);
    }

    await this.audit.register({
      user: actor,
      action: 'control.relay_changed',
      entity: 'controlState',
      entityId: 'current',
      details: {
        relay: relayKey,
        name: previousRelay.name,
        previousEnabled: previousRelay.enabled,
        enabled,
        source: 'dashboard',
      },
      timestamp,
    });

    return { changed: true, control: toView(updatedState, actor) };
  }
}

function toView(state: ControlState, actor: AuthenticatedUser | null): ControlView {
  return {
    relays: state.relays,
    lightingSource: state.lightingSource,
    updatedAt: state.updatedAt.toISOString(),
    updatedBy: state.updatedBy,
    actor: actor ? { username: actor.username, role: actor.role } : null,
    permissions: { canModify: actor?.role === 'admin' },
  };
}
