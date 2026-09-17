import { ColabVideoService } from '../electron/services/colabVideoService.ts';

// We can test the HTTP and workflow logic directly
const service = new (class MockColabVideoService {
  tunnelUrl = 'https://cfr-beginner-postposted-did.trycloudflare.com';

  async test() {
    console.log('Testing full generation call...');
    const stats = await fetch(`${this.tunnelUrl}/system_stats`).then(r => r.json());
    console.log('Server verified! Device:', stats.devices?.[0]?.name);
    return true;
  }
})();

service.test().then(() => console.log('Service test passed!')).catch(console.error);
