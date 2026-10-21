/**
 * All API endpoints used by the app — single source of truth.
 * Every API call should reference these instead of hardcoding paths.
 */

export const ENDPOINTS = {
  // Auth
  AUTH_BOOTSTRAP: '/auth/bootstrap',

  // Profile
  ME: '/me',

  // Assistant (Jenny)
  ASSISTANT_ASK: '/assistant/ask',
  ASSISTANT_BRIEFING: '/assistant/briefing',
  ASSISTANT_CONFIRM: '/assistant/confirm',
  ASSISTANT_CHECKIN: '/assistant/checkin',
  ASSISTANT_VOCABULARY: '/assistant/vocabulary',
  ASSISTANT_UPLOAD: '/assistant/upload',
  ASSISTANT_FILE: '/assistant/file',
  ASSISTANT_MEDIA: '/assistant/media',
  ASSISTANT_IMAGINE: '/assistant/imagine',
  ASSISTANT_IMAGINE_OPTIONS: '/assistant/imagine/options',

  // Projects
  PROJECTS: '/projects',

  // Tasks
  TASKS: '/tasks',

  // Vendors
  VENDORS: '/vendors',
  PURCHASE_ORDERS: '/purchase-orders',

  // Emails
  EMAILS: '/emails',
  DRAFTS: '/drafts',

  // Documents
  DOCUMENTS: '/documents',

  // Follow-ups
  FOLLOW_UPS: '/follow-ups',

  // Dashboard
  DASHBOARD: '/dashboard',

  // Activity & Usage
  ACTIVITY: '/activity',
  USAGE: '/usage',

  // Settings
  SETTINGS: '/settings',
  SETTINGS_AI: '/settings/ai',
  SETTINGS_AI_KEY: '/settings/ai/key',
  SETTINGS_AI_MODEL: '/settings/ai/model',
  SETTINGS_OPENAI: '/settings/openai',
  SETTINGS_OPENAI_KEY: '/settings/openai/key',
  SETTINGS_OPENAI_MODEL: '/settings/openai/model',
  SETTINGS_AI_ROUTING: '/settings/ai-routing',
  SETTINGS_AI_ROUTING_GEMINI_KEY: '/settings/ai-routing/gemini-key',
  SETTINGS_AI_ROUTING_TEST: '/settings/ai-routing/test',
  SETTINGS_SLACK: '/settings/slack',
  SETTINGS_INGEST: '/settings/ingest',
  SETTINGS_SYNC: '/settings/sync',
  SETTINGS_USAGE_LINK: '/usage/link',
  SETTINGS_SLA: '/settings/sla',
  SETTINGS_GOOGLE_URL: '/auth/google/url',
  SETTINGS_GOOGLE_DISCONNECT: '/auth/google',

  // Team & Permissions
  TEAM: '/team',
  PERMISSIONS: '/permissions',

  // Login history
  LOGIN_HISTORY: '/login-history',
} as const;

export type EndpointKey = keyof typeof ENDPOINTS;
