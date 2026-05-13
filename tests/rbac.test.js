const test = require('node:test');
const assert = require('node:assert/strict');
const { requirePermissions } = require('../src/middleware/rbac');
const { roleNames } = require('../src/utils/roles');
const { ApiError } = require('../src/utils/errors');

const runMiddleware = (middleware, req) =>
  new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err || null));
  });

test('requirePermissions allows super administrator', async () => {
  const middleware = requirePermissions('admin.audit.view');
  const err = await runMiddleware(middleware, {
    user: {
      id: 'user-id',
      roles: [roleNames.SUPER_ADMINISTRATOR],
      permissions: []
    }
  });

  assert.equal(err, null);
});

test('requirePermissions blocks missing permission', async () => {
  const middleware = requirePermissions('admin.audit.view');
  const err = await runMiddleware(middleware, {
    user: {
      id: 'user-id',
      roles: [roleNames.ADMINISTRATOR],
      permissions: ['admin.users.manage']
    }
  });

  assert.ok(err instanceof ApiError);
  assert.equal(err.statusCode, 403);
});

test('requirePermissions blocks missing user context', async () => {
  const middleware = requirePermissions('admin.audit.view');
  const err = await runMiddleware(middleware, {});

  assert.ok(err instanceof ApiError);
  assert.equal(err.statusCode, 401);
});
