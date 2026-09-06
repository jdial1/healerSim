// Security rules for the public queue, run against the Firestore emulator.
//
// No Firebase project and no Google account: `firebase emulators:exec` boots a
// local auth + firestore pair against the fake project id in .firebaserc, so
// these are runnable by anyone who clones the repo.
//
// The rules are the only part of a client-only matchmaker that is actually
// enforced. Everything else -- who hosts, who gets a seat -- is agreed between
// clients running the same pure function, and a client that lies about that is
// a client that gets a worse game. A client that could delete other people's
// queue entries, or forge their casts, would be everyone else's problem, so
// those are the cases pinned here.
import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

let env;

const entry = (uid, role = "TANK") => ({
  uid,
  role,
  dungeonId: "d1",
  enqueuedAtMs: 1000,
});

const room = (host, members) => ({
  id: "r1",
  hostUid: host,
  dungeonId: "d1",
  pace: "normal",
  members: members.map((u, i) => ({ uid: u, unitId: `${i + 1}`, role: "DPS" })),
  memberUids: members,
  formedAtMs: 1000,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "overheal-local",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

after(async () => {
  await env?.cleanup();
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// Seeds a document past the rules, for cases that need existing data.
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

test("a signed-out client can do nothing at all", async () => {
  await assertFails(setDoc(doc(anon(), "queue/alice"), entry("alice")));
  await assertFails(getDoc(doc(anon(), "queue/alice")));
});

test("a player can join and leave the queue as themselves", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "queue/alice"), entry("alice")));
  await assertSucceeds(deleteDoc(doc(as("alice"), "queue/alice")));
});

test("a player cannot queue as somebody else", async () => {
  await assertFails(setDoc(doc(as("mallory"), "queue/alice"), entry("alice")));
  // Nor claim their own id while writing a document that names another.
  await assertFails(setDoc(doc(as("mallory"), "queue/mallory"), entry("alice")));
});

test("a player cannot snipe another player out of the queue", async () => {
  // Without this, one client could empty the queue and nobody would ever match.
  await seed((db) => setDoc(doc(db, "queue/alice"), entry("alice")));
  await assertFails(deleteDoc(doc(as("mallory"), "queue/alice")));
});

test("a garbage queue entry is refused", async () => {
  await assertFails(
    setDoc(doc(as("alice"), "queue/alice"), { ...entry("alice"), role: "GOD" }),
  );
  await assertFails(
    setDoc(doc(as("alice"), "queue/alice"), { ...entry("alice"), enqueuedAtMs: "soon" }),
  );
});

test("the queue is readable by any signed-in client, because matchmaking is", async () => {
  await seed((db) => setDoc(doc(db, "queue/alice"), entry("alice")));
  await assertSucceeds(getDoc(doc(as("bob"), "queue/alice")));
});

test("a room can only be created by its own host, who must be in it", async () => {
  await assertSucceeds(
    setDoc(doc(as("alice"), "rooms/r1"), room("alice", ["alice", "bob"])),
  );
  await assertFails(
    setDoc(doc(as("mallory"), "rooms/r2"), room("alice", ["alice", "bob"])),
  );
  await assertFails(
    setDoc(doc(as("mallory"), "rooms/r3"), room("mallory", ["alice", "bob"])),
  );
});

test("only members can read a room", async () => {
  await seed((db) => setDoc(doc(db, "rooms/r1"), room("alice", ["alice", "bob"])));
  await assertSucceeds(getDoc(doc(as("bob"), "rooms/r1")));
  await assertFails(getDoc(doc(as("carol"), "rooms/r1")));
});

test("only the host can write the room, and cannot hand it to an outsider", async () => {
  await seed((db) => setDoc(doc(db, "rooms/r1"), room("alice", ["alice", "bob"])));
  const guestWrite = setDoc(
    doc(as("bob"), "rooms/r1"),
    room("bob", ["alice", "bob"]),
  );
  await assertFails(guestWrite);
  // Host migration is a legitimate host write, to another member.
  await assertSucceeds(
    setDoc(doc(as("alice"), "rooms/r1"), room("bob", ["alice", "bob"])),
  );
  // But not to somebody who is not in the room.
  await seed((db) => setDoc(doc(db, "rooms/r2"), room("alice", ["alice", "bob"])));
  await assertFails(
    setDoc(doc(as("alice"), "rooms/r2"), room("carol", ["alice", "bob"])),
  );
});

test("a member writes only their own action stream", async () => {
  await seed((db) => setDoc(doc(db, "rooms/r1"), room("alice", ["alice", "bob"])));
  await assertSucceeds(setDoc(doc(as("bob"), "rooms/r1/actions/bob"), { n: 1 }));
  // Forging a cast as another player is refused here, not trusted to the host.
  await assertFails(setDoc(doc(as("bob"), "rooms/r1/actions/alice"), { n: 1 }));
  // And an outsider has no stream at all.
  await assertFails(setDoc(doc(as("carol"), "rooms/r1/actions/carol"), { n: 1 }));
});
