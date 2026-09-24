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
import {
  doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";

let env;

// A fresh entry, stamped by the server as the rules require.
const entry = (uid, role = "TANK") => ({
  uid,
  role,
  dungeonId: "d1",
  enqueuedAt: serverTimestamp(),
  lastSeen: serverTimestamp(),
});

// An entry as a killed app leaves it: last refreshed a long time ago. Seeded
// past the rules, since no client could ever write a time like this.
const abandoned = (uid) => ({
  ...entry(uid),
  enqueuedAt: Timestamp.fromMillis(Date.now() - 3_600_000),
  lastSeen: Timestamp.fromMillis(Date.now() - 3_600_000),
});

// A posted clear time, as the client writes it.
const time = (uid, ticks = 1000, dungeonId = "d1") => ({
  uid,
  dungeonId,
  ticks,
  cls: "MAGE",
  level: 10,
  at: serverTimestamp(),
});

const room = (host, members) => ({
  id: "r1",
  hostUid: host,
  dungeonId: "d1",
  pace: "normal",
  members: members.map((u, i) => ({ uid: u, unitId: `${i + 1}`, role: "DPS" })),
  memberUids: members,
  formedAtMs: Date.now(),
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
  // Start from nothing. These fixtures use fixed ids, so against a long-lived
  // emulator a second run would find its rooms already created and the
  // create-path rules would -- correctly -- refuse them.
  await env.clearFirestore();
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
    setDoc(doc(as("alice"), "queue/alice"), { ...entry("alice"), enqueuedAt: "soon" }),
  );
  // Nor may an entry carry anything the queue does not need.
  await assertFails(
    setDoc(doc(as("alice"), "queue/alice"), { ...entry("alice"), note: "hi" }),
  );
});

test("the queue is readable by any signed-in client, because matchmaking is", async () => {
  await seed((db) => setDoc(doc(db, "queue/alice"), entry("alice")));
  await assertSucceeds(getDoc(doc(as("bob"), "queue/alice")));
});

test("a room can only be created by its own host, who must be in it", async () => {
  await assertSucceeds(
    setDoc(doc(as("alice"), "rooms/d1_alice_bob"), room("alice", ["alice", "bob"])),
  );
  await assertFails(
    setDoc(doc(as("mallory"), "rooms/d1_alice_bob_2"), room("alice", ["alice", "bob"])),
  );
  await assertFails(
    setDoc(doc(as("mallory"), "rooms/d1_alice_bob_3"), room("mallory", ["alice", "bob"])),
  );
  // The id names the group, so an outsider cannot claim the room a group is
  // about to form even by naming themselves host and member.
  await assertFails(
    setDoc(doc(as("mallory"), "rooms/d1_alice_bob"), room("mallory", ["mallory"])),
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

test("queue times must be the server's, not the device's", async () => {
  // The longest wait hosts, so a backdated join would make you host of every
  // group; a forward-dated refresh would leave an entry that never looks dead.
  await assertFails(setDoc(doc(as("alice"), "queue/alice"), {
    ...entry("alice"), enqueuedAt: Timestamp.fromMillis(0),
  }));
  await assertFails(setDoc(doc(as("alice"), "queue/alice"), {
    ...entry("alice"), lastSeen: Timestamp.fromMillis(Date.now() + 3_600_000),
  }));
});

test("a refresh moves lastSeen and nothing else", async () => {
  await assertSucceeds(setDoc(doc(as("dana"), "queue/dana"), entry("dana")));
  await assertSucceeds(updateDoc(doc(as("dana"), "queue/dana"), { lastSeen: serverTimestamp() }));
  // Switching role mid-wait would let a player jump into whichever seat is free.
  await assertFails(updateDoc(doc(as("dana"), "queue/dana"), {
    lastSeen: serverTimestamp(), role: "HEALER",
  }));
  await assertFails(updateDoc(doc(as("dana"), "queue/dana"), {
    lastSeen: Timestamp.fromMillis(Date.now() + 3_600_000),
  }));
});

test("a player can re-join over their own leftover entry", async () => {
  // Otherwise one crash while queueing locks that player out for good.
  await seed((db) => setDoc(doc(db, "queue/erin"), abandoned("erin")));
  await assertSucceeds(setDoc(doc(as("erin"), "queue/erin"), entry("erin")));
});

test("anyone may sweep an abandoned entry, and nobody may sweep a live one", async () => {
  await seed(async (db) => {
    await setDoc(doc(db, "queue/ghost"), abandoned("ghost"));
    await setDoc(doc(db, "queue/fresh"), entry("fresh"));
  });
  // A live entry is still protected from strangers...
  await assertFails(deleteDoc(doc(as("mallory"), "queue/fresh")));
  // ...but one nobody has refreshed in an hour is everybody's to remove.
  await assertSucceeds(deleteDoc(doc(as("mallory"), "queue/ghost")));
});

test("a room cannot be dated in the future", async () => {
  // Or the members' clean-up rule could never apply to it.
  await assertFails(setDoc(doc(as("alice"), "rooms/d1_alice_later"), {
    ...room("alice", ["alice"]), formedAtMs: Date.now() + 86_400_000,
  }));
});

test("a member may delete an hour-old room, but not a fresh one", async () => {
  await seed(async (db) => {
    await setDoc(doc(db, "rooms/d1_alice_bob_old"), { ...room("alice", ["alice", "bob"]), formedAtMs: Date.now() - 7_200_000 });
    await setDoc(doc(db, "rooms/d1_alice_bob_new"), room("alice", ["alice", "bob"]));
  });
  // Deleting a fresh room would strand the players still looking for it.
  await assertFails(deleteDoc(doc(as("bob"), "rooms/d1_alice_bob_new")));
  await assertSucceeds(deleteDoc(doc(as("bob"), "rooms/d1_alice_bob_old")));
  await assertSucceeds(deleteDoc(doc(as("alice"), "rooms/d1_alice_bob_new")));
});

test("a player posts their own best time, and only improves it", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "times/d1_alice"), time("alice", 1000)));
  // Everyone reads the board: that is what a board is for.
  await assertSucceeds(getDoc(doc(as("bob"), "times/d1_alice")));
  await assertSucceeds(setDoc(doc(as("alice"), "times/d1_alice"), time("alice", 900)));
  // A slower run is not news, and nor is somebody else's record.
  await assertFails(setDoc(doc(as("alice"), "times/d1_alice"), time("alice", 1200)));
  await assertFails(setDoc(doc(as("mallory"), "times/d1_alice"), time("alice", 10)));
  await assertFails(deleteDoc(doc(as("mallory"), "times/d1_alice")));
});

test("a time must be one, and must sit under its own name", async () => {
  // The id says which dungeon and whose: a mismatch would let one player hold
  // a board full of entries.
  await assertFails(setDoc(doc(as("alice"), "times/d2_alice"), time("alice")));
  await assertFails(setDoc(doc(as("alice"), "times/d1_alice"), { ...time("alice"), ticks: 0 }));
  await assertFails(setDoc(doc(as("alice"), "times/d1_alice"), { ...time("alice"), ticks: "fast" }));
  await assertFails(setDoc(doc(as("alice"), "times/d1_alice"), { ...time("alice"), at: Timestamp.fromMillis(0) }));
  await assertFails(setDoc(doc(as("alice"), "times/d1_alice"), { ...time("alice"), extra: 1 }));
  await assertFails(setDoc(doc(anon(), "times/d1_anon"), time("anon")));
});
