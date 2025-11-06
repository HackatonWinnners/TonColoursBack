import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

describe('GET /metadata/:itemIndex', () => {
  it('returns metadata JSON', async () => {
    const response = await request(app)
      .get('/metadata/1')
      .query({ color: 'ff0000', wallet: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', tg: '77' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('image');
  });

  it('validates color parameter', async () => {
    const response = await request(app)
      .get('/metadata/1')
      .query({ color: 'not-a-color' });

    expect(response.status).toBe(400);
  });
});
