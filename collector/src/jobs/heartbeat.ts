import { Job } from './base.js';
import { writeStagingFile } from '../staging.js';

export const heartbeatJob: Job = {
  name: 'heartbeat',

  async run(stagingDir: string) {
    const data = {
      timestamp: new Date().toISOString(),
      status: 'ok',
    };

    writeStagingFile(stagingDir, 'heartbeat.json', data);
    console.log(`Wrote heartbeat to staging.`);
    return { files: ['heartbeat.json'], records: 1 };
  },
};
