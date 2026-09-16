import { describe, expect, it } from 'vitest';
import { providerCodeForSource } from './managed-tv-source-manager';
import { normalizeChannelKey } from './tv-catalog-repository';

describe('managed TV source identity', () => {
  it('creates stable distinct provider codes for Admin source keys', () => {
    const primary = providerCodeForSource('luan9x');
    const backup = providerCodeForSource('backup-01');
    expect(primary).toMatch(/^IPTV_LUAN9X_/);
    expect(backup).toMatch(/^IPTV_BACKUP_01_/);
    expect(primary).not.toBe(backup);
    expect(providerCodeForSource('luan9x')).toBe(primary);
  });

  it('does not collapse non-Latin TV names into one canonical key', () => {
    expect(normalizeChannelKey('Союз')).not.toBe(normalizeChannelKey('Три Ангела'));
    expect(normalizeChannelKey('Հայ Կինո')).not.toBe(normalizeChannelKey('Քոմեդի'));
  });
});
