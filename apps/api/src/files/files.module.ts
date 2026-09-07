import { Global, Module } from '@nestjs/common';
import { StorageConfig } from '../common/config.service';
import { AssetsController } from './assets.controller';
import { FilesService } from './files.service';

@Global()
@Module({
  controllers: [AssetsController],
  providers: [FilesService, StorageConfig],
  exports: [FilesService, StorageConfig],
})
export class FilesModule {}
