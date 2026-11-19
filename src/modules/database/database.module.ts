import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { DB, DatabaseConnection, databaseProviders } from './provider/database.provider.js';

/** Logs which database is in use, and closes the connection when the app stops. */
@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger('Database');

  constructor(@Inject(DatabaseConnection) private readonly connection: DatabaseConnection) {
    this.logger.log(`Connected (${connection.driver})`);
  }

  async onApplicationShutdown() {
    await this.connection.close();
  }
}

/** Opens the database once and shares it with every module. */
@Global()
@Module({
  providers: [...databaseProviders, DatabaseLifecycle],
  exports: [DB, DatabaseConnection],
})
export class DatabaseModule {}
