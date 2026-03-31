import { Module } from '@/types/module';
import { healthModule } from './health/module';
import { diskModule } from './disk/module';
import { processModule } from './processes/module';
import { terminalModule } from './terminal/module';
import { logsModule } from './logs/module';
import { metricsModule } from './metrics/module';
import { fileBrowserModule } from './file-browser/module';
import { dockerModule } from './docker/module';
import { guideModule } from './guide/module';
import { servicesModule } from './services/module';
import { aiAgentsModule } from './ai-agents/module';
import { networkModule } from './network/module';
import { updatesModule } from './updates/module';
import { cronsModule } from './crons/module';
import { portsModule } from './ports/module';
import { hardwareModule } from './hardware/module';
import { certificatesModule } from './certificates/module';
import { nginxModule } from './nginx/module';
import { securityModule } from './security/module';
import { memoryModule } from './memory/module';
import { usersModule } from './users/module';
import { endpointsModule } from './endpoints/module';
import { selfServiceModule } from './self-service/module';

// For now, we will manually register modules here.
// In the future, this could be a dynamic scan of the modules directory.
export const coreModules: Module[] = [
  healthModule,
  diskModule,
  processModule,
  terminalModule,
  logsModule,
  metricsModule,
  fileBrowserModule,
  dockerModule,
  guideModule,
  servicesModule,
  aiAgentsModule,
  networkModule,
  updatesModule,
  cronsModule,
  portsModule,
  hardwareModule,
  certificatesModule,
  nginxModule,
  securityModule,
  memoryModule,
  usersModule,
  endpointsModule,
  selfServiceModule,
];
