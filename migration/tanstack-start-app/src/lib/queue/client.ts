// @ts-nocheck
/**
 * BullMQ queue client — shared between API routes and workers.
 *
 * Falls back gracefully when Redis is not configured (development).
 * Set REDIS_URL in .env.local to enable (e.g. redis://localhost:6379
 * or an Upstash Redis URL: rediss://...@....upstash.io:6379).
 */
import { Queue, Worker, QueueEvents, type Job } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

// ── Connection singleton ──────────────────────────────────────────────────────
let _connection: IORedis | null = null;

function getConnection(): IORedis | null {
  if (!REDIS_URL) return null;
  if (_connection) return _connection;

  _connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  _connection.on("error", (err) => {
    console.error("[Redis] connection error:", err.message);
  });

  return _connection;
}

// ── Queue names ───────────────────────────────────────────────────────────────
export const QUEUES = {
  deploy: "lifemarkai:deploy",
  build: "lifemarkai:build",
  notification: "lifemarkai:notification",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ── Job payloads ──────────────────────────────────────────────────────────────
export interface DeployJobPayload {
  projectId: string;
  userId: string;
  deploymentId: string;
  provider: "netlify" | "vercel" | "lifemarkai";
  /**
   * Optional — the worker re-fetches authoritative files from the DB by
   * projectId. Omitting this keeps the Redis job payload small (full project
   * source can be large) and avoids stale snapshots.
   */
  files?: Array<{ path: string; content: string }>;
  projectName: string;
  badgeHidden?: boolean;
}

export interface BuildJobPayload {
  projectId: string;
  userId: string;
  prompt: string;
  mode: "chat" | "build" | "plan" | "agent";
  model: string;
}

export interface NotificationJobPayload {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

// ── Queue factory ─────────────────────────────────────────────────────────────
export function createQueue(name: QueueName): Queue | null {
  const connection = getConnection();
  if (!connection) return null;

  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}

// ── Singletons for each queue ────────────────────────────────────────────────
let _deployQueue: Queue | null | undefined;
let _notificationQueue: Queue | null | undefined;

export function getDeployQueue(): Queue | null {
  if (_deployQueue === undefined) _deployQueue = createQueue(QUEUES.deploy);
  return _deployQueue;
}

export function getNotificationQueue(): Queue | null {
  if (_notificationQueue === undefined) _notificationQueue = createQueue(QUEUES.notification);
  return _notificationQueue;
}

// ── Helper: enqueue a deploy job ─────────────────────────────────────────────
export async function enqueueDeployJob(payload: DeployJobPayload): Promise<string | null> {
  const queue = getDeployQueue();
  if (!queue) {
    console.warn("[Queue] Redis not configured — running deploy synchronously");
    return null;
  }

  const job = await queue.add("deploy", payload, {
    jobId: `deploy:${payload.deploymentId}`,
    priority: 5,
  });

  return job.id ?? null;
}

// ── Helper: enqueue a notification ───────────────────────────────────────────
export async function enqueueNotification(payload: NotificationJobPayload): Promise<void> {
  const queue = getNotificationQueue();
  if (!queue) return; // notifications are best-effort

  await queue.add("send", payload, { priority: 3 });
}

// ── Worker factory (only used in worker process, not in Next.js) ─────────────
export function createWorker<T>(
  queueName: QueueName,
  processor: (job: Job<T>) => Promise<unknown>
): Worker | null {
  const connection = getConnection();
  if (!connection) return null;

  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency: 3,
    limiter: { max: 10, duration: 1000 }, // max 10 jobs/sec
  });

  worker.on("completed", (job) => {
    console.log(`[Worker] ${queueName} job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] ${queueName} job ${job?.id} failed:`, err.message);
  });

  return worker;
}
