// Post-deploy smoke test against the REAL project.
//
//   node smoke-prod.mjs
//
// Proves, against production rather than the emulator, that the chain the app
// depends on works end to end -- and that the rules deployed are the ones in
// this directory rather than test mode. It creates two throwaway anonymous
// accounts and a handful of documents, and deletes all of them before it exits,
// including on failure.
//
// Reads the project id, API key and database URL from the app's own
// google-services.json, so it tests exactly what a release build would use.
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const cfg = JSON.parse(readFileSync("../android/app/google-services.json", "utf8"));
const project = cfg.project_info.project_id;
const dbUrl = cfg.project_info.firebase_url;
const key = cfg.client[0].api_key[0].current_key;
const fs = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const dungeon = `smoke-${Date.now()}`;

const cleanup = [];
const ok = (msg) => console.log(`  ok  ${msg}`);

async function call(url, { method = "GET", token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function anonymousAccount() {
  const r = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
    method: "POST", body: { returnSecureToken: true },
  });
  assert.equal(r.status, 200, `anonymous sign-up failed: ${JSON.stringify(r.json)}`);
  const account = { uid: r.json.localId, token: r.json.idToken };
  cleanup.push(() => call(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${key}`, {
    method: "POST", body: { idToken: account.token },
  }));
  return account;
}

// A queue entry exactly as the app writes it: both times stamped by the server.
function enqueue(asUid, forUid, token) {
  return call(`${fs.replace("/documents", "/documents:commit")}`, {
    method: "POST",
    token,
    body: {
      writes: [{
        update: {
          name: `projects/${project}/databases/(default)/documents/queue/${forUid}`,
          fields: {
            uid: { stringValue: forUid },
            role: { stringValue: "HEALER" },
            dungeonId: { stringValue: dungeon },
          },
        },
        updateTransforms: [
          { fieldPath: "enqueuedAt", setToServerValue: "REQUEST_TIME" },
          { fieldPath: "lastSeen", setToServerValue: "REQUEST_TIME" },
        ],
      }],
    },
  });
}

async function main() {
  console.log(`project ${project}`);

  // Unauthenticated: nothing at all.
  assert.equal((await call(`${fs}/queue`)).status, 403);
  assert.match(JSON.stringify((await call(`${dbUrl}/.json`)).json), /Permission denied/);
  ok("signed-out clients are refused by both databases (not test mode)");

  const alice = await anonymousAccount();
  const mallory = await anonymousAccount();
  assert.notEqual(alice.uid, mallory.uid);
  ok("anonymous sign-in works and mints distinct ids");

  // Firestore: the queue.
  const joined = await enqueue(alice.uid, alice.uid, alice.token);
  assert.equal(joined.status, 200, JSON.stringify(joined.json));
  cleanup.push(() => call(`${fs}/queue/${alice.uid}`, { method: "DELETE", token: alice.token }));
  ok("a player can join the queue as themselves");

  const forged = await enqueue(mallory.uid, alice.uid, mallory.token);
  assert.equal(forged.status, 403, "mallory must not be able to queue as alice");
  const sniped = await call(`${fs}/queue/${alice.uid}`, { method: "DELETE", token: mallory.token });
  assert.equal(sniped.status, 403, "mallory must not be able to delete alice's entry");
  ok("nobody can queue as, or delete, somebody else");

  const read = await call(`${fs}/queue/${alice.uid}`, { token: mallory.token });
  assert.equal(read.status, 200);
  assert.ok(read.json.fields.lastSeen.timestampValue, "lastSeen must be a server timestamp");
  ok("the queue is readable by signed-in players, with server-stamped times");

  // Realtime Database: a room.
  const roomId = `${dungeon}_${alice.uid}`;
  const roomUrl = (who) => `${dbUrl}/rooms/${roomId}.json?auth=${who.token}`;
  const opened = await call(roomUrl(alice), {
    method: "PUT",
    body: {
      hostUid: alice.uid,
      members: { [alice.uid]: true },
      state: { tick: 0, json: "" },
      startedAt: { ".sv": "timestamp" },
    },
  });
  assert.equal(opened.status, 200, JSON.stringify(opened.json));
  cleanup.push(() => call(roomUrl(alice), { method: "DELETE" }));
  ok("a host can open its own room");

  assert.equal((await call(roomUrl(mallory))).status, 401, "a stranger must not read the room");
  const hijack = await call(`${dbUrl}/rooms/${roomId}/state.json?auth=${mallory.token}`, {
    method: "PUT", body: { tick: 999, json: "" },
  });
  assert.equal(hijack.status, 401, "a stranger must not forge the broadcast frame");
  ok("a stranger can neither read the room nor forge its frame");

  const closed = await call(roomUrl(alice), { method: "DELETE" });
  assert.equal(closed.status, 200);
  ok("the host can delete its room");

  console.log("\nall production checks passed");
}

try {
  await main();
} catch (e) {
  console.error(`\nFAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  // Newest first: documents before the accounts that own them.
  for (const undo of cleanup.reverse()) {
    try { await undo(); } catch { /* best effort */ }
  }
  console.log(`cleaned up ${cleanup.length} item(s)`);
}
