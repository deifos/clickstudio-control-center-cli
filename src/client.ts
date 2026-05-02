import { USER_AGENT } from './version.js';
import { CLIError, errAuth, errForbidden, errRateLimit, errNetwork, errAPI } from './output/errors.js';
import { CodeNotFound } from './output/codes.js';

export interface WhoAmI {
  tokenId: string;
  organizationId: string;
  agent: { id: string; name: string };
  scopes: string[];
  projectIds: string[];
  accessAllProjects: boolean;
}

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  projectCount: number;
}

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isAgent?: boolean;
}

export interface ProjectSummary {
  id: string;
  title: string;
  brainDump: string;
  artifactLinks: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  owner: UserSummary | null;
  taskCount: number;
}

export interface ProjectDetail extends Omit<ProjectSummary, 'taskCount'> {
  tasks: TaskSummary[];
  logs: { id: string; text: string; createdAt: string }[];
}

export interface TaskSummary {
  id: string;
  projectId?: string;
  title: string;
  description: string;
  columnId: string;
  section: string;
  position: number;
  assignees: UserSummary[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LogEntry {
  id: string;
  text: string;
  projectId: string;
  createdAt: string;
}

export interface IdeaSummary {
  id: string;
  title: string;
  description: string;
  links: string;
  source: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  capturedBy: UserSummary | null;
  promotedToProject?: { id: string; title: string } | null;
}

export interface IdeaNameSuggestion {
  id: string;
  name: string;
  domain: string;
  rationale: string;
  position: number;
}

export interface IdeaDetail extends IdeaSummary {
  nameSearchStatus: string;
  nameSuggestions: IdeaNameSuggestion[];
}

export interface NotificationItem {
  id: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ClientOptions {
  token: string;
  baseUrl: string;
  timeoutMs?: number;
}

export class CCCTLClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  whoami(): Promise<WhoAmI> {
    return this.request<WhoAmI>('GET', '/api/agent/whoami');
  }

  org(): Promise<OrgInfo> {
    return this.request<OrgInfo>('GET', '/api/agent/org');
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.request<ProjectSummary[]>('GET', '/api/agent/projects');
  }

  getProject(id: string): Promise<ProjectDetail> {
    return this.request<ProjectDetail>('GET', `/api/agent/projects/${encodeURIComponent(id)}`);
  }

  createProject(data: {
    title: string;
    brainDump?: string;
    artifactLinks?: string;
    state?: string;
  }): Promise<ProjectSummary> {
    return this.request('POST', '/api/agent/projects', data);
  }

  updateProject(
    id: string,
    data: { title?: string; brainDump?: string; artifactLinks?: string; state?: string },
  ): Promise<ProjectSummary> {
    return this.request('PATCH', `/api/agent/projects/${encodeURIComponent(id)}`, data);
  }

  listTasks(projectId: string): Promise<TaskSummary[]> {
    return this.request('GET', `/api/agent/tasks?project=${encodeURIComponent(projectId)}`);
  }

  getTask(id: string): Promise<TaskSummary> {
    return this.request('GET', `/api/agent/tasks/${encodeURIComponent(id)}`);
  }

  createTask(data: {
    projectId: string;
    title: string;
    description?: string;
    columnId?: string;
    status?: string;
    section?: string;
    assignToSelf?: boolean;
  }): Promise<TaskSummary> {
    return this.request('POST', '/api/agent/tasks', data);
  }

  updateTask(
    id: string,
    data: {
      title?: string;
      description?: string;
      columnId?: string;
      status?: string;
      section?: string;
      position?: number;
    },
  ): Promise<TaskSummary> {
    return this.request('PATCH', `/api/agent/tasks/${encodeURIComponent(id)}`, data);
  }

  createLog(data: { projectId: string; text: string }): Promise<LogEntry> {
    return this.request('POST', '/api/agent/logs', data);
  }

  listIdeas(opts: { status?: string; limit?: number } = {}): Promise<IdeaSummary[]> {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.request('GET', `/api/agent/ideas${qs ? `?${qs}` : ''}`);
  }

  getIdea(id: string): Promise<IdeaDetail> {
    return this.request('GET', `/api/agent/ideas/${encodeURIComponent(id)}`);
  }

  createIdea(data: {
    title: string;
    description?: string;
    links?: string | string[];
  }): Promise<IdeaSummary> {
    return this.request('POST', '/api/agent/ideas', data);
  }

  listNotifications(opts: { unread?: boolean; limit?: number } = {}): Promise<NotificationItem[]> {
    const params = new URLSearchParams();
    if (opts.unread) params.set('unread', 'true');
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.request('GET', `/api/agent/notifications${qs ? `?${qs}` : ''}`);
  }

  ackNotification(id: string): Promise<NotificationItem> {
    return this.request('PATCH', `/api/agent/notifications/${encodeURIComponent(id)}`, {});
  }

  ackAllNotifications(): Promise<{ updated: number }> {
    return this.request('PATCH', '/api/agent/notifications', { markAllRead: true });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let parsed: unknown = undefined;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      if (!res.ok) {
        const errorMessage =
          (parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as { error: unknown }).error)
            : null) ?? text ?? `HTTP ${res.status}`;
        const hint =
          parsed && typeof parsed === 'object' && 'hint' in parsed
            ? String((parsed as { hint: unknown }).hint)
            : undefined;

        switch (res.status) {
          case 401:
            throw errAuth(errorMessage);
          case 403:
            throw errForbidden(errorMessage, hint);
          case 404:
            // Use the not_found code so the CLI exits with code 2 (matching
            // the README's exit-code table) instead of api_error / code 7.
            throw new CLIError(CodeNotFound, errorMessage, hint);
          case 429:
            throw errRateLimit();
          default:
            throw errAPI(res.status, errorMessage);
        }
      }

      return parsed as T;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw errNetwork(new Error(`request timed out after ${this.timeoutMs}ms`));
      }
      // Re-throw CLIErrors as-is
      if (err instanceof Error && err.name === 'CLIError') throw err;
      // TypeError from fetch usually means network failure
      if (err instanceof TypeError) throw errNetwork(err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
