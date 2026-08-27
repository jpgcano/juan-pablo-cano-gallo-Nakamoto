import { NotFoundError } from '../../../shared/errors/AppError.js';
import type { UnitOfWork } from '../../../shared/postgres/UnitOfWork.js';
import type { IdentityRepository, Locale, UserProfile } from '../domain/ports.js';

export class GetMeUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: IdentityRepository) {}

  async execute(userId: string): Promise<UserProfile> {
    return this.uow.runAs(userId, async (client) => {
      const profile = await this.repository.findProfileById(client, userId);
      if (!profile) throw new NotFoundError('Usuario no encontrado');
      return profile;
    });
  }
}

export class UpdateProfileUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: IdentityRepository) {}

  async execute(
    userId: string,
    input: { fullName?: string; jobTitle?: string; locale?: Locale },
  ): Promise<UserProfile> {
    return this.uow.runAs(userId, async (client) => {
      // rw_sp_update_user exige que el actor solo edite su propio perfil
      // (ver database/migrations/identity/100_procedures.sql); userId aqui
      // sale del token, nunca del cuerpo de la peticion.
      await this.repository.updateProfile(client, {
        userId,
        fullName: input.fullName ?? null,
        jobTitle: input.jobTitle ?? null,
        locale: input.locale ?? null,
      });

      const profile = await this.repository.findProfileById(client, userId);
      if (!profile) throw new NotFoundError('Usuario no encontrado');
      return profile;
    });
  }
}

export class DeactivateAccountUseCase {
  constructor(private readonly uow: UnitOfWork, private readonly repository: IdentityRepository) {}

  async execute(userId: string): Promise<void> {
    await this.uow.runAs(userId, async (client) => {
      // El procedimiento tambien revoca todos los refresh tokens vigentes
      // del usuario, en la misma transaccion (ver 100_procedures.sql).
      await this.repository.deactivate(client, userId);
    });
  }
}
