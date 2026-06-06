// Auto-generated module stubs for packages not yet installed.
// Run `npm install` to install real implementations.

// ── zustand ──────────────────────────────────────────────────────────────────
declare module "zustand" {
  export type StateCreator<T> = (set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void, get: () => T) => T;
  export function create<T>(creator: StateCreator<T>): () => T;
  export function create<T>(): (creator: StateCreator<T>) => () => T;
}

declare module "zustand/middleware" {
  export function persist<T>(creator: any, options?: any): any;
  export function devtools<T>(creator: any, options?: any): any;
  export function immer<T>(creator: any): any;
}

// ── @sentry/nextjs ───────────────────────────────────────────────────────────
declare module "@sentry/nextjs" {
  export function init(options: Record<string, any>): void;
  export function captureException(error: unknown, context?: Record<string, any>): string;
  export function captureMessage(message: string, context?: Record<string, any>): string;
  export function withScope(callback: (scope: any) => void): void;
  export function setTag(key: string, value: string): void;
  export function setContext(key: string, value: Record<string, any>): void;
  export function addBreadcrumb(breadcrumb: Record<string, any>): void;
  export const Scope: any;
  export const SDK_VERSION: string;
}

// ── @upstash/redis ───────────────────────────────────────────────────────────
declare module "@upstash/redis" {
  export class Redis {
    constructor(options: { url: string; token: string });
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, options?: any): Promise<void>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    pipeline(): any;
    eval(script: string, ...args: any[]): Promise<any>;
    static fromEnv(): Redis;
  }
}

// ── @upstash/ratelimit ───────────────────────────────────────────────────────
declare module "@upstash/ratelimit" {
  import type { Redis } from "@upstash/redis";
  export class Ratelimit {
    constructor(options: { redis: Redis; limiter: any; prefix?: string });
    limit(identifier: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }>;
    static slidingWindow(requests: number, window: string): any;
    static fixedWindow(requests: number, window: string): any;
  }
}

// ── bullmq ───────────────────────────────────────────────────────────────────
declare module "bullmq" {
  export class Queue {
    constructor(name: string, options?: any);
    add(name: string, data: any, options?: any): Promise<any>;
    getJob(id: string): Promise<any>;
    getJobs(types: string[]): Promise<any[]>;
    close(): Promise<void>;
  }
  export class Worker {
    constructor(name: string, processor: (job: Job) => Promise<any>, options?: any);
    on(event: string, listener: (...args: any[]) => void): this;
    close(): Promise<void>;
  }
  export class Job {
    id: string;
    data: any;
    name: string;
    progress: number;
    updateProgress(value: number): Promise<void>;
    log(message: string): Promise<void>;
    opts: any;
  }
  export class QueueEvents {
    constructor(name: string, options?: any);
    on(event: string, listener: (...args: any[]) => void): this;
    close(): Promise<void>;
  }
}

// ── ioredis ──────────────────────────────────────────────────────────────────
declare module "ioredis" {
  export default class Redis {
    constructor(url?: string, options?: any);
    constructor(options?: any);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<any>;
    del(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    quit(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): this;
    duplicate(): Redis;
  }
}

// ── @octokit/rest ────────────────────────────────────────────────────────────
declare module "@octokit/rest" {
  export class Octokit {
    constructor(options?: { auth?: string; baseUrl?: string });
    repos: {
      get(params: any): Promise<{ data: any }>;
      getContent(params: any): Promise<{ data: any }>;
      createOrUpdateFileContents(params: any): Promise<{ data: any }>;
      listForAuthenticatedUser(params?: any): Promise<{ data: any[] }>;
      createForAuthenticatedUser(params: any): Promise<{ data: any }>;
    };
    git: {
      getRef(params: any): Promise<{ data: any }>;
      createRef(params: any): Promise<{ data: any }>;
      getCommit(params: any): Promise<{ data: any }>;
      createCommit(params: any): Promise<{ data: any }>;
      createTree(params: any): Promise<{ data: any }>;
      updateRef(params: any): Promise<{ data: any }>;
    };
    pulls: {
      create(params: any): Promise<{ data: any }>;
      list(params: any): Promise<{ data: any[] }>;
    };
    users: {
      getAuthenticated(): Promise<{ data: any }>;
    };
    issues: {
      createComment(params: any): Promise<{ data: any }>;
    };
    paginate(method: any, params?: any): Promise<any[]>;
  }
}

// ── @radix-ui/react-slider ───────────────────────────────────────────────────
declare module "@radix-ui/react-slider" {
  import type { FC, ComponentPropsWithoutRef, ElementRef } from "react";
  export const Root: FC<any>;
  export const Track: FC<any>;
  export const Range: FC<any>;
  export const Thumb: FC<any>;
}

// ── @webcontainer/api ────────────────────────────────────────────────────────
declare module "@webcontainer/api" {
  export interface WebContainerProcess {
    output: ReadableStream<string>;
    exit: Promise<number>;
    kill(): void;
    input: WritableStream<string>;
  }
  export interface FileSystemTree {
    [name: string]: FileNode | DirectoryNode;
  }
  export interface FileNode {
    file: { contents: string | Uint8Array };
  }
  export interface DirectoryNode {
    directory: FileSystemTree;
  }
  export class WebContainer {
    static boot(): Promise<WebContainer>;
    mount(tree: FileSystemTree): Promise<void>;
    spawn(command: string, args?: string[], options?: any): Promise<WebContainerProcess>;
    fs: {
      readFile(path: string, encoding: string): Promise<string>;
      writeFile(path: string, data: string): Promise<void>;
      mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
      readdir(path: string): Promise<string[]>;
    };
    on(event: string, listener: (...args: any[]) => void): void;
    teardown(): void;
  }
}

// ── next-themes ──────────────────────────────────────────────────────────────
declare module "next-themes/dist/types" {
  export interface ThemeProviderProps {
    children?: React.ReactNode;
    attribute?: string;
    defaultTheme?: string;
    enableSystem?: boolean;
    disableTransitionOnChange?: boolean;
    storageKey?: string;
    themes?: string[];
    value?: Record<string, string>;
    forcedTheme?: string;
    nonce?: string;
  }
}
