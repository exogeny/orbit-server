import { createDecorator, refineServiceDecorator } from 'orbit/platform/instantiation/instantiation';

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');
export const INativeEnvironmentService = refineServiceDecorator<
  IEnvironmentService, INativeEnvironmentService>(IEnvironmentService);

export interface IDebugParameters {
  port: number | null;
  break: boolean;
}

/**
 * A basic environment service that can be used in various processes,
 * such as main, renderer and shared process. Use subclasses of this
 * service for specific environment.
 */
export interface IEnvironmentService {

  readonly _serviceBrand: undefined;

  // --- logging
  logsPath: string;
  logLevel?: string;
  verbose: boolean;
  isBuilt: boolean;
}

/**
 * A subclass of the `IEnvironmentService` to be used only in native
 * environments (Windows, Linux, macOS) but not e.g. web.
 */
export interface INativeEnvironmentService extends IEnvironmentService {
}