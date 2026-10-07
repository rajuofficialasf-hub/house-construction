import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors.js';
import { canEditProject, isEditor, refuseEditor, requireProjectScope } from './scope.js';
import type { AdminPrincipal } from './types.js';

const principal = (over: Partial<AdminPrincipal>): AdminPrincipal => ({
  id: '00000000-0000-0000-0000-000000000001',
  email: 'a@example.org',
  name: null,
  role: 'admin',
  allProjects: true,
  projects: [],
  ...over,
});

const MAIN = principal({ role: 'main_admin' });
const ADMIN = principal({ role: 'admin' });
const EDITOR_ALL = principal({ role: 'editor', allProjects: true });
const EDITOR_TIN = principal({ role: 'editor', allProjects: false, projects: ['housing', 'tin'] });
const EDITOR_NONE = principal({ role: 'editor', allProjects: false, projects: [] });

function fakeReq(admin?: AdminPrincipal) {
  const warn = vi.fn();
  return { req: { admin, log: { warn } } as unknown as Request, warn };
}

describe('canEditProject', () => {
  it.each([
    ['a main admin', MAIN, true],
    ['an admin', ADMIN, true],
    ['an editor with all projects', EDITOR_ALL, true],
    ['an editor assigned the key', EDITOR_TIN, true],
  ])('lets %s edit tin', (_label, admin, allowed) => {
    expect(canEditProject(admin, 'tin')).toBe(allowed);
  });

  it('refuses an editor a key outside its projects, and an editor with none', () => {
    expect(canEditProject(EDITOR_TIN, 'semi_pucca')).toBe(false);
    expect(canEditProject(EDITOR_NONE, 'tin')).toBe(false);
  });

  it('fails closed on a principal whose allProjects is not exactly true', () => {
    expect(canEditProject(principal({ role: 'editor', allProjects: 'yes' as unknown as boolean, projects: [] }), 'tin')).toBe(false);
  });
});

describe('isEditor', () => {
  it('is true only for the editor role', () => {
    expect([MAIN, ADMIN, EDITOR_ALL, EDITOR_TIN].map(isEditor)).toEqual([false, false, true, true]);
  });
});

describe('requireProjectScope', () => {
  it('passes an editor inside its projects', () => {
    const { req, warn } = fakeReq(EDITOR_TIN);
    expect(() => requireProjectScope(req, 'tin')).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses an editor outside its projects with 403, and logs the id and key', () => {
    const { req, warn } = fakeReq(EDITOR_TIN);
    expect(() => requireProjectScope(req, 'semi_pucca')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN', message: 'এই প্রকল্পে আপনার কাজের অনুমতি নেই' }),
    );
    expect(warn).toHaveBeenCalledWith({ adminId: EDITOR_TIN.id, project_key: 'semi_pucca' }, "write refused: outside the editor's projects");
  });

  it('answers 401 with no session', () => {
    const { req } = fakeReq(undefined);
    expect(() => requireProjectScope(req, 'tin')).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });
});

describe('refuseEditor', () => {
  const guard = refuseEditor('না');
  const run = (admin?: AdminPrincipal) => {
    const { req, warn } = fakeReq(admin);
    const next = vi.fn() as unknown as NextFunction;
    let error: unknown;
    try {
      guard(req, {} as Response, next);
    } catch (err) {
      error = err;
    }
    return { next, error, warn };
  };

  it('passes a main admin and an admin', () => {
    for (const admin of [MAIN, ADMIN]) expect(run(admin).next).toHaveBeenCalledOnce();
  });

  it('refuses every editor with 403, even one with all projects', () => {
    for (const admin of [EDITOR_ALL, EDITOR_TIN]) {
      const { next, error, warn } = run(admin);
      expect(next).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'FORBIDDEN', message: 'না' });
      expect(warn).toHaveBeenCalledWith({ adminId: admin.id }, 'write refused: not allowed for an editor');
    }
  });

  it('answers 401 with no session', () => {
    expect(run(undefined).error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
