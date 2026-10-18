import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 }) });
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
