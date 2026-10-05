import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma:PrismaService) {}
  @Get()
  async status() {
    const redis=new Redis(process.env.REDIS_URL||'redis://localhost:6379',{lazyConnect:true,connectTimeout:3000,maxRetriesPerRequest:0,retryStrategy:()=>null});
    redis.on('error',()=>{});
    const s3=new S3Client({endpoint:process.env.S3_ENDPOINT||'http://localhost:9000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY||'i7ai',secretAccessKey:process.env.S3_SECRET_KEY||'i7ai_dev_minio'}});
    const result=await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`,redis.connect().then(()=>redis.ping()),s3.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET||'i7ai-documents'}),{abortSignal:AbortSignal.timeout(3000)})]);
    redis.disconnect();s3.destroy();
    const dependencies={database:result[0].status==='fulfilled',queue:result[1].status==='fulfilled',storage:result[2].status==='fulfilled'};
    if(result.some(item=>item.status==='rejected'))throw new ServiceUnavailableException({status:'degraded',dependencies});
    return {
      service: 'i7ai-api',
      status: 'ok',
      dependencies,
      timestamp: new Date().toISOString(),
    };
  }
}
