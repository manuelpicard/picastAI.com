import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket, type RawData } from 'ws';

export interface DeviceStreamOptions {
  path?: string;
  heartbeatIntervalMs?: number;
  handshakeTimeoutMs?: number;
  maxBufferedBytes?: number;
  verifyDevice: (deviceId: string, token: string) => boolean;
}

export interface DeviceStreamClient {
  readonly id: string;
  readonly deviceId: string;
  readonly socket: WebSocket;
  sendJson(payload: Record<string, unknown>): boolean;
  sendAudioChunk(chunk: Buffer, final?: boolean): boolean;
  closeRetryable(reason?: string): void;
}

const RETRYABLE_CLOSE_CODE = 1012; // Service Restart: client should reconnect.
const TRY_LATER_CLOSE_CODE = 1013; // Try Again Later: transient overload.
const INTERNAL_ERROR_CLOSE_CODE = 1011;

function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function bearerToken(request: IncomingMessage): string {
  const auth = headerValue(request, 'authorization');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function safeReason(reason: string): string {
  return reason.slice(0, 120).replace(/[\r\n]/g, ' ');
}

/**
 * WebSocket transport for authenticated Pi/device streams.
 *
 * Protocol:
 * - client connects to /v1/device/stream with Authorization and X-Device-ID;
 * - server sends stream.ready;
 * - application ping messages receive application pong messages;
 * - server may send audio.chunk messages as binary payloads with JSON metadata;
 * - close code 1012 or 1013 means the client should reconnect with backoff.
 *
 * The transport is deliberately independent from Brain/TTS. HTTP turn endpoints
 * remain the stable fallback until streaming generation is wired to this layer.
 */
export class DeviceStreamServer {
  private readonly wsServer: WebSocketServer;
  private readonly options: Required<Omit<DeviceStreamOptions, 'verifyDevice'>> & Pick<DeviceStreamOptions, 'verifyDevice'>;
  private readonly clients = new Map<string, DeviceStreamClient>();
  private heartbeatTimer?: NodeJS.Timeout;
  private shuttingDown = false;

  constructor(httpServer: HttpServer, options: DeviceStreamOptions) {
    this.options = {
      path: '/v1/device/stream',
      heartbeatIntervalMs: 30_000,
      handshakeTimeoutMs: 10_000,
      maxBufferedBytes: 512 * 1024,
      ...options,
    };
    this.wsServer = new WebSocketServer({
      server: httpServer,
      path: this.options.path,
      clientTracking: false,
      maxPayload: 64 * 1024,
      perMessageDeflate: false,
    });
    this.wsServer.on('connection', (socket, request) => this.handleConnection(socket, request));
    this.wsServer.on('error', (error) => console.error('[device-stream] WebSocket-Serverfehler:', error));
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.options.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
  }

  get clientCount(): number {
    return this.clients.size;
  }

  get clientsSnapshot(): Array<{ id: string; deviceId: string }> {
    return [...this.clients.values()].map((client) => ({ id: client.id, deviceId: client.deviceId }));
  }

  /** Send JSON to one device, returning false if no usable stream exists. */
  sendToDevice(deviceId: string, payload: Record<string, unknown>): boolean {
    const client = [...this.clients.values()].find((candidate) => candidate.deviceId === deviceId);
    return client ? client.sendJson(payload) : false;
  }

  /** Close all sessions with an explicit reconnectable service-restart code. */
  closeForRestart(reason = 'service_restart'): void {
    this.shuttingDown = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const client of this.clients.values()) client.closeRetryable(reason);
    this.wsServer.close();
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const deviceId = headerValue(request, 'x-device-id').trim();
    const token = bearerToken(request);
    if (!deviceId || !this.options.verifyDevice(deviceId, token)) {
      socket.close(1008, 'unauthorized');
      return;
    }

    const clientId = randomUUID();
    let closed = false;
    const handshakeTimer = setTimeout(() => {
      if (!closed && socket.readyState === WebSocket.OPEN) {
        socket.close(1008, 'handshake_timeout');
      }
    }, this.options.handshakeTimeoutMs);
    handshakeTimer.unref();

    const client: DeviceStreamClient = {
      id: clientId,
      deviceId,
      socket,
      sendJson: (payload) => this.sendJson(socket, payload),
      sendAudioChunk: (chunk, final = false) => this.sendAudioChunk(socket, chunk, final),
      closeRetryable: (reason = 'service_restart') => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(RETRYABLE_CLOSE_CODE, safeReason(reason));
        }
      },
    };

    // One active stream per physical device. Replacing an old connection avoids
    // duplicated playback after Wi-Fi reconnects.
    for (const existing of this.clients.values()) {
      if (existing.deviceId === deviceId && existing.id !== clientId) {
        existing.socket.close(TRY_LATER_CLOSE_CODE, 'replaced_by_new_connection');
      }
    }
    this.clients.set(clientId, client);

    socket.on('pong', () => {
      (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
    });
    socket.on('message', (data, isBinary) => {
      try {
        this.handleMessage(client, data, isBinary);
      } catch (error) {
        console.warn('[device-stream] Ungültige Nachricht:', error);
        if (socket.readyState === WebSocket.OPEN) socket.close(1003, 'invalid_message');
      }
    });
    socket.on('error', (error) => {
      console.warn(`[device-stream] Verbindung ${clientId} Fehler:`, error.message);
      // The close handler removes the session; no reconnect loop is spawned on
      // the server, so a dead device cannot create unbounded server timers.
    });
    socket.on('close', (code, reason) => {
      closed = true;
      clearTimeout(handshakeTimer);
      this.clients.delete(clientId);
      console.info(`[device-stream] ${deviceId} getrennt (${code}: ${reason.toString()})`);
    });

    socket.send(JSON.stringify({
      type: 'stream.ready',
      protocol: 1,
      connection_id: clientId,
      device_id: deviceId,
      heartbeat_interval_ms: this.options.heartbeatIntervalMs,
    }), (error) => {
      if (error) socket.close(INTERNAL_ERROR_CLOSE_CODE, 'handshake_failed');
    });
    clearTimeout(handshakeTimer);

    // Keep liveness on the socket without exposing it through the protocol.
    (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
  }

  private handleMessage(client: DeviceStreamClient, data: RawData, isBinary: boolean): void {
    if (isBinary) {
      // Audio input streaming is intentionally bounded. The current Pi client
      // uses the HTTP upload path; future streaming STT can consume these chunks.
      const binary = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(new Uint8Array(data as ArrayBuffer));
      if (binary.length > 64 * 1024) throw new Error('binary_chunk_too_large');
      client.sendJson({ type: 'stream.ack', bytes: binary.length });
      return;
    }
    const message = JSON.parse(data.toString()) as { type?: string; request_id?: string };
    if (message.type === 'ping') {
      client.sendJson({ type: 'pong', request_id: message.request_id || null, timestamp: Date.now() });
      return;
    }
    if (message.type === 'stream.close') {
      client.socket.close(1000, 'client_requested');
      return;
    }
    if (message.type !== 'stream.hello' && message.type !== 'ping') {
      client.sendJson({ type: 'stream.error', error: 'unsupported_message' });
    }
  }

  private sendJson(socket: WebSocket, payload: Record<string, unknown>): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > this.options.maxBufferedBytes) {
      socket.close(TRY_LATER_CLOSE_CODE, 'backpressure');
      return false;
    }
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.warn('[device-stream] JSON-Senden fehlgeschlagen:', error);
      socket.close(INTERNAL_ERROR_CLOSE_CODE, 'send_failed');
      return false;
    }
  }

  private sendAudioChunk(socket: WebSocket, chunk: Buffer, final = false): boolean {
    if (chunk.length > 64 * 1024) throw new Error('audio_chunk_too_large');
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount + chunk.length > this.options.maxBufferedBytes) {
      if (socket.readyState === WebSocket.OPEN) socket.close(TRY_LATER_CLOSE_CODE, 'backpressure');
      return false;
    }
    try {
      socket.send(chunk, { binary: true, fin: final });
      return true;
    } catch (error) {
      console.warn('[device-stream] Audio-Senden fehlgeschlagen:', error);
      socket.close(INTERNAL_ERROR_CLOSE_CODE, 'send_failed');
      return false;
    }
  }

  private heartbeat(): void {
    if (this.shuttingDown) return;
    for (const client of this.clients.values()) {
      const socket = client.socket as WebSocket & { isAlive?: boolean };
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }
}

export const DEVICE_STREAM_RETRYABLE_CLOSE_CODE = RETRYABLE_CLOSE_CODE;
export const DEVICE_STREAM_TRY_LATER_CLOSE_CODE = TRY_LATER_CLOSE_CODE;
