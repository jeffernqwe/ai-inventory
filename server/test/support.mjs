// Shared Phase 04 integration support: the real shipped Express app over HTTP,
// role helpers, and tracked cleanup of everything a test creates. Imports no
// test runner (no tests defined here) — test files build on these helpers.

import 'dotenv/config';

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import app from '../src/app.js';
import Business from '../src/models/business.model.js';
import User from '../src/models/user.model.js';
import { signAccessToken } from '../src/config/jwt.js';
import { ensureDb, disconnectDb } from './helpers.mjs';

const { ObjectId } = mongoose.Types;

let _seq = 0;
function next(prefix) {
  _seq += 1;
  return `${prefix}-${Date.now()}-${_seq}`;
}

export function uniqueEmail(prefix = 'p04') {
  return `${next(prefix)}@example.com`;
}

export function uniqueName(prefix) {
  return next(prefix);
}

/** Starts the shipped app (real routers + middleware) on an ephemeral port. */
export async function startServer() {
  const dbOk = await ensureDb();
  if (!dbOk) return { dbOk: false, baseUrl: null, server: null };
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { dbOk: true, baseUrl: `http://127.0.0.1:${server.address().port}`, server };
}

/** fetch wrapper over the running server. */
export function makeApi(baseUrl) {
  return async function api(method, path, { token, body } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
}

/**
 * Tracks created users/businesses and deletes them (plus every child document)
 * so repeated test runs leave the shared dev database clean.
 */
export function createTracker(dbOk) {
  const businessIds = [];
  const userIds = [];
  return {
    trackBusiness(id) {
      if (id) businessIds.push(String(id));
    },
    trackUser(id) {
      if (id) userIds.push(String(id));
    },
    businessCount() {
      return businessIds.length;
    },
    async cleanup() {
      if (!dbOk) return;
      const biz = businessIds.map((x) => new ObjectId(x));
      const users = userIds.map((x) => new ObjectId(x));
      const db = mongoose.connection.db;
      const deleteByBusiness = async (collection) => {
        if (!biz.length) return;
        try {
          await db.collection(collection).deleteMany({ businessId: { $in: biz } });
        } catch {
          /* best effort */
        }
      };
      await deleteByBusiness('inventory_transactions');
      await deleteByBusiness('inventory');
      await deleteByBusiness('products');
      await deleteByBusiness('categories');
      await deleteByBusiness('locations');
      await deleteByBusiness('audit_logs');
      // AI conversations/messages have no businessId on the message, so remove
      // messages by the conversations owned by these businesses first.
      if (biz.length) {
        try {
          const convs = await db
            .collection('ai_conversations')
            .find({ businessId: { $in: biz } }, { projection: { _id: 1 } })
            .toArray();
          const cids = convs.map((c) => c._id);
          if (cids.length) {
            await db.collection('ai_messages').deleteMany({ conversationId: { $in: cids } });
          }
          await db.collection('ai_conversations').deleteMany({ businessId: { $in: biz } });
        } catch {
          /* best effort */
        }
      }
      await deleteByBusiness('businesses');
      if (users.length) {
        try {
          await db.collection('users').deleteMany({ _id: { $in: users } });
        } catch {
          /* best effort */
        }
      }
    },
  };
}

/**
 * Registers a brand-new business + OWNER over the real /api/auth/register and
 * returns an authenticated owner session.
 */
export async function registerOwner(api, tracker) {
  const email = uniqueEmail('owner');
  const password = 'Password123!';
  const reg = await api('POST', '/api/auth/register', {
    body: { businessName: uniqueName('Biz'), name: uniqueName('Owner'), email, password },
  });
  if (reg.status !== 201) {
    throw new Error(`registerOwner failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  }
  tracker.trackBusiness(reg.json.business.id);
  tracker.trackUser(reg.json.user.id);
  const login = await api('POST', '/api/auth/login', { body: { email, password } });
  if (login.status !== 200) {
    throw new Error(`registerOwner login failed: ${login.status} ${JSON.stringify(login.json)}`);
  }
  return {
    token: login.json.token,
    userId: reg.json.user.id,
    businessId: reg.json.business.id,
  };
}

/**
 * Creates a user directly in the database with the given role (there is no
 * /api/users route yet) so role-guarded Phase 04 endpoints can be exercised as
 * ADMIN/MANAGER/STAFF. Reuses an existing business when businessId is given.
 */
export async function makeRoleUser({ role, businessId }, tracker) {
  let bid = businessId;
  if (!bid) {
    const business = await Business.create({ name: uniqueName('Biz') });
    bid = String(business._id);
    tracker.trackBusiness(bid);
  }
  const user = await User.create({
    businessId: new ObjectId(bid),
    name: uniqueName(role),
    email: uniqueEmail(role.toLowerCase()),
    passwordHash: bcrypt.hashSync('Password123!', 10),
    role,
    status: 'ACTIVE',
  });
  tracker.trackUser(String(user._id));
  return {
    userId: String(user._id),
    businessId: bid,
    token: signAccessToken(user._id),
  };
}

export { disconnectDb };
