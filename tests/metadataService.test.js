import { describe, expect, it } from 'vitest';
import { buildMetadata, buildMetadataUri } from '../src/services/metadataService.js';

describe('buildMetadata', () => {
  it('returns metadata with svg image', () => {
    const metadata = buildMetadata({
      itemIndex: 1,
      color: '#ABCDEF',
      walletAddress: 'EQ123',
      telegramUserId: 42,
      mintedAt: '2025-01-01T00:00:00.000Z',
    });

    expect(metadata.name).toContain('#ABCDEF');
    expect(metadata.image).toContain('/image/1?color=ABCDEF');
    expect(metadata.image_data).toBeTruthy();
    expect(metadata.image_data).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 pattern
    expect(metadata.attributes).toHaveLength(4);
  });
});

describe('buildMetadataUri', () => {
  it('builds url with params', () => {
    const url = buildMetadataUri({
      baseUrl: 'https://example.com',
      itemIndex: 3,
      color: '#123456',
      walletAddress: 'EQ123',
      telegramUserId: 99,
      mintedAt: '2025-01-01T00:00:00.000Z',
    });

    expect(url).toContain('/metadata/3');
    expect(url).toContain('color=123456');
    expect(url).toContain('wallet=EQ123');
    expect(url).toContain('tg=99');
    expect(url).toContain('mintedAt=2025-01-01T00%3A00%3A00.000Z');
  });
});
