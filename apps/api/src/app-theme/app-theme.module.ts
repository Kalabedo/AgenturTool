import { Module } from '@nestjs/common';
import { AppThemeController } from './app-theme.controller';

@Module({ controllers: [AppThemeController] })
export class AppThemeModule {}
