import { Module } from '@nestjs/common';
import { SmallBusinessController } from './small-business.controller';
import { SmallBusinessService } from './small-business.service';

@Module({
  controllers: [SmallBusinessController],
  providers: [SmallBusinessService],
  // Das Finalisieren fragt vor dem Ausstellen nach der Grenze.
  exports: [SmallBusinessService],
})
export class SmallBusinessModule {}
