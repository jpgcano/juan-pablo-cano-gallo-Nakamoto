import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { buildApp, type BuiltApp } from '../src/main/app.js';

const SEED_PASSWORD = 'RiwiDev#2026';

describe('seguridad de WebSocket de punta a punta', () => {
  let built: BuiltApp;
  let app: FastifyInstance;
  let io: SocketIOServer;
  let baseUrl: string;
  const clients: Socket[] = [];

  async function login(email: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: SEED_PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { accessToken: string }).accessToken;
  }

  async function connect(token: string): Promise<Socket> {
    const client = createClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      timeout: 2_000,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', reject);
    });
    return client;
  }

  beforeAll(async () => {
    built = await buildApp();
    app = built.app;
    await app.listen({ port: 0, host: '127.0.0.1' });

    io = new SocketIOServer(app.server, { transports: ['websocket'] });
    built.messaging.registerSocket(io, built.identity.verifyAccessToken);
    await built.messaging.startRealtime();

    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No se pudo resolver el puerto de prueba');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const client of clients) client.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await built.messaging.stopRealtime();
    await app.close();
  });

  it('rechaza la conexión sin un JWT válido', async () => {
    const client = createClient(baseUrl, { auth: {}, transports: ['websocket'], timeout: 2_000 });
    clients.push(client);

    await expect(
      new Promise<void>((resolve, reject) => {
        client.once('connect', () => reject(new Error('La conexión sin token fue aceptada')));
        client.once('connect_error', () => resolve());
      }),
    ).resolves.toBeUndefined();
  });

  it('permite unirse a un canal del que el usuario es miembro', async () => {
    const token = await login('ana.rios@riwi.io');
    const channelsResponse = await app.inject({ method: 'GET', url: '/api/v1/channels', headers: { authorization: `Bearer ${token}` } });
    const general = (channelsResponse.json() as Array<{ channelId: string; slug: string }>).find(
      (channel) => channel.slug === 'general',
    );
    expect(general).toBeDefined();

    const client = await connect(token);
    const joined = await new Promise<boolean>((resolve) => client.emit('channel:join', general!.channelId, resolve));
    expect(joined).toBe(true);

    const event = new Promise<{ channelId: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No se recibió message:new')), 2_000);
      client.once('message:new', (payload: { channelId: string }) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    const messageResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${general!.channelId}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { body: `evento realtime ${randomUUID()}` },
    });
    expect(messageResponse.statusCode).toBe(201);
    expect((await event).channelId).toBe(general!.channelId);
  });

  it('rechaza unirse a un canal privado ajeno aunque el JWT sea válido', async () => {
    const jorgeToken = await login('jorge.salazar@riwi.io');
    const channelsResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/channels',
      headers: { authorization: `Bearer ${jorgeToken}` },
    });
    const junta = (channelsResponse.json() as Array<{ channelId: string; slug: string }>).find(
      (channel) => channel.slug === 'junta-directiva',
    );
    expect(junta).toBeDefined();

    const anaToken = await login('ana.rios@riwi.io');
    const client = await connect(anaToken);
    const joined = await new Promise<boolean>((resolve) => client.emit('channel:join', junta!.channelId, resolve));
    expect(joined).toBe(false);
  });
});
