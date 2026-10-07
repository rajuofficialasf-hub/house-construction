import type { Request, RequestHandler } from 'express';
import { AppError } from '../errors.js';
import type { AdminPrincipal } from './types.js';

// What an editor may touch. A main admin and an admin have every project; an editor has its
// assigned projects, or every project with "all projects", and may add and fill in but never
// change settings or serials. The session carries the scope, so a change applies on the next
// request. Rules: the P9b decisions in docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md

export function isEditor(admin: AdminPrincipal): boolean {
  return admin.role === 'editor';
}

/** Whether the admin may write in this project. Anything but an exact `true` falls back to the list. */
export function canEditProject(admin: AdminPrincipal, key: string): boolean {
  return admin.allProjects === true || admin.projects.includes(key);
}

/** Throws 403 unless the session's admin may write in this project. Call it before using the body. */
export function requireProjectScope(req: Request, key: string): void {
  if (!req.admin) throw new AppError('UNAUTHENTICATED', 'লগইন করুন');
  if (!canEditProject(req.admin, key)) {
    req.log.warn({ adminId: req.admin.id, project_key: key }, "write refused: outside the editor's projects");
    throw new AppError('FORBIDDEN', 'এই প্রকল্পে আপনার কাজের অনুমতি নেই');
  }
}

/** A guard that refuses every editor, "all projects" or not, with this 403 message. */
export function refuseEditor(message: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.admin) throw new AppError('UNAUTHENTICATED', 'লগইন করুন');
    if (isEditor(req.admin)) {
      req.log.warn({ adminId: req.admin.id }, 'write refused: not allowed for an editor');
      throw new AppError('FORBIDDEN', message);
    }
    next();
  };
}
