import { USER_AGENT } from './version.js';
import { CLIError, DryRunPreview, errAuth, errForbidden, errRateLimit, errNetwork, errAPI } from './output/errors.js';
import { CodeNotFound, CodeUsage } from './output/codes.js';
import { isDryRun } from './config/config.js';
import { pushNotices } from './output/notices.js';

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

export interface MemberInfo extends UserSummary {
  role: string;
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
  isFavorite: boolean;
  favoritedBy: UserSummary[];
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

  listMembers(): Promise<MemberInfo[]> {
    return this.request<MemberInfo[]>('GET', '/api/agent/members');
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

  setProjectFavorite(id: string, favorite?: boolean): Promise<{ id: string; isFavorite: boolean }> {
    return this.request(
      'POST',
      `/api/agent/projects/${encodeURIComponent(id)}/favorite`,
      favorite === undefined ? {} : { favorite },
    );
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
    assigneeIds?: string[];
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
      assigneeIds?: string[];
    },
  ): Promise<TaskSummary> {
    return this.request('PATCH', `/api/agent/tasks/${encodeURIComponent(id)}`, data);
  }

  deleteTask(id: string): Promise<{ ok: boolean; id: string; title: string }> {
    return this.request('DELETE', `/api/agent/tasks/${encodeURIComponent(id)}`);
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

    // Dry-run only intercepts mutating verbs. Reads still hit the API so
    // alias/project resolvers and read-modify-write commands can compute
    // the correct payload before bailing out at the actual write.
    if (isDryRun() && method !== 'GET') {
      throw new DryRunPreview(method, url, body);
    }

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
        const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        const baseHint = obj && typeof obj.hint === 'string' ? obj.hint : undefined;
        // F2: backend now sends `field` on validation errors. Prepend it to
        // the hint so the user knows which input is bad without parsing the
        // message string.
        const field = obj && typeof obj.field === 'string' ? obj.field : undefined;
        const hint = field
          ? baseHint
            ? `field: ${field} — ${baseHint}`
            : `field: ${field}`
          : baseHint;

        switch (res.status) {
          case 400:
            // Validation errors are the caller's fault, not the API's. Use
            // the usage_error code so the exit (1) lines up with how
            // commander handles unknown-flag errors. The hint already
            // carries the `field:` prefix when the server provided one,
            // making the failure self-explanatory.
            throw new CLIError(CodeUsage, errorMessage, hint);
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

      // F1: backend may attach `warnings: string[]` to write responses to
      // surface fields it silently dropped. Strip them off the typed object
      // and push into the per-invocation notice queue so the writer renders
      // them without every command having to plumb a notice param.
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { warnings?: unknown }).warnings)) {
        const warns = (parsed as { warnings: unknown[] }).warnings;
        pushNotices(warns.filter((w): w is string => typeof w === 'string'));
        delete (parsed as { warnings?: unknown }).warnings;
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
